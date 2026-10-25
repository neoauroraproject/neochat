import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mediaUrl } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import { duration } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import { useTick } from "./hooks";

// Apple's momentum projection: where a flick would come to rest.
const project = (v: number, rate = 0.99) => ((v / 1000) * rate) / (1 - rate);

/** Self-view that can be dragged anywhere and snaps to the nearest corner, carrying the flick's momentum. */
function DraggablePip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<"tl" | "tr" | "bl" | "br">("tr");
  const drag = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
    hist: { x: number; y: number; t: number }[];
  } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ox: r.left,
      oy: r.top,
      hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    };
    el.style.transition = "none";
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
    const first = d.hist[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const vx = ((e.clientX - first.x) / dt) * 1000;
    const vy = ((e.clientY - first.y) / dt) * 1000;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 + project(vx);
    const cy = r.top + r.height / 2 + project(vy);
    const parent = el.offsetParent?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: innerWidth,
      height: innerHeight,
    };
    const right = cx > parent.left + parent.width / 2;
    const bottom = cy > parent.top + parent.height / 2;
    // Spring back from the current spot into the new corner (no jump: start from the live position).
    const next = `${bottom ? "b" : "t"}${right ? "r" : "l"}` as typeof corner;
    const before = el.getBoundingClientRect();
    setCorner(next);
    requestAnimationFrame(() => {
      const after = el.getBoundingClientRect();
      el.style.transform = `translate(${before.left - after.left}px, ${before.top - after.top}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 420ms cubic-bezier(0.22, 1.2, 0.36, 1)";
        el.style.transform = "translate(0, 0)";
      });
    });
  };
  return (
    <div
      ref={ref}
      className={`wa-pip ${corner}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {children}
    </div>
  );
}

/** WhatsApp-style call screen: blurred portrait backdrop, ringing ripples, labeled controls, auto-hiding UI in video. */
export function CallView() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const st = useCall();
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<number>();
  useTick(1000);

  useEffect(() => {
    if (remoteAudio.current && remoteAudio.current.srcObject !== st.remoteStream)
      remoteAudio.current.srcObject = st.remoteStream;
    if (remoteVideo.current && remoteVideo.current.srcObject !== st.remoteStream)
      remoteVideo.current.srcObject = st.remoteStream;
  });
  useEffect(() => {
    if (localVideo.current && localVideo.current.srcObject !== st.localStream)
      localVideo.current.srcObject = st.localStream;
  });
  useEffect(() => {
    if (remoteAudio.current) remoteAudio.current.muted = st.speakerOff;
  }, [st.speakerOff]);

  const remoteHasVideo = !!st.remoteStream
    ?.getVideoTracks()
    .some((tr) => tr.readyState === "live" && !tr.muted);
  const showVideo = st.video && st.phase === "active" && remoteHasVideo;

  // In a video call the controls fade away after a few seconds; a tap brings them back.
  const poke = () => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    if (showVideo) hideTimer.current = window.setTimeout(() => setChrome(false), 4000);
  };
  useEffect(() => {
    poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [showVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (st.phase === "idle" || !st.peer) return null;

  const elapsed = st.answeredAt ? duration((Date.now() - st.answeredAt) / 1000, lang) : "";
  const label =
    st.phase === "ended"
      ? st.endReason
      : st.phase === "incoming"
        ? t(st.video ? "call.incomingVideo" : "call.incomingVoice")
        : st.phase === "outgoing"
          ? t(st.callId ? "call.ringing" : "call.calling")
          : st.phase === "connecting"
            ? t("call.connecting")
            : st.reconnecting
              ? t("call.reconnecting")
              : elapsed;
  const ringing = st.phase === "incoming" || st.phase === "outgoing";
  const audioEl = <audio ref={remoteAudio} autoPlay playsInline />;

  if (st.minimized && st.phase !== "incoming") {
    return createPortal(
      <div className="call-mini" role="button" onClick={() => st.setMinimized(false)}>
        {audioEl}
        <Icon name={st.video ? "video" : "phone"} size={16} />
        <span className="t">
          {st.peer.displayName} · {label}
        </span>
        <span className="tap">{t("call.backToCall")}</span>
      </div>,
      document.body,
    );
  }

  const ctl = (icon: string, text: string, onClick: () => void, on = false, cls = "") => (
    <button
      className={`wa-ctl ${cls}${on ? " on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={text}
    >
      <span className="ic">
        <Icon name={icon} size={24} />
      </span>
      <span className="lb">{text}</span>
    </button>
  );

  return createPortal(
    <div
      className={`wa-call${showVideo ? " video" : ""}${chrome ? "" : " chrome-off"}${st.phase === "ended" ? " ended" : ""}`}
      role="dialog"
      aria-label={label}
      onPointerDown={poke}
    >
      {audioEl}
      <div
        className="wa-bg"
        style={st.peer.avatar ? { backgroundImage: `url(${mediaUrl(st.peer.avatar)})` } : undefined}
        data-id={st.peer.id % 8}
      />
      {st.video && (
        <video
          ref={remoteVideo}
          className="wa-remote"
          autoPlay
          playsInline
          muted
          style={{ opacity: showVideo ? 1 : 0 }}
        />
      )}

      <header className="wa-top">
        <button
          className="wa-round"
          onClick={() => st.setMinimized(true)}
          aria-label={t("call.minimize")}
          disabled={st.phase === "incoming"}
        >
          <Icon name="down" size={22} />
        </button>
        <div className="wa-secure">
          <Icon name="lock" size={12} />
          {t("call.secure")}
        </div>
        <span className="wa-round ghost" />
      </header>

      <div className="wa-who">
        <h2>{st.peer.displayName}</h2>
        <div className="wa-state">{label}</div>
      </div>

      {!showVideo && (
        <div className={`wa-portrait${ringing ? " ringing" : ""}`}>
          <i />
          <i />
          <i />
          <Avatar id={st.peer.id} name={st.peer.displayName} media={st.peer.avatar} size={150} />
        </div>
      )}

      {st.video && st.localStream && !st.cameraOff && st.phase !== "incoming" && (
        <DraggablePip>
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            style={{ transform: st.facing === "user" ? "scaleX(-1)" : "none" }}
          />
        </DraggablePip>
      )}

      {st.phase === "incoming" ? (
        <div className="wa-incoming">
          <button className="wa-answer decline" onClick={st.hangup} aria-label={t("call.decline")}>
            <span className="ic">
              <Icon name="phone-down" size={30} />
            </span>
            <span className="lb">{t("call.decline")}</span>
          </button>
          <button className="wa-answer accept" onClick={st.accept} aria-label={t("call.accept")}>
            <span className="ic">
              <Icon name={st.video ? "video" : "phone"} size={28} />
            </span>
            <span className="lb">{t("call.accept")}</span>
          </button>
        </div>
      ) : (
        <div className="wa-controls">
          {ctl(
            st.speakerOff ? "speaker-off" : "speaker",
            t("call.speaker"),
            st.toggleSpeaker,
            st.speakerOff,
          )}
          {st.video &&
            ctl(
              st.cameraOff ? "video-off" : "video",
              t("call.camera"),
              st.toggleCamera,
              st.cameraOff,
            )}
          {st.video && navigator.maxTouchPoints > 0 && ctl("flip", t("call.flip"), st.flip)}
          {ctl(st.muted ? "mic-off" : "mic", t("call.mute"), st.toggleMute, st.muted)}
          {ctl("phone-down", t("call.end"), st.hangup, false, "end")}
        </div>
      )}
    </div>,
    document.body,
  );
}
