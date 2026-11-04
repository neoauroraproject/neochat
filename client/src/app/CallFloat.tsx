import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import { duration } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import { useTick } from "./hooks";

type Corner = "tl" | "tr" | "bl" | "br";

// Apple's momentum projection: where a flick would come to rest.
const project = (v: number, rate = 0.99) => ((v / 1000) * rate) / (1 - rate);

/** Plays a MediaStream in a <video>/<audio> element and keeps it in sync. */
export function useStream<T extends HTMLMediaElement>(stream: MediaStream | null | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== (stream || null)) {
      el.srcObject = stream || null;
      if (stream) el.play().catch(() => {});
    }
  });
  return ref;
}

/** Live level of a stream (0..1), for the little sound wave of a voice call. */
function useLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream?.getAudioTracks().length || typeof AudioContext === "undefined") return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const id = window.setInterval(() => {
      an.getByteFrequencyData(buf);
      let sum = 0;
      for (const v of buf) sum += v;
      setLevel(Math.min(1, sum / buf.length / 90));
    }, 120);
    return () => {
      window.clearInterval(id);
      ctx.close().catch(() => {});
    };
  }, [stream]);
  return level;
}

/**
 * The minimized call: the other person's video in a rounded window that follows the finger,
 * is flung to the nearest corner, and tucks half away at a side edge (like iOS). A voice call is
 * a small bubble with the photo, the timer and a sound wave. One tap shows mute/end, two taps go
 * back to full screen. It stays on top of every screen of the app.
 */
export function CallFloat() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const st = useCall();
  useTick(1000);
  const audio = useStream<HTMLAudioElement>(st.remoteStream);
  const vid = useStream<HTMLVideoElement>(st.remoteStream);
  const level = useLevel(st.video ? null : st.remoteStream);
  const ref = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<Corner>("tr");
  const [tucked, setTucked] = useState<"l" | "r" | null>(null);
  const [controls, setControls] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    t: number;
    hist: { x: number; y: number; t: number }[];
  } | null>(null);
  const lastTap = useRef(0);
  const hide = useRef<number>();

  useEffect(() => () => window.clearTimeout(hide.current), []);

  const remoteVideo =
    st.video &&
    !!st.remoteStream?.getVideoTracks().some((tr) => tr.readyState === "live" && !tr.muted) &&
    !st.peerState.cameraOff &&
    !st.peerState.away;

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    ref.current!.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    };
    ref.current!.style.transition = "none";
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (d.hist.length > 5) d.hist.shift();
    ref.current!.style.transform = `translate(${e.clientX - d.x}px, ${e.clientY - d.y}px)`;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const el = ref.current!;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved < 6 && e.timeStamp - d.t < 350) {
      el.style.transform = "";
      tap();
      return;
    }
    const first = d.hist[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const vx = ((e.clientX - first.x) / dt) * 1000;
    const vy = ((e.clientY - first.y) / dt) * 1000;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 + project(vx);
    const cy = r.top + r.height / 2 + project(vy);
    const W = window.innerWidth;
    // Pushed past a side edge: tuck it half away there.
    const tuck = cx < r.width * 0.15 ? "l" : cx > W - r.width * 0.15 ? "r" : null;
    const next = `${cy > window.innerHeight / 2 ? "b" : "t"}${cx > W / 2 ? "r" : "l"}` as Corner;
    const before = el.getBoundingClientRect();
    setCorner(tuck ? (`${next[0]}${tuck}` as Corner) : next);
    setTucked(tuck);
    setControls(false);
    requestAnimationFrame(() => {
      const after = el.getBoundingClientRect();
      el.style.transform = `translate(${before.left - after.left}px, ${before.top - after.top}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 420ms cubic-bezier(0.22, 1.2, 0.36, 1)";
        el.style.transform = "";
      });
    });
  };

  const tap = () => {
    const now = Date.now();
    if (tucked) {
      setTucked(null);
      return;
    }
    if (now - lastTap.current < 300) {
      st.setMinimized(false);
      return;
    }
    lastTap.current = now;
    setControls((v) => !v);
    window.clearTimeout(hide.current);
    hide.current = window.setTimeout(() => setControls(false), 4000);
  };

  if (!st.peer) return null;
  const elapsed = st.answeredAt ? duration((Date.now() - st.answeredAt) / 1000, lang) : "";
  const label =
    st.phase === "ended"
      ? st.endReason
      : st.reconnecting || st.peerAway
        ? t("call.reconnecting")
        : st.phase === "active"
          ? elapsed
          : t(st.callId ? "call.ringing" : "call.calling");

  return createPortal(
    <div
      ref={ref}
      className={`call-float ${corner}${remoteVideo ? " video" : " voice"}${tucked ? ` tucked-${tucked}` : ""}${controls ? " ctl" : ""}`}
      role="dialog"
      aria-label={`${st.peer.displayName} · ${label}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <audio ref={audio} autoPlay playsInline />
      {remoteVideo ? (
        <video ref={vid} className="cf-video" autoPlay playsInline muted />
      ) : (
        <div className="cf-voice">
          <Avatar id={st.peer.id} name={st.peer.displayName} media={st.peer.avatar} size={38} />
          <span className="cf-time">{label}</span>
          <span className="cf-wave" aria-hidden="true">
            {[0.55, 1, 0.7, 0.9, 0.5].map((k, i) => (
              <i key={i} style={{ transform: `scaleY(${0.25 + level * k * 0.9})` }} />
            ))}
          </span>
        </div>
      )}
      {remoteVideo && <span className="cf-badge">{label}</span>}
      {controls && (
        <div className="cf-controls">
          <button
            onClick={st.toggleMute}
            aria-label={t("call.mute")}
            className={st.muted ? "on" : ""}
          >
            <Icon name={st.muted ? "mic-off" : "mic"} size={18} />
          </button>
          <button onClick={() => st.setMinimized(false)} aria-label={t("call.backToCall")}>
            <Icon name="external" size={17} />
          </button>
          <button onClick={st.hangup} aria-label={t("call.end")} className="end">
            <Icon name="phone-down" size={18} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
