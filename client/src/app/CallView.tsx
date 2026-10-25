import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import { duration } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import { useTick } from "./hooks";

/** The floating glass call card from the design: portrait, timer and a pill of controls. */
export function CallView() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const st = useCall();
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  useTick(1000);

  useEffect(() => {
    if (remoteAudio.current && remoteAudio.current.srcObject !== st.remoteStream)
      remoteAudio.current.srcObject = st.remoteStream;
    if (remoteVideo.current && remoteVideo.current.srcObject !== st.remoteStream)
      remoteVideo.current.srcObject = st.remoteStream;
  }, [st.remoteStream, st.minimized, st.phase]);
  useEffect(() => {
    if (localVideo.current && localVideo.current.srcObject !== st.localStream)
      localVideo.current.srcObject = st.localStream;
  }, [st.localStream, st.minimized, st.phase]);
  useEffect(() => {
    if (remoteAudio.current) remoteAudio.current.muted = st.speakerOff;
  }, [st.speakerOff]);

  if (st.phase === "idle" || !st.peer) return null;

  const remoteHasVideo = !!st.remoteStream
    ?.getVideoTracks()
    .some((tr) => tr.readyState === "live" && !tr.muted);
  const showVideo = st.video && st.phase === "active" && remoteHasVideo;
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

  const audioEl = <audio ref={remoteAudio} autoPlay playsInline />;

  if (st.minimized && st.phase !== "incoming") {
    return createPortal(
      <div className="call-mini glass-float" role="button" onClick={() => st.setMinimized(false)}>
        {audioEl}
        <span className="live" />
        <span className="t">
          {st.peer.displayName} · {label}
        </span>
        <button
          className="icon-btn"
          style={{ background: "var(--danger)", color: "#fff", width: 36, height: 36 }}
          onClick={(e) => {
            e.stopPropagation();
            st.hangup();
          }}
          aria-label={t("call.end")}
        >
          <Icon name="phone-down" size={18} />
        </button>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className={`call-card glass-float${st.video ? " video" : ""}${showVideo ? " has-video" : ""}${st.phase === "incoming" || st.phase === "outgoing" ? " ringing" : ""}`}
      role="dialog"
      aria-label={label}
    >
      {audioEl}
      {st.video && (
        <video
          ref={remoteVideo}
          className="remote-video"
          autoPlay
          playsInline
          muted
          style={{ display: showVideo ? "block" : "none" }}
        />
      )}
      {st.video && st.localStream && !st.cameraOff && (
        <video
          ref={localVideo}
          className="local-video"
          autoPlay
          playsInline
          muted
          style={{ transform: st.facing === "user" ? "scaleX(-1)" : "none" }}
        />
      )}
      <div className="top">
        <button
          className="icon-btn filled"
          onClick={() => st.setMinimized(true)}
          aria-label={t("call.minimize")}
          disabled={st.phase === "incoming"}
        >
          <Icon name="minimize" size={18} />
        </button>
        <span className="chip">
          <Icon name="lock" size={12} />
          {st.video ? t("call.video") : t("call.voice")}
        </span>
      </div>
      <div className="center">
        <div className="portrait">
          <Avatar id={st.peer.id} name={st.peer.displayName} media={st.peer.avatar} size={132} />
        </div>
        <h2>{st.peer.displayName}</h2>
        <div className="state">{label}</div>
      </div>
      <div className="controls">
        {st.phase === "incoming" ? (
          <>
            <button className="icon-btn hang" onClick={st.hangup} aria-label={t("call.decline")}>
              <Icon name="phone-down" size={24} />
            </button>
            <button className="icon-btn ok" onClick={st.accept} aria-label={t("call.accept")}>
              <Icon name={st.video ? "video" : "phone"} size={22} />
            </button>
          </>
        ) : (
          <>
            {st.video && (
              <button
                className={`icon-btn${st.cameraOff ? " on" : ""}`}
                onClick={st.toggleCamera}
                aria-label={t("call.camera")}
                aria-pressed={st.cameraOff}
              >
                <Icon name={st.cameraOff ? "video-off" : "video"} size={22} />
              </button>
            )}
            <button
              className={`icon-btn${st.muted ? " on" : ""}`}
              onClick={st.toggleMute}
              aria-label={t("call.mute")}
              aria-pressed={st.muted}
            >
              <Icon name={st.muted ? "mic-off" : "mic"} size={22} />
            </button>
            {st.video && navigator.maxTouchPoints > 0 && (
              <button className="icon-btn" onClick={st.flip} aria-label={t("call.flip")}>
                <Icon name="flip" size={21} />
              </button>
            )}
            <button
              className={`icon-btn${st.speakerOff ? " on" : ""}`}
              onClick={st.toggleSpeaker}
              aria-label={t("call.speaker")}
              aria-pressed={st.speakerOff}
            >
              <Icon name={st.speakerOff ? "speaker-off" : "speaker"} size={22} />
            </button>
            <button
              className="icon-btn hang"
              onClick={st.hangup}
              aria-label={t("call.end")}
              disabled={st.phase === "ended"}
            >
              <Icon name="phone-down" size={24} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
