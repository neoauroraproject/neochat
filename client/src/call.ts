import { create } from "zustand";
import { get } from "./api";
import { translate } from "./i18n";
import { audio } from "./notify";
import { useApp } from "./store";
import type { User } from "./types";
import { onEvent, wsSend } from "./ws";
import { releaseMic } from "./voice";
import { askMotionPermission } from "./app/EarGuard";

type Phase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

/** Link quality from getStats: round trip, packet loss and incoming bitrate. */
export interface NetStats {
  rtt: number; // ms
  loss: number; // 0..1 over the last sample
  kbps: number;
  quality: "good" | "fair" | "poor";
}

interface CallState {
  phase: Phase;
  callId: string | null;
  peer: User | null;
  chatId: number | null;
  video: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  /** Audio output picked from the speaker menu ("" = the system default). */
  outputId: string;
  minimized: boolean;
  reconnecting: boolean;
  /** The other side's socket dropped; the server holds the call for them for a while. */
  peerAway: boolean;
  net: NetStats | null;
  /** Shown once per call when video struggles on a weak link. */
  weakHint: boolean;
  /** What the other side told us about itself (mic, camera, app in the background). */
  peerState: { muted: boolean; cameraOff: boolean; away: boolean };
  /** The other side turned on their camera in a voice call: offer to turn ours on too. */
  videoAsk: boolean;
  /** Desktop: the call's chat is open beside the call. */
  chatOpen: boolean;
  /** Full-screen call: show our own camera large and theirs in the corner. */
  swapped: boolean;
  answeredAt: number;
  endReason: string;
  facing: "user" | "environment";
  start(peer: User, video: boolean): Promise<void>;
  accept(): Promise<void>;
  hangup(): void;
  toggleMute(): void;
  toggleCamera(): void;
  setOutput(id: string): void;
  flip(): Promise<void>;
  setMinimized(v: boolean): void;
  setChatOpen(v: boolean): void;
  toggleSwap(): void;
  dismissVideoAsk(): void;
}

let pc: RTCPeerConnection | null = null;
let ref = "";
let pendingCandidates: RTCIceCandidateInit[] = [];
let restarts = 0;
let restartTimer: number | undefined;
let downSince = 0;
let statsTimer: number | undefined;
let poorRuns = 0;
let hintShown = false;
let lastIn: { bytes: number; lost: number; recv: number; at: number } | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

/** Gives up on a connection that stayed down this long (matches the server's grace period). */
const RECOVER_MS = 30_000;
let tone: { stop(): void } | null = null;

const t = (k: Parameters<typeof translate>[1]) => translate(useApp.getState().lang, k);

/** Ringback (caller) and ringtone (callee) synthesized with WebAudio. */
function playTone(kind: "ringback" | "ring") {
  stopTone();
  const ctx = audio();
  if (!ctx) return;
  let stopped = false;
  const beep = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const freqs = kind === "ring" ? [659, 784, 988] : [440, 480];
    const len = kind === "ring" ? 0.18 : 1.4;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      const start = kind === "ring" ? now + i * 0.2 : now;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(kind === "ring" ? 0.18 : 0.06, start + 0.03);
      g.gain.setValueAtTime(kind === "ring" ? 0.18 : 0.06, start + len - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + len + 0.05);
    });
    if (kind === "ring") navigator.vibrate?.([300, 150, 300]);
  };
  beep();
  const id = window.setInterval(beep, kind === "ring" ? 2200 : 4000);
  tone = {
    stop() {
      stopped = true;
      window.clearInterval(id);
      navigator.vibrate?.(0);
    },
  };
}

function stopTone() {
  tone?.stop();
  tone = null;
}

const camera = (facing: "user" | "environment"): MediaTrackConstraints => ({
  facingMode: facing,
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
});

async function getMedia(video: boolean, facing: "user" | "environment" = "user") {
  // A microphone still held for voice messages can block the call's own on some phones.
  releaseMic();
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: video ? camera(facing) : false,
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw e;
    // The camera is picky about the size or busy elsewhere: plain settings, then sound only.
    if (video) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio, video: true });
      } catch {
        /* try without the camera */
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio });
  }
}

/**
 * Browsers protect the frame rate of a camera by default, so on a busy link or a slow phone the
 * picture drops to a blurry low resolution first. Allow up to 2.5 Mbps and trade frame rate and
 * resolution evenly instead. Called after every negotiation, since encodings appear only then.
 */
async function tuneVideo(conn: RTCPeerConnection) {
  for (const sender of conn.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    const p = sender.getParameters();
    if (!p.encodings?.length) continue;
    p.encodings.forEach((e) => {
      e.maxBitrate = 2_500_000;
      e.maxFramerate = 30;
      e.scaleResolutionDownBy = 1;
    });
    (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
      "balanced";
    try {
      await sender.setParameters(p);
    } catch {
      /* older browsers reject some fields; the defaults still work */
    }
  }
}

async function createPeer(): Promise<RTCPeerConnection> {
  let iceServers: RTCIceServer[] = [];
  try {
    iceServers = (await get<{ iceServers: RTCIceServer[] }>("/api/calls/ice")).iceServers;
  } catch {
    /* host candidates still work on the same network */
  }
  const conn = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
  const st = useCall.getState();
  st.localStream?.getTracks().forEach((tr) => conn.addTrack(tr, st.localStream!));
  const remote = new MediaStream();
  useCall.setState({ remoteStream: remote });
  conn.ontrack = (e) => {
    e.streams[0]?.getTracks().forEach((tr) => {
      if (!remote.getTracks().includes(tr)) remote.addTrack(tr);
    });
    if (!e.streams[0] && !remote.getTracks().includes(e.track)) remote.addTrack(e.track);
    useCall.setState({ remoteStream: remote });
    if (e.track.kind === "video") {
      // A camera turned on mid-call (voice -> video): the view follows the picture.
      const show = () => useCall.setState({ video: true, remoteStream: remote });
      e.track.addEventListener("unmute", show);
      if (!e.track.muted) show();
    }
  };
  // After the first connection either side may renegotiate (a camera added mid-call). This is the
  // "perfect negotiation" pattern: the callee is polite and yields when two offers cross.
  conn.onnegotiationneeded = async () => {
    if (!established || pc !== conn) return;
    try {
      makingOffer = true;
      await conn.setLocalDescription();
      signal({ type: conn.localDescription!.type, sdp: conn.localDescription!.sdp });
    } catch {
      /* the next negotiationneeded retries */
    } finally {
      makingOffer = false;
    }
  };
  conn.onicecandidate = (e) => {
    if (e.candidate) signal({ type: "candidate", candidate: e.candidate.toJSON() });
  };
  conn.onconnectionstatechange = () => {
    if (pc !== conn) return;
    const s = conn.connectionState;
    if (s === "connected") {
      tuneVideo(conn);
      window.clearTimeout(restartTimer);
      restarts = 0;
      downSince = 0;
      useCall.setState((st) => ({
        phase: "active",
        reconnecting: false,
        answeredAt: st.answeredAt || Date.now(),
      }));
      established = true;
      startStats();
      keepAwake();
      sendState();
      setupMediaSession();
    } else if (s === "disconnected") {
      // Often recovers by itself within a second or two (a brief Wi-Fi hiccup); restart if not.
      useCall.setState({ reconnecting: true });
      if (!downSince) downSince = Date.now();
      window.clearTimeout(restartTimer);
      restartTimer = window.setTimeout(() => {
        if (pc === conn && conn.connectionState !== "connected") restartIce();
      }, 2500);
    } else if (s === "failed") {
      useCall.setState({ reconnecting: true });
      if (!downSince) downSince = Date.now();
      restartIce();
    }
  };
  return conn;
}

let isCaller = false;
let established = false;
let makingOffer = false;

/** Tells the other side about our mic, camera and whether the app is in the background. */
export function sendState() {
  const st = useCall.getState();
  if (!pc || st.phase !== "active") return;
  signal({
    type: "state",
    muted: st.muted,
    cameraOff: st.cameraOff || !st.localStream?.getVideoTracks().length,
    away: document.visibilityState === "hidden",
  });
}
document.addEventListener("visibilitychange", sendState);

/**
 * System controls for the call: Chrome shows these on the picture-in-picture window and can enter
 * picture-in-picture by itself when the user leaves the app (Media Session video-conferencing).
 */
function setupMediaSession() {
  const ms = navigator.mediaSession as MediaSession & {
    setMicrophoneActive?(v: boolean): void;
    setCameraActive?(v: boolean): void;
  };
  if (!ms) return;
  const set = (action: string, fn: (() => void) | null) => {
    try {
      ms.setActionHandler(action as MediaSessionAction, fn);
    } catch {
      /* this browser does not know the action */
    }
  };
  set("togglemicrophone", () => useCall.getState().toggleMute());
  set("togglecamera", () => useCall.getState().toggleCamera());
  set("hangup", () => useCall.getState().hangup());
  set("enterpictureinpicture", () => {
    import("./pip").then((m) => m.enterSystemPip());
  });
  syncMediaSession();
}

export function syncMediaSession() {
  const ms = navigator.mediaSession as
    | (MediaSession & {
        setMicrophoneActive?(v: boolean): void;
        setCameraActive?(v: boolean): void;
      })
    | undefined;
  const st = useCall.getState();
  try {
    ms?.setMicrophoneActive?.(!st.muted);
    ms?.setCameraActive?.(!st.cameraOff && !!st.localStream?.getVideoTracks().length);
  } catch {
    /* older browsers */
  }
}

function clearMediaSession() {
  const ms = navigator.mediaSession;
  if (!ms) return;
  for (const a of ["togglemicrophone", "togglecamera", "hangup", "enterpictureinpicture"])
    try {
      ms.setActionHandler(a as MediaSessionAction, null);
    } catch {
      /* unknown action */
    }
}

/**
 * Re-gathers network paths after a switch (Wi-Fi <-> mobile data). Only the caller makes offers, so
 * two restarts can never collide; the callee asks the caller for one. Retries with growing gaps
 * until the link is back or RECOVER_MS has passed.
 */
function restartIce() {
  const conn = pc;
  if (!conn || !useCall.getState().callId) return;
  if (!downSince) downSince = Date.now();
  if (Date.now() - downSince > RECOVER_MS) {
    useCall.getState().hangup();
    return;
  }
  window.clearTimeout(restartTimer);
  const attempt = restarts++;
  if (isCaller) {
    (async () => {
      // An earlier restart offer that never got an answer (signaling was down too) is replaced.
      if (conn.signalingState === "have-local-offer")
        await conn.setLocalDescription({ type: "rollback" });
      if (conn.signalingState !== "stable" || pc !== conn) return;
      const offer = await conn.createOffer({ iceRestart: true });
      await conn.setLocalDescription(offer);
      signal({ type: "offer", sdp: offer.sdp });
    })().catch(() => {});
  } else signal({ type: "restart" });
  // Check again later; a restart that went nowhere (signaling was down too) is simply repeated.
  restartTimer = window.setTimeout(
    () => {
      if (pc === conn && conn.connectionState !== "connected") restartIce();
    },
    Math.min(8000, 2000 * 2 ** attempt),
  );
}

/** Samples the link every 2 s for the quality badge and the "switch to voice" hint. */
function startStats() {
  if (statsTimer) return;
  lastIn = null;
  poorRuns = 0;
  statsTimer = window.setInterval(async () => {
    const conn = pc;
    if (!conn) return;
    let rtt = 0;
    let bytes = 0;
    let lost = 0;
    let recv = 0;
    try {
      const report = await conn.getStats();
      report.forEach((r: any) => {
        if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated)
          rtt = (r.currentRoundTripTime || 0) * 1000;
        if (r.type === "inbound-rtp") {
          bytes += r.bytesReceived || 0;
          lost += r.packetsLost || 0;
          recv += r.packetsReceived || 0;
        }
      });
    } catch {
      return;
    }
    const now = Date.now();
    const prev = lastIn;
    lastIn = { bytes, lost, recv, at: now };
    if (!prev) return;
    const dLost = Math.max(0, lost - prev.lost);
    const dRecv = Math.max(0, recv - prev.recv);
    const loss = dLost + dRecv > 0 ? dLost / (dLost + dRecv) : 0;
    const kbps = ((bytes - prev.bytes) * 8) / Math.max(1, now - prev.at);
    const quality: NetStats["quality"] =
      rtt > 600 || loss > 0.1 ? "poor" : rtt > 300 || loss > 0.03 ? "fair" : "good";
    const st = useCall.getState();
    poorRuns = quality === "poor" ? poorRuns + 1 : 0;
    let weakHint = st.weakHint;
    if (!hintShown && poorRuns >= 3 && st.video && !st.cameraOff && st.phase === "active") {
      hintShown = true;
      weakHint = true;
    }
    useCall.setState({
      net: { rtt: Math.round(rtt), loss, kbps: Math.round(kbps), quality },
      weakHint,
    });
  }, 2000);
}

/** Keeps the screen on during a video call (it would dim mid-conversation otherwise). */
async function keepAwake() {
  const st = useCall.getState();
  if (!st.video || wakeLock || document.visibilityState !== "visible") return;
  const nav = navigator as Navigator & {
    wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> } & EventTarget> };
  };
  try {
    const lock = await nav.wakeLock?.request("screen");
    if (!lock) return;
    wakeLock = lock;
    lock.addEventListener("release", () => {
      if (wakeLock === lock) wakeLock = null;
    });
  } catch {
    /* denied or unsupported (older iOS); the call still works */
  }
}

document.addEventListener("visibilitychange", () => {
  // The system drops the lock whenever the app is hidden; take it again on return.
  if (document.visibilityState === "visible" && useCall.getState().phase === "active") {
    keepAwake();
    reviveCamera();
  }
});

/**
 * iOS stops the camera while the app is in the background. Back in the app, a camera that was on
 * is started again; one the user turned off stays off.
 */
async function reviveCamera() {
  const st = useCall.getState();
  const stream = st.localStream;
  if (!stream || !pc || !st.video || st.cameraOff) return;
  const live = stream.getVideoTracks().filter((tr) => tr.readyState === "live");
  if (live.length) return;
  let track: MediaStreamTrack;
  try {
    track = (
      await navigator.mediaDevices.getUserMedia({ video: camera(st.facing) })
    ).getVideoTracks()[0];
  } catch {
    return;
  }
  if (useCall.getState().cameraOff || !pc) {
    track.stop();
    return;
  }
  stream.getVideoTracks().forEach((tr) => stream.removeTrack(tr));
  stream.addTrack(track);
  const sender = pc
    .getTransceivers()
    .find(
      (x) =>
        x.receiver.track.kind === "video" &&
        (!x.sender.track || x.sender.track.readyState === "ended"),
    )?.sender;
  await sender?.replaceTrack(track).catch(() => {});
  useCall.setState({ localStream: new MediaStream(stream.getTracks()) });
}

/** Whether this browser can route call audio to a chosen output (not iOS, where the system decides). */
export const canPickOutput =
  typeof HTMLMediaElement !== "undefined" &&
  "setSinkId" in HTMLMediaElement.prototype &&
  !/iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function signal(data: unknown) {
  const id = useCall.getState().callId;
  if (id) wsSend("call_signal", { callId: id, data });
}

/** Removes the "incoming call" notification once the call is answered, declined or over. */
function clearCallNotice(chatId: number | null) {
  if (!chatId || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.getNotifications({ tag: `call-${chatId}` }))
    .then((list) => list.forEach((n) => n.close()))
    .catch(() => {});
}

function cleanup(reason = "") {
  stopTone();
  clearCallNotice(useCall.getState().chatId);
  pc?.close();
  pc = null;
  established = false;
  makingOffer = false;
  clearMediaSession();
  import("./pip").then((m) => m.closePips());
  pendingCandidates = [];
  restarts = 0;
  downSince = 0;
  window.clearTimeout(restartTimer);
  window.clearInterval(statsTimer);
  statsTimer = undefined;
  hintShown = false;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  const st = useCall.getState();
  st.localStream?.getTracks().forEach((tr) => tr.stop());
  useCall.setState({
    phase: reason ? "ended" : "idle",
    endReason: reason,
    localStream: null,
    remoteStream: null,
    callId: null,
    reconnecting: false,
    peerAway: false,
    net: null,
    weakHint: false,
    peerState: { muted: false, cameraOff: false, away: false },
    videoAsk: false,
    chatOpen: false,
    swapped: false,
  });
  if (reason) {
    window.setTimeout(() => {
      if (useCall.getState().phase === "ended")
        useCall.setState({ phase: "idle", peer: null, minimized: false, answeredAt: 0 });
    }, 1600);
  } else {
    useCall.setState({ peer: null, minimized: false, answeredAt: 0 });
  }
}

export const useCall = create<CallState>((set, getState) => ({
  phase: "idle",
  callId: null,
  peer: null,
  chatId: null,
  video: false,
  localStream: null,
  remoteStream: null,
  muted: false,
  cameraOff: false,
  outputId: "",
  minimized: false,
  reconnecting: false,
  peerAway: false,
  net: null,
  weakHint: false,
  peerState: { muted: false, cameraOff: false, away: false },
  videoAsk: false,
  chatOpen: false,
  swapped: false,
  answeredAt: 0,
  endReason: "",
  facing: "user",

  async start(peer, video) {
    if (getState().phase !== "idle" && getState().phase !== "ended") return;
    if (!video) askMotionPermission();
    const app = useApp.getState();
    if (!app.config?.callsEnabled) return app.toast(t("call.disabled"), "error");
    isCaller = true;
    ref = Math.random().toString(36).slice(2);
    set({
      phase: "outgoing",
      peer,
      video,
      muted: false,
      cameraOff: false,
      minimized: false,
      answeredAt: 0,
      facing: "user",
    });
    let stream: MediaStream;
    try {
      stream = await getMedia(video);
    } catch {
      app.toast(t("call.noMedia"), "error");
      cleanup();
      return;
    }
    if (getState().phase !== "outgoing") {
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    set({ localStream: stream });
    if (!wsSend("call_invite", { to: peer.id, video, ref })) {
      app.toast(t("err.network"), "error");
      cleanup();
      return;
    }
    playTone("ringback");
  },

  async accept() {
    const st = getState();
    if (st.phase !== "incoming" || !st.callId) return;
    if (!st.video) askMotionPermission();
    stopTone();
    clearCallNotice(st.chatId);
    isCaller = false;
    set({ phase: "connecting" });
    try {
      const stream = await getMedia(st.video);
      set({ localStream: stream });
    } catch {
      useApp.getState().toast(t("call.noMedia"), "error");
      wsSend("call_reject", { callId: st.callId });
      cleanup();
      return;
    }
    pc = await createPeer();
    wsSend("call_accept", { callId: st.callId });
  },

  hangup() {
    const st = getState();
    if (st.callId)
      wsSend(st.phase === "incoming" ? "call_reject" : "call_end", { callId: st.callId });
    cleanup(st.phase === "active" ? t("call.ended") : "");
  },

  toggleMute() {
    const muted = !getState().muted;
    getState()
      .localStream?.getAudioTracks()
      .forEach((tr) => (tr.enabled = !muted));
    set({ muted });
    sendState();
    syncMediaSession();
  },

  async toggleCamera() {
    const st = getState();
    const stream = st.localStream;
    if (stream && !stream.getVideoTracks().length && !st.cameraOff) {
      // A voice call becomes a video call: add a camera and renegotiate.
      if (!useApp.getState().config?.videoCallsEnabled) {
        useApp.getState().toast(t("call.disabled"), "error");
        return;
      }
      let track: MediaStreamTrack;
      try {
        track = (
          await navigator.mediaDevices.getUserMedia({ video: camera(st.facing) })
        ).getVideoTracks()[0];
      } catch {
        useApp.getState().toast(t("call.noMedia"), "error");
        return;
      }
      stream.addTrack(track);
      const free = pc
        ?.getTransceivers()
        .find((tr) => tr.receiver.track.kind === "video" && !tr.sender.track);
      if (free) {
        await free.sender.replaceTrack(track);
        free.direction = "sendrecv"; // fires negotiationneeded
      } else pc?.addTrack(track, stream);
      set({ video: true, cameraOff: false, localStream: stream, videoAsk: false, weakHint: false });
      signal({ type: "video-on" });
      sendState();
      syncMediaSession();
      return;
    }
    if (!stream) return;
    if (!st.cameraOff) {
      // Off means off: the camera is released (its light goes out) and nothing is sent, so neither
      // returning to the app nor reopening the call screen can bring it back by itself.
      for (const tr of stream.getVideoTracks()) {
        const sender = pc?.getSenders().find((x) => x.track === tr);
        await sender?.replaceTrack(null).catch(() => {});
        tr.stop();
        stream.removeTrack(tr);
      }
      set({
        cameraOff: true,
        weakHint: false,
        videoAsk: false,
        localStream: new MediaStream(stream.getTracks()),
      });
    } else {
      let track: MediaStreamTrack;
      try {
        track = (
          await navigator.mediaDevices.getUserMedia({ video: camera(st.facing) })
        ).getVideoTracks()[0];
      } catch {
        useApp.getState().toast(t("call.noMedia"), "error");
        return;
      }
      const cur = getState().localStream || stream;
      cur.addTrack(track);
      // The video slot from the start of the call is still there, so no renegotiation is needed.
      const slot = pc
        ?.getTransceivers()
        .find((x) => x.receiver.track.kind === "video" && !x.sender.track);
      if (slot) await slot.sender.replaceTrack(track).catch(() => {});
      else pc?.addTrack(track, cur);
      if (pc) tuneVideo(pc);
      set({
        cameraOff: false,
        weakHint: false,
        videoAsk: false,
        localStream: new MediaStream(cur.getTracks()),
      });
    }
    sendState();
    syncMediaSession();
  },

  setOutput(id) {
    set({ outputId: id });
  },

  async flip() {
    const st = getState();
    if (!st.video || !st.localStream || st.cameraOff) return;
    const facing = st.facing === "user" ? "environment" : "user";
    try {
      // Same constraints as the first camera; a bare facingMode request falls back to 640×480.
      const cam = await navigator.mediaDevices.getUserMedia({ video: camera(facing) });
      const track = cam.getVideoTracks()[0];
      const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(track);
      if (pc) tuneVideo(pc);
      st.localStream.getVideoTracks().forEach((tr) => {
        tr.stop();
        st.localStream!.removeTrack(tr);
      });
      st.localStream.addTrack(track);
      set({ facing, localStream: st.localStream });
    } catch {
      /* device has a single camera */
    }
  },

  setMinimized(v) {
    set({ minimized: v });
  },

  setChatOpen(v) {
    set({ chatOpen: v });
  },

  toggleSwap() {
    set({ swapped: !getState().swapped });
  },

  dismissVideoAsk() {
    set({ videoAsk: false });
  },
}));

// --- signaling events from the server ---

onEvent("call_created", (d) => {
  if (d.ref !== ref) return;
  if (useCall.getState().phase === "outgoing")
    useCall.setState({ callId: d.callId, chatId: d.chatId });
  else wsSend("call_end", { callId: d.callId }); // hung up before the server confirmed the call
});

onEvent("call_failed", (d) => {
  if (d.ref !== ref) return;
  // Every refusal says why; a call screen that just closes looks like a broken button.
  const key =
    (
      {
        busy: "call.busy",
        offline: "call.offline",
        disabled: "call.disabled",
        rate_limited: "err.rate_limited",
        invalid: "call.invalid",
        busy_self: "call.busySelf",
      } as const
    )[d.reason as "busy"] || "call.failed";
  useApp.getState().toast(t(key), "error");
  cleanup(t(key));
});

onEvent("call_incoming", (d) => {
  const st = useCall.getState();
  if (st.phase !== "idle" && st.phase !== "ended") {
    wsSend("call_reject", { callId: d.callId });
    return;
  }
  isCaller = false;
  useCall.setState({
    phase: "incoming",
    callId: d.callId,
    chatId: d.chatId,
    peer: d.from,
    video: d.video,
    muted: false,
    cameraOff: false,
    minimized: false,
    answeredAt: 0,
  });
  playTone("ring");
});

async function onAccepted() {
  stopTone();
  useCall.setState({ phase: "connecting" });
  pc = await createPeer();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  tuneVideo(pc);
  signal({ type: "offer", sdp: offer.sdp });
}

onEvent("call_accepted", (d) => {
  if (d.callId !== useCall.getState().callId) return;
  onAccepted();
});

// Our socket came back within the server's grace period: pick the call up where it was.
onEvent("call_resume", (d) => {
  const st = useCall.getState();
  if (d.callId !== st.callId) {
    // A call this page no longer knows (the app was reloaded or closed): free the other side.
    wsSend("call_end", { callId: d.callId });
    return;
  }
  if (st.phase === "outgoing" && d.status === "active") {
    onAccepted(); // answered while we were offline
    return;
  }
  if (pc && pc.connectionState !== "connected") restartIce();
});

onEvent("call_peer_away", (d) => {
  if (d.callId === useCall.getState().callId) useCall.setState({ peerAway: true });
});

onEvent("call_peer_back", (d) => {
  if (d.callId !== useCall.getState().callId) return;
  useCall.setState({ peerAway: false });
  if (pc && pc.connectionState !== "connected") restartIce();
});

onEvent("call_handled", (d) => {
  if (d.callId === useCall.getState().callId && useCall.getState().phase === "incoming") cleanup();
});

onEvent("call_signal", async (d) => {
  if (d.callId !== useCall.getState().callId || !pc) return;
  const data = d.data as { type: string; sdp?: string; candidate?: RTCIceCandidateInit };
  try {
    if (data.type === "offer") {
      const collision = makingOffer || pc.signalingState !== "stable";
      if (collision && isCaller) return; // impolite side: our own offer wins
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp }); // the polite side rolls back
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      tuneVideo(pc);
      signal({ type: "answer", sdp: answer.sdp });
      for (const c of pendingCandidates.splice(0)) await pc.addIceCandidate(c);
    } else if (data.type === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      for (const c of pendingCandidates.splice(0)) await pc.addIceCandidate(c);
    } else if (data.type === "restart") {
      if (isCaller) restartIce();
    } else if (data.type === "state") {
      const x = data as unknown as { muted?: boolean; cameraOff?: boolean; away?: boolean };
      useCall.setState({
        peerState: { muted: !!x.muted, cameraOff: !!x.cameraOff, away: !!x.away },
      });
    } else if (data.type === "video-on") {
      const st = useCall.getState();
      if (!st.localStream?.getVideoTracks().length) useCall.setState({ videoAsk: true });
    } else if (data.type === "candidate" && data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
      else pendingCandidates.push(data.candidate);
    }
  } catch (e) {
    console.warn("call signaling", e);
  }
});

onEvent("call_ended", (d) => {
  const st = useCall.getState();
  if (d.callId !== st.callId) return;
  const reasons: Record<string, Parameters<typeof translate>[1]> = {
    rejected: "call.rejected",
    missed: "call.missed",
    cancelled: "call.cancelled",
  };
  cleanup(t(reasons[d.reason] || "call.ended"));
});

window.addEventListener("beforeunload", () => {
  const st = useCall.getState();
  if (st.callId)
    wsSend(st.phase === "incoming" ? "call_reject" : "call_end", { callId: st.callId });
});
