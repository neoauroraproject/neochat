import { create } from "zustand";
import { get } from "./api";
import { translate } from "./i18n";
import { audio } from "./notify";
import { useApp } from "./store";
import type { User } from "./types";
import { onEvent, wsSend } from "./ws";

type Phase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

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
  speakerOff: boolean;
  minimized: boolean;
  reconnecting: boolean;
  answeredAt: number;
  endReason: string;
  facing: "user" | "environment";
  start(peer: User, video: boolean): Promise<void>;
  accept(): Promise<void>;
  hangup(): void;
  toggleMute(): void;
  toggleCamera(): void;
  toggleSpeaker(): void;
  flip(): Promise<void>;
  setMinimized(v: boolean): void;
}

let pc: RTCPeerConnection | null = null;
let ref = "";
let pendingCandidates: RTCIceCandidateInit[] = [];
let restarted = false;
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

async function getMedia(video: boolean, facing: "user" | "environment" = "user") {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: video ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
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
  };
  conn.onicecandidate = (e) => {
    if (e.candidate) signal({ type: "candidate", candidate: e.candidate.toJSON() });
  };
  conn.onconnectionstatechange = () => {
    const s = conn.connectionState;
    if (s === "connected") {
      useCall.setState((st) => ({
        phase: "active",
        reconnecting: false,
        answeredAt: st.answeredAt || Date.now(),
      }));
    } else if (s === "disconnected") {
      useCall.setState({ reconnecting: true });
    } else if (s === "failed") {
      const st = useCall.getState();
      // The caller attempts one ICE restart (e.g. switching Wi-Fi → mobile data).
      if (!restarted && st.peer && pc === conn && isCaller) {
        restarted = true;
        useCall.setState({ reconnecting: true });
        conn.createOffer({ iceRestart: true }).then(async (offer) => {
          await conn.setLocalDescription(offer);
          signal({ type: "offer", sdp: offer.sdp });
        });
      } else if (restarted) {
        useCall.getState().hangup();
      }
    }
  };
  return conn;
}

let isCaller = false;

function signal(data: unknown) {
  const id = useCall.getState().callId;
  if (id) wsSend("call_signal", { callId: id, data });
}

function cleanup(reason = "") {
  stopTone();
  pc?.close();
  pc = null;
  pendingCandidates = [];
  restarted = false;
  const st = useCall.getState();
  st.localStream?.getTracks().forEach((tr) => tr.stop());
  useCall.setState({
    phase: reason ? "ended" : "idle",
    endReason: reason,
    localStream: null,
    remoteStream: null,
    callId: null,
    reconnecting: false,
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
  speakerOff: false,
  minimized: false,
  reconnecting: false,
  answeredAt: 0,
  endReason: "",
  facing: "user",

  async start(peer, video) {
    if (getState().phase !== "idle" && getState().phase !== "ended") return;
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
      speakerOff: false,
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
    stopTone();
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
  },

  toggleCamera() {
    const st = getState();
    const off = !st.cameraOff;
    st.localStream?.getVideoTracks().forEach((tr) => (tr.enabled = !off));
    set({ cameraOff: off });
  },

  toggleSpeaker() {
    set({ speakerOff: !getState().speakerOff });
  },

  async flip() {
    const st = getState();
    if (!st.video || !st.localStream) return;
    const facing = st.facing === "user" ? "environment" : "user";
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
      const track = cam.getVideoTracks()[0];
      const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(track);
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
  const key = ({ busy: "call.busy", offline: "call.offline", disabled: "call.disabled" } as const)[
    d.reason as "busy"
  ];
  if (key) useApp.getState().toast(t(key), "error");
  cleanup(key ? t(key) : "");
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
    speakerOff: false,
    minimized: false,
    answeredAt: 0,
  });
  playTone("ring");
});

onEvent("call_accepted", async (d) => {
  const st = useCall.getState();
  if (d.callId !== st.callId) return;
  stopTone();
  useCall.setState({ phase: "connecting" });
  pc = await createPeer();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signal({ type: "offer", sdp: offer.sdp });
});

onEvent("call_handled", (d) => {
  if (d.callId === useCall.getState().callId && useCall.getState().phase === "incoming") cleanup();
});

onEvent("call_signal", async (d) => {
  if (d.callId !== useCall.getState().callId || !pc) return;
  const data = d.data as { type: string; sdp?: string; candidate?: RTCIceCandidateInit };
  try {
    if (data.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal({ type: "answer", sdp: answer.sdp });
      for (const c of pendingCandidates.splice(0)) await pc.addIceCandidate(c);
    } else if (data.type === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      for (const c of pendingCandidates.splice(0)) await pc.addIceCandidate(c);
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
