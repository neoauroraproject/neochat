import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canPickOutput, useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, Menu, type MenuItem } from "../components/ui";
import { duration } from "../format";
import { useT } from "../i18n";
import { canDocPip, canSystemPip, enterSystemPip, openDocPip, usePip } from "../pip";
import { useApp } from "../store";
import type { Message } from "../types";
import { CallFloat, useStream } from "./CallFloat";
import { useMobile, useTick } from "./hooks";

// Apple's momentum projection: where a flick would come to rest.
const project = (v: number, rate = 0.99) => ((v / 1000) * rate) / (1 - rate);

/**
 * Small video that follows the finger 1:1 and snaps to the corner its momentum points at.
 * A tap (no drag) swaps the two pictures, like FaceTime.
 */
function DraggablePip({ children, onTap }: { children: React.ReactNode; onTap?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<"tl" | "tr" | "bl" | "br">("tr");
  const drag = useRef<{
    x: number;
    y: number;
    t: number;
    hist: { x: number; y: number; t: number }[];
  } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
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
    const el = ref.current!;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && e.timeStamp - d.t < 350) {
      el.style.transform = "";
      onTap?.();
      return;
    }
    const first = d.hist[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const vx = ((e.clientX - first.x) / dt) * 1000;
    const vy = ((e.clientY - first.y) / dt) * 1000;
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

/**
 * New messages from the person we are talking to while the call fills the screen: the latest one
 * floats over the picture for a few seconds and the chat button counts them.
 */
function useCallMessages(chatId: number | null, watching: boolean) {
  const meId = useApp((s) => s.me?.id);
  const last = useApp((s) => {
    const l = chatId ? s.messages[chatId] : undefined;
    return l?.[l.length - 1];
  });
  const seen = useRef(last?.id ?? 0);
  const [unread, setUnread] = useState(0);
  const [bubble, setBubble] = useState<Message | null>(null);
  useEffect(() => {
    // Messages of this chat must be loaded for new ones to land in the store.
    if (chatId && !useApp.getState().messages[chatId]) useApp.getState().loadMessages(chatId);
  }, [chatId]);
  useEffect(() => {
    if (!last || last.id <= seen.current) return;
    seen.current = last.id;
    if (last.senderId === meId || last.kind === "call" || !watching) return;
    setUnread((n) => n + 1);
    setBubble(last);
    const id = window.setTimeout(() => setBubble(null), 4500);
    return () => window.clearTimeout(id);
  }, [last, meId, watching]);
  useEffect(() => {
    if (!watching) setUnread(0);
  }, [watching]);
  return { unread, bubble, clear: () => setUnread(0) };
}

/** Call panel from the reference: squircle portrait, name, timer and a glass pill of controls. */
export function CallView({ embedded }: { embedded?: boolean }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const st = useCall();
  const isMobile = useMobile();
  const docWin = usePip((s) => s.docWindow);
  const remoteAudio = useStream<HTMLAudioElement>(st.remoteStream);
  const mainVideo = useStream<HTMLVideoElement>(st.swapped ? st.localStream : st.remoteStream);
  const smallVideo = useStream<HTMLVideoElement>(st.swapped ? st.remoteStream : st.localStream);
  const panelRef = useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<number>();
  useTick(1000);
  const full = !st.minimized && st.phase !== "idle";
  const msgs = useCallMessages(st.chatId, full && !st.chatOpen && st.phase === "active");

  // Route the call audio to the output picked in the speaker menu (Android, desktop).
  useEffect(() => {
    const el = remoteAudio.current as
      (HTMLAudioElement & { setSinkId?(id: string): Promise<void> }) | null;
    if (el?.setSinkId && canPickOutput) el.setSinkId(st.outputId).catch(() => {});
  }, [st.outputId, st.minimized, embedded, remoteAudio]);
  const [outputs, setOutputs] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const pickOutput = async (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let devices: MediaDeviceInfo[] = [];
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audiooutput" && d.deviceId !== "communications",
      );
    } catch {
      /* no device list */
    }
    if (devices.length < 2) {
      useApp.getState().toast(t("call.oneOutput"));
      return;
    }
    const current = st.outputId || "default";
    setOutputs({
      x: r.left,
      y: r.top - 8,
      items: devices.map((d, i) => ({
        icon: (d.deviceId || "default") === current ? "check" : "speaker",
        label: d.label || `${t("call.speaker")} ${i + 1}`,
        onClick: () => st.setOutput(d.deviceId === "default" ? "" : d.deviceId),
      })),
    });
  };

  const remoteHasVideo = !!st.remoteStream
    ?.getVideoTracks()
    .some((tr) => tr.readyState === "live" && !tr.muted);
  const localHasVideo = !!st.localStream?.getVideoTracks().length && !st.cameraOff;
  // The other side's camera is off or their app is in the background: show their photo instead
  // of a frozen or black frame.
  const peerPicture = remoteHasVideo && !st.peerState.cameraOff && !st.peerState.away;
  const showVideo = st.phase === "active" && (st.swapped ? localHasVideo : peerPicture);

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

  // Drag the full-screen call down to shrink it into the floating window.
  const swipe = useRef<{ y: number; t: number; id: number } | null>(null);
  const onSwipeDown = (e: React.PointerEvent) => {
    poke();
    if (embedded || st.phase === "incoming") return;
    if ((e.target as HTMLElement).closest("button, .pip, .cp-bubble")) return;
    swipe.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId };
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    const dy = e.clientY - s.y;
    if (dy < 8) return;
    panelRef.current!.style.transition = "none";
    panelRef.current!.style.transform = `translateY(${dy}px) scale(${1 - Math.min(0.15, dy / 2000)})`;
    panelRef.current!.style.borderRadius = `${Math.min(28, dy / 6)}px`;
  };
  const onSwipeUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    swipe.current = null;
    const el = panelRef.current!;
    const dy = e.clientY - s.y;
    const v = dy / Math.max(1, e.timeStamp - s.t);
    el.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1), border-radius 320ms";
    if (dy > 120 || (dy > 30 && v > 0.6)) {
      el.style.transform = "translateY(60%) scale(0.4)";
      window.setTimeout(() => st.setMinimized(true), 200);
    } else {
      el.style.transform = "";
      el.style.borderRadius = "";
    }
  };

  if (st.phase === "idle" || !st.peer) return null;
  if (st.minimized && st.phase !== "incoming") return <CallFloat />;

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
            : st.reconnecting || st.peerAway
              ? t("call.reconnecting")
              : elapsed;
  const ringing = st.phase === "incoming" || st.phase === "outgoing";

  const openChat = () => {
    msgs.clear();
    if (!st.chatId) return;
    if (!useApp.getState().chats[st.chatId]) useApp.getState().refreshChat(st.chatId);
    if (isMobile) {
      // Phone: the video shrinks into the floating window and the chat opens underneath.
      st.setMinimized(true);
      useApp.getState().openChat(st.chatId);
    } else st.setChatOpen(!st.chatOpen);
  };

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

  const peerBadges = st.phase === "active" && (
    <div className="cp-peer-state">
      {st.peerState.muted && (
        <span title={t("call.peerMuted")}>
          <Icon name="mic-off" size={14} />
        </span>
      )}
      {(st.peerState.cameraOff || st.peerState.away) && st.video && (
        <span title={t(st.peerState.away ? "call.peerAway" : "call.peerCameraOff")}>
          <Icon name="video-off" size={14} />
        </span>
      )}
      {st.net?.quality === "poor" && (
        <span title={t("call.netPoor")}>
          <Icon name="alert" size={14} />
        </span>
      )}
    </div>
  );

  const panel = (
    <div
      ref={panelRef}
      className={`call-panel${embedded ? " embedded" : " full"}${showVideo ? " video" : ""}${chrome ? "" : " chrome-off"}${st.phase === "ended" ? " ended" : ""}`}
      role="dialog"
      aria-label={label}
      onPointerDown={onSwipeDown}
      onPointerMove={onSwipeMove}
      onPointerUp={onSwipeUp}
      onPointerCancel={onSwipeUp}
    >
      <audio ref={remoteAudio} autoPlay playsInline />
      {(st.video || localHasVideo) && (
        <video
          ref={mainVideo}
          className="cp-remote"
          autoPlay
          playsInline
          muted
          style={{
            opacity: showVideo ? 1 : 0,
            transform: st.swapped && st.facing === "user" ? "scaleX(-1)" : undefined,
          }}
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
          {st.phase === "active" && (canDocPip || (canSystemPip && st.video)) && !docWin && (
            <button
              className="icon-btn"
              aria-label={t("call.pip")}
              title={t("call.pip")}
              onClick={async () => {
                const ok = canDocPip ? await openDocPip() : await enterSystemPip();
                if (!ok) useApp.getState().toast(t("call.pipUnavailable"));
              }}
            >
              <Icon name="external" size={21} />
            </button>
          )}
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
        <div className="cp-state">
          {label}
          {st.phase === "active" && st.net && st.net.quality !== "good" && !st.reconnecting && (
            <span
              className={`cp-net ${st.net.quality}`}
              title={`${st.net.rtt} ms · ${Math.round(st.net.loss * 100)}% · ${st.net.kbps} kbps`}
            >
              <i />
              {t(st.net.quality === "poor" ? "call.netPoor" : "call.netFair")}
            </span>
          )}
        </div>
        {!showVideo &&
          st.video &&
          st.phase === "active" &&
          (st.peerState.cameraOff || st.peerState.away) && (
            <div className="cp-sub">
              {t(st.peerState.away ? "call.peerAway" : "call.peerCameraOff")}
            </div>
          )}
        {peerBadges}
        {st.weakHint && (
          <button className="cp-hint" onClick={st.toggleCamera}>
            <Icon name="video-off" size={16} />
            {t("call.weakHint")}
          </button>
        )}
        {st.videoAsk && (
          <div className="cp-ask">
            <span>{t("call.videoAsk", { name: st.peer.displayName })}</span>
            <button className="btn btn-sm btn-primary" onClick={st.toggleCamera}>
              {t("call.turnOnCamera")}
            </button>
            <button className="btn btn-sm" onClick={st.dismissVideoAsk}>
              {t("call.notNow")}
            </button>
          </div>
        )}
      </div>

      {msgs.bubble && (
        <button className="cp-bubble" onClick={openChat}>
          <b>{msgs.bubble.sender.displayName}</b>
          <span>{msgs.bubble.text || (msgs.bubble.media ? t("chat.file") : "")}</span>
        </button>
      )}

      {st.phase === "active" && (st.swapped ? remoteHasVideo : localHasVideo) && (
        <DraggablePip onTap={st.toggleSwap}>
          <video
            ref={smallVideo}
            autoPlay
            playsInline
            muted
            style={{
              transform: !st.swapped && st.facing === "user" ? "scaleX(-1)" : "none",
            }}
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
            localHasVideo ? "video" : "video-off",
            t("call.camera"),
            st.toggleCamera,
            !localHasVideo,
          )}
          {ctl(st.muted ? "mic-off" : "mic", t("call.mute"), st.toggleMute, st.muted)}
          {localHasVideo && ctl("flip", t("call.flip"), st.flip)}
          {st.phase === "active" && (
            <button
              className={`cp-btn${st.chatOpen ? " on" : ""}`}
              onClick={openChat}
              aria-label={t("call.chat")}
              title={t("call.chat")}
            >
              <Icon name="chat" size={22} />
              {msgs.unread > 0 && <span className="badge">{msgs.unread}</span>}
            </button>
          )}
          {/* iOS picks the route itself (AirPods take over when connected), so no button there. */}
          {canPickOutput && (
            <button
              className={`cp-btn${st.outputId ? " on" : ""}`}
              onClick={pickOutput}
              aria-label={t("call.speaker")}
              title={t("call.speaker")}
            >
              <Icon name="speaker" size={22} />
            </button>
          )}
          {ctl("phone-down", t("call.end"), st.hangup, false, "end")}
        </div>
      )}
      {outputs && (
        <Menu x={outputs.x} y={outputs.y} items={outputs.items} onClose={() => setOutputs(null)} />
      )}
    </div>
  );

  return embedded ? panel : createPortal(panel, document.body);
}
