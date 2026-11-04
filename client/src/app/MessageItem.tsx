import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { mediaUrl } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, usePress } from "../components/ui";
import { cancelDownload, saveFile, startDownload, useDownload } from "../downloads";
import { callInfo, dateOf, duration, fileSize, systemText, timeOf } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, Message } from "../types";
import {
  ForwardLabel,
  LockedContent,
  OnceContent,
  react,
  Reactions,
  TtlBadge,
} from "./MessageExtras";

const urlRe = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;
const mentionRe = /(@[a-zA-Z][a-zA-Z0-9_]{3,31})/g;

/** Links open in a new tab; @usernames are tinted with the accent like the reference's mentions. */
function linkify(text: string): ReactNode[] {
  const parts = text.split(urlRe);
  return parts.flatMap((p, i) =>
    i % 2 === 1
      ? [
          <a key={i} href={p} target="_blank" rel="noopener noreferrer">
            {p}
          </a>,
        ]
      : p.split(mentionRe).map((q, j) =>
          j % 2 === 1 ? (
            <span key={`${i}-${j}`} className="mention">
              {q}
            </span>
          ) : (
            q
          ),
        ),
  );
}

/** Swipe a bubble toward the inline start to reply; it follows the finger, ticks at the threshold, springs back. */
function useSwipeReply(onReply: (() => void) | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{ x0: number; y0: number; locked?: "x" | "y"; passed: boolean } | null>(null);
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const sign = rtl ? 1 : -1;
  const TH = 64;
  const paint = (dx: number, animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? "transform 360ms cubic-bezier(0.32, 0.72, 0, 1)" : "none";
    el.style.transform = dx ? `translateX(${dx}px)` : "";
    const p = Math.min(1, Math.abs(dx) / TH);
    el.style.setProperty("--reply-p", String(p));
    el.style.setProperty("--reply-dx", `${dx}px`);
  };
  if (!onReply) return { ref, handlers: {} };
  return {
    ref,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch") return;
        st.current = { x0: e.clientX, y0: e.clientY, passed: false };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = st.current;
        if (!s) return;
        const dx = e.clientX - s.x0;
        const dy = e.clientY - s.y0;
        if (!s.locked) {
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          s.locked = Math.abs(dx) > Math.abs(dy) * 1.4 ? "x" : "y";
          if (s.locked === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        if (s.locked !== "x") return;
        let travel = sign * dx; // positive toward the inline start
        if (travel < 0) travel = 0;
        // resistance after the threshold, like a rubber band
        const shown = travel <= TH ? travel : TH + (travel - TH) * 0.25;
        paint(sign * shown, false);
        const passed = travel >= TH;
        if (passed !== s.passed) {
          s.passed = passed;
          if (passed) navigator.vibrate?.(8);
        }
      },
      onPointerUp: () => {
        const s = st.current;
        st.current = null;
        if (!s || s.locked !== "x") return;
        paint(0, true);
        if (s.passed) onReply();
      },
      onPointerCancel: () => {
        st.current = null;
        paint(0, true);
      },
    },
  };
}

interface Props {
  m: Message;
  chat: Chat;
  /** The run's last message, given to its first one so the meta line can show the run's ticks. */
  tail?: Message;
  first: boolean;
  fresh?: boolean;
  last: boolean;
  onMenu: (m: Message, x: number, y: number) => void;
  onOpenMedia: (m: Message) => void;
  onJumpTo: (id: number) => void;
  onReply?: (m: Message) => void;
  /** Selection mode (forwarding several messages): taps toggle instead of acting. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (m: Message) => void;
}

export const MessageItem = memo(function MessageItem({
  m,
  chat,
  tail,
  first,
  last,
  fresh,
  onMenu,
  onOpenMedia,
  onJumpTo,
  onReply,
  selecting,
  selected,
  onToggleSelect,
}: Props) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const meId = useApp((s) => s.me?.id);
  const press = usePress((x, y) => onMenu(m, x, y));
  const swipe = useSwipeReply(
    onReply && m.id > 0 && m.kind !== "call" && !selecting ? () => onReply(m) : undefined,
  );
  const heartOk = useApp((s) => s.config?.reactionEmojis?.includes("❤️"));
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  // Two quick taps on the text: a quick heart.
  const onBubbleUp = (e: React.PointerEvent) => {
    if (selecting || m.id < 0 || !heartOk || m.kind === "call") return;
    if ((e.target as HTMLElement).closest("button, a, img, video, input, form")) return;
    const now = e.timeStamp;
    const prev = lastTap.current;
    if (now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 24) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      const mine = m.reactions?.find((r) => meId && r.users.includes(meId))?.emoji;
      react(m, mine === "❤️" ? "" : "❤️");
      navigator.vibrate?.(8);
    } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
  };

  if (m.kind === "system") return <div className="sys-msg">{systemText(m, lang)}</div>;

  const out = m.senderId === meId && chat.type !== "channel";
  const showSender = chat.type === "group" && !out && first;
  const showAvatar = chat.type === "group" && !out;
  const read = out && m.id > 0 && chat.othersReadId >= m.id;
  const mediaOnly =
    !!m.media && !m.text && (m.kind === "image" || m.kind === "video") && !m.reply && !showSender;

  const stamp = (
    <span className="stamp">
      {m.editedAt ? `${t("chat.edited")} · ` : ""}
      <TtlBadge m={m} />
      {timeOf(m.createdAt, lang)}
      {out &&
        (m.failed ? (
          <Icon name="alert" size={14} className="failed" />
        ) : m.pending ? (
          <Icon name="clock" size={13} />
        ) : (
          <Icon name={read ? "checks" : "check"} size={15} className={read ? "read" : ""} />
        ))}
    </span>
  );

  // Desktop shows "Name, 12:04" above each run like the reference; phones keep the in-bubble stamp.
  const end = tail || m;
  const endRead = out && end.id > 0 && chat.othersReadId >= end.id;
  const meta = first && (
    <div className="msg-meta">
      <bdi className="who">
        {out ? t("common.you") : chat.type === "channel" ? chat.title : m.sender.displayName}
      </bdi>
      <span className="when">
        {lang === "fa" ? "، " : ", "}
        {timeOf(m.createdAt, lang)}
        {m.editedAt ? ` · ${t("chat.edited")}` : ""}
      </span>
      {out &&
        (end.failed ? (
          <Icon name="alert" size={13} className="failed" />
        ) : end.pending ? (
          <Icon name="clock" size={12} />
        ) : (
          <Icon name={endRead ? "checks" : "check"} size={14} className={endRead ? "read" : ""} />
        ))}
    </div>
  );

  return (
    <div
      className={`msg ${out ? "out" : "in"}${first ? " first" : ""}${last ? " last" : ""}${fresh ? " fresh" : ""}${selecting ? " selecting" : ""}${selected ? " selected" : ""}`}
      data-id={m.id}
      ref={swipe.ref}
      {...swipe.handlers}
      {...(selecting ? {} : press)}
      onClickCapture={
        selecting
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect?.(m);
            }
          : undefined
      }
      onClick={m.failed && !selecting ? () => onMenu(m, 0, 0) : undefined}
    >
      {selecting && (
        <span className="sel-check" aria-hidden="true">
          {selected && <Icon name="check" size={14} stroke={3} />}
        </span>
      )}
      <span className="reply-hint" aria-hidden="true">
        <Icon name="reply" size={20} />
      </span>
      {showAvatar && (
        <div className="avatar-slot">
          {last && (
            <Avatar id={m.senderId} name={m.sender.displayName} media={m.sender.avatar} size={30} />
          )}
        </div>
      )}
      <div className="msg-col">
        {meta}
        <div
          className={`bubble${mediaOnly && !m.once ? " media-only" : ""}`}
          title={timeOf(m.createdAt, lang)}
          onPointerUp={onBubbleUp}
        >
          {m.fwdName && <ForwardLabel name={m.fwdName} />}
          {showSender && (
            <div className="sender" style={{ ["--h" as string]: senderHue(m.senderId) }}>
              {m.sender.displayName}
            </div>
          )}
          {m.reply && (
            <button
              className="reply-quote"
              onClick={() => onJumpTo(m.reply!.id)}
              style={{ color: out ? "#fff" : "var(--accent)" }}
            >
              <b>{m.reply.senderName}</b>
              <span>{m.reply.text || t("chat.photo")}</span>
            </button>
          )}
          {m.kind === "call" ? (
            <CallBubble m={m} chat={chat} out={m.senderId === meId} />
          ) : m.kind === "locked" ? (
            <LockedContent m={m} />
          ) : m.once ? (
            <OnceContent m={m} out={m.senderId === meId} onOpen={() => onOpenMedia(m)} />
          ) : (
            <MediaContent m={m} onOpen={() => onOpenMedia(m)} />
          )}
          {m.text && m.kind !== "call" && m.kind !== "locked" && !m.once && (
            <div className="text">{linkify(m.text)}</div>
          )}
          {m.failed && (
            <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 2 }}>
              {t("chat.failed")}
            </div>
          )}
          {stamp}
        </div>
        <Reactions m={m} />
      </div>
    </div>
  );
});

// Sender names get a hue only; saturation/lightness come from the theme so they stay calm and readable.
const senderHues = [28, 150, 196, 258, 318, 344, 212, 80];
const senderHue = (id: number) => senderHues[Math.abs(id) % senderHues.length];

function MediaContent({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const md = m.media;
  const dl = useDownload(md?.id);
  if (!md) return null;
  if (md.expired) return <ExpiredMedia m={m} onOpen={onOpen} />;
  const src = m.localUrl || (md.id ? mediaUrl(md.id) : "");
  const progress =
    m.pending && m.progress !== undefined ? (
      <div className="progress">
        <div className="ring" style={{ ["--p" as string]: m.progress }} />
      </div>
    ) : null;

  if (m.kind === "image") {
    const ratio = md.width && md.height ? `${md.width} / ${md.height}` : undefined;
    return (
      <button
        className="media-box"
        onClick={onOpen}
        style={{ aspectRatio: ratio, width: md.width ? Math.min(380, md.width) : undefined }}
      >
        <img
          src={m.localUrl || mediaUrl(md.id, !!md.hasThumb)}
          alt={md.name}
          loading="lazy"
          decoding="async"
        />
        {progress || (md.id && <DownloadOverlay id={md.id} />)}
        <ExpiryChip at={md.expiresAt} />
      </button>
    );
  }
  if (m.kind === "video") {
    return (
      <button className="media-box" onClick={onOpen} style={{ width: 320, aspectRatio: "16 / 10" }}>
        {src && (
          <video src={src + (m.localUrl ? "" : "#t=0.1")} preload="metadata" muted playsInline />
        )}
        {progress ||
          (dl?.state === "loading" ? (
            <DownloadOverlay id={md.id} />
          ) : (
            <span className="play">
              <Icon name="play" size={24} filled />
            </span>
          ))}
        <ExpiryChip at={md.expiresAt} />
      </button>
    );
  }
  if (m.kind === "voice" || m.kind === "audio") return <VoicePlayer m={m} src={src} />;
  return <FileBox m={m} />;
}

const WEEK = 7 * 86_400_000;

/** "On the server until 14 Azar" — shown only in the last week, so it reads as a heads-up. */
function ExpiryChip({ at, inline }: { at?: number; inline?: boolean }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  if (!at || at - Date.now() > WEEK || at < Date.now()) return null;
  return (
    <span className={`expiry-chip${inline ? " inline" : ""}`}>
      <Icon name="clock" size={11} />
      {t("storage.until", { d: dateOf(at, lang) })}
    </span>
  );
}

/**
 * A file whose bytes left the server. Its message stays with the name and size; a photo the
 * phone still has in its media cache keeps showing.
 */
function ExpiredMedia({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const md = m.media!;
  const [gone, setGone] = useState(m.kind !== "image");
  if (!gone)
    return (
      <button className="media-box" onClick={onOpen}>
        <img src={mediaUrl(md.id, !!md.hasThumb)} alt={md.name} onError={() => setGone(true)} />
      </button>
    );
  return (
    <div className="file-box expired">
      <span className="fi">
        <Icon name="clock" size={20} />
      </span>
      <span className="grow">
        <span className="n" style={{ display: "block" }}>
          {md.name || t("chat.file")}
        </span>
        <span className="s">
          {fileSize(md.size, lang)} · {t("storage.expired")}
        </span>
      </span>
    </div>
  );
}

/** A small ring for upload or download progress, sized to sit in the file icon. */
function Ring({ p }: { p: number }) {
  return (
    <div
      className="ring"
      style={{
        ["--p" as string]: p,
        width: 34,
        height: 34,
        WebkitMask: "radial-gradient(circle, transparent 13px, #000 14px)",
        mask: "radial-gradient(circle, transparent 13px, #000 14px)",
      }}
    />
  );
}

/** Download ring over a photo or video while the file itself is being saved. */
function DownloadOverlay({ id }: { id: string }) {
  const job = useDownload(id);
  if (job?.state !== "loading") return null;
  return (
    <span
      className="progress dl"
      role="button"
      aria-label="cancel"
      onClick={(e) => {
        e.stopPropagation();
        cancelDownload(id);
      }}
    >
      <div className="ring" style={{ ["--p" as string]: job.progress }} />
      <Icon name="x" size={16} />
    </span>
  );
}

function FileBox({ m }: { m: Message }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const md = m.media!;
  const job = useDownload(md.id);
  const loading = job?.state === "loading";
  const done = job?.state === "done";
  const onClick = () => {
    if (m.pending || !md.id) return;
    if (loading) cancelDownload(md.id);
    else if (done) saveFile(md);
    else startDownload(md);
  };
  return (
    <button
      className={`file-box${done ? " done" : ""}`}
      onClick={onClick}
      aria-label={loading ? t("common.cancel") : done ? t("dl.save") : t("chat.download")}
    >
      <span className="fi">
        {m.pending ? (
          <Ring p={m.progress || 0} />
        ) : loading ? (
          <>
            <Ring p={job.progress} />
            <Icon name="x" size={14} className="fi-x" />
          </>
        ) : (
          <Icon name={done ? "check" : "download"} size={22} />
        )}
      </span>
      <span className="grow">
        <span className="n" style={{ display: "block" }}>
          {md.name || t("chat.file")}
        </span>
        <span className="s">
          {loading
            ? `${fileSize(md.size * job.progress, lang)} / ${fileSize(md.size, lang)}`
            : fileSize(md.size, lang)}
          {done && ` · ${t("dl.done")}`}
        </span>
        <ExpiryChip at={md.expiresAt} inline />
      </span>
    </button>
  );
}

function VoicePlayer({ m, src }: { m: Message; src: string }) {
  const lang = useApp((s) => s.lang);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  // A stable pseudo-waveform derived from the message id (real analysis would need decoding the audio).
  const bars = Array.from(
    { length: 32 },
    (_, i) => 0.25 + Math.abs(Math.sin(m.id * 0.37 + i * 1.7) * Math.cos(i * 0.6 + m.id)) * 0.75,
  );
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => setPos(a.currentTime);
    const onMeta = () => isFinite(a.duration) && setDur(a.duration);
    const onEnd = () => {
      setPlaying(false);
      setPos(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (playing) a.pause();
    else {
      document.querySelectorAll("audio").forEach((x) => x !== a && x.pause());
      a.play().catch(() => {});
    }
    setPlaying(!playing);
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    let f = (e.clientX - r.left) / r.width;
    if (getComputedStyle(e.currentTarget).direction === "rtl") f = 1 - f;
    a.currentTime = Math.max(0, Math.min(1, f)) * dur;
  };
  const frac = dur ? pos / dur : 0;
  return (
    <div className="voice-box" dir="ltr">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button className="pp" onClick={toggle} aria-label="play">
        <Icon
          name={playing ? "pause" : "play"}
          size={18}
          filled={!playing}
          stroke={playing ? 3 : 1.8}
        />
      </button>
      <div className="bars" onClick={seek}>
        {bars.map((h, i) => (
          <i
            key={i}
            className={i / bars.length < frac ? "on" : ""}
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>
      <span className="d">{duration(playing || pos ? pos : dur, lang)}</span>
    </div>
  );
}

function CallBubble({ m, chat, out }: { m: Message; chat: Chat; out: boolean }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const c = callInfo(m);
  const missed = c.status !== "ended";
  const label =
    c.status === "ended"
      ? out
        ? t("call.outgoing")
        : t("call.incoming")
      : c.status === "rejected"
        ? t("call.rejected")
        : c.status === "cancelled"
          ? t("call.cancelled")
          : t("call.missed");
  return (
    <button
      className="call-msg"
      onClick={() => chat.peer && useCall.getState().start(chat.peer, c.video)}
    >
      <span className={`ci${missed ? " missed" : ""}`}>
        <Icon name={c.video ? "video" : "phone"} size={18} />
      </span>
      <span className="grow">
        <span className="t" style={{ display: "block" }}>
          {label}
        </span>
        <span className="s">
          {c.status === "ended"
            ? duration(c.duration, lang)
            : c.video
              ? t("call.video")
              : t("call.voice")}
        </span>
      </span>
    </button>
  );
}
