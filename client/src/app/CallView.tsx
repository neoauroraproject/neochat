import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import { duration } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import { useTick } from "./hooks";

// Apple's momentum projection: where a flick would come to rest.
const project = (v: number, rate = 0.99) => ((v / 1000) * rate) / (1 - rate);

/** Self-view that follows the finger 1:1 and snaps to the corner its momentum points at. */
function DraggablePip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<"tl" | "tr" | "bl" | "br">("tr");
  const drag = useRef<{ x: number; y: number; hist: { x: number; y: number; t: number }[] } | null>(
    null,
  );

  const onDown = (e: React.PointerEvent) => {
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
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
    const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: innerWidth,
      height: innerHeight,
    };
    const cx = r.left + r.width / 2 + project(vx);
    const cy = r.top + r.height / 2 + project(vy);
    const next =
      `${cy > parent.top + parent.height / 2 ? "b" : "t"}${cx > parent.left + parent.width / 2 ? "r" : "l"}` as typeof corner;
    // Start the settle from the live position so there is no jump.
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
      className={`pip ${corner}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {children}
    </div>
  );
}

/** Call panel from the reference: squircle portrait, name, timer and a glass pill of controls. */
export function CallView({ embedded }: { embedded?: boolean }) {
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

  // In video the controls fade after a few seconds; any touch brings them back.
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
      className={`cp-btn ${cls}${on ? " on" : ""}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={text}
      title={text}
    >
      <Icon name={icon} size={22} />
    </button>
  );

  const panel = (
    <div
      className={`call-panel${embedded ? " embedded" : " full"}${showVideo ? " video" : ""}${chrome ? "" : " chrome-off"}${st.phase === "ended" ? " ended" : ""}`}
      role="dialog"
      aria-label={label}
      onPointerDown={poke}
    >
      {audioEl}
      {st.video && (
        <video
          ref={remoteVideo}
          className="cp-remote"
          autoPlay
          playsInline
          muted
          style={{ opacity: showVideo ? 1 : 0 }}
        />
      )}
      <header className="cp-top">
        <button
          className="icon-btn"
          onClick={() => st.setMinimized(true)}
          aria-label={t("call.minimize")}
          disabled={st.phase === "incoming"}
        >
          <Icon name="back" size={24} className="flip-rtl" />
        </button>
        <span className="cp-secure">
          <Icon name="lock" size={12} />
          {t("call.secure")}
        </span>
        <span className="cp-actions">
          <button className="icon-btn" aria-label={t("room.addMember")} disabled>
            <Icon name="user-plus" size={22} />
          </button>
          <button className="icon-btn" aria-label="more" disabled>
            <Icon name="more" size={22} />
          </button>
        </span>
      </header>

      <div className="cp-center">
        {!showVideo && (
          <div className={`cp-portrait${ringing ? " ringing" : ""}`}>
            <i />
            <i />
            <Avatar
              id={st.peer.id}
              name={st.peer.displayName}
              media={st.peer.avatar}
              size={140}
              squircle
            />
          </div>
        )}
        <h2>{st.peer.displayName}</h2>
        <div className="cp-state">{label}</div>
      </div>

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
        <div className="cp-answer">
          <button className="cp-big decline" onClick={st.hangup} aria-label={t("call.decline")}>
            <Icon name="phone-down" size={28} />
            <span>{t("call.decline")}</span>
          </button>
          <button className="cp-big accept" onClick={st.accept} aria-label={t("call.accept")}>
            <Icon name={st.video ? "video" : "phone"} size={26} />
            <span>{t("call.accept")}</span>
          </button>
        </div>
      ) : (
        <div className="cp-pill">
          {ctl(
            st.cameraOff || !st.video ? "video-off" : "video",
            t("call.camera"),
            st.toggleCamera,
            st.cameraOff || !st.video,
          )}
          {ctl(st.muted ? "mic-off" : "mic", t("call.mute"), st.toggleMute, st.muted)}
          {ctl("flip", t("call.flip"), st.flip)}
          {ctl(
            st.speakerOff ? "speaker-off" : "speaker",
            t("call.speaker"),
            st.toggleSpeaker,
            st.speakerOff,
          )}
          {ctl("phone-down", t("call.end"), st.hangup, false, "end")}
        </div>
      )}
    </div>
  );

  return embedded ? panel : createPortal(panel, document.body);
}
