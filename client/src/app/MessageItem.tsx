import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { mediaUrl } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, usePress } from "../components/ui";
import { callInfo, duration, fileSize, systemText, timeOf } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, Message } from "../types";

const urlRe = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

function linkify(text: string): ReactNode[] {
  const parts = text.split(urlRe);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <a key={i} href={p} target="_blank" rel="noopener noreferrer">
        {p}
      </a>
    ) : (
      p
    ),
  );
}

interface Props {
  m: Message;
  chat: Chat;
  first: boolean;
  last: boolean;
  onMenu: (m: Message, x: number, y: number) => void;
  onOpenMedia: (m: Message) => void;
  onJumpTo: (id: number) => void;
}

export const MessageItem = memo(function MessageItem({
  m,
  chat,
  first,
  last,
  onMenu,
  onOpenMedia,
  onJumpTo,
}: Props) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const meId = useApp((s) => s.me?.id);
  const press = usePress((x, y) => onMenu(m, x, y));

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

  return (
    <div
      className={`msg ${out ? "out" : "in"}${first ? " first" : ""}${last ? " last" : ""}`}
      data-id={m.id}
      {...press}
      onClick={m.failed ? () => onMenu(m, 0, 0) : undefined}
    >
      {showAvatar && (
        <div className="avatar-slot">
          {last && (
            <Avatar id={m.senderId} name={m.sender.displayName} media={m.sender.avatar} size={34} />
          )}
        </div>
      )}
      <div className={`bubble${mediaOnly ? " media-only" : ""}`}>
        {showSender && (
          <div className="sender" style={{ color: senderColor(m.senderId) }}>
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
        ) : (
          <MediaContent m={m} onOpen={() => onOpenMedia(m)} />
        )}
        {m.text && m.kind !== "call" && <div className="text">{linkify(m.text)}</div>}
        {m.failed && (
          <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 2 }}>
            {t("chat.failed")}
          </div>
        )}
        {stamp}
      </div>
    </div>
  );
});

const senderColors = [
  "#ff9f0a",
  "#64d2ff",
  "#30d158",
  "#bf5af2",
  "#ff6b8b",
  "#ffd60a",
  "#5e9cff",
  "#ff8a65",
];
const senderColor = (id: number) => senderColors[id % senderColors.length];

function MediaContent({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const md = m.media;
  if (!md) return null;
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
        {progress}
      </button>
    );
  }
  if (m.kind === "video") {
    return (
      <button className="media-box" onClick={onOpen} style={{ width: 320, aspectRatio: "16 / 10" }}>
        {src && (
          <video src={src + (m.localUrl ? "" : "#t=0.1")} preload="metadata" muted playsInline />
        )}
        {progress || (
          <span className="play">
            <Icon name="play" size={24} filled />
          </span>
        )}
      </button>
    );
  }
  if (m.kind === "voice" || m.kind === "audio") return <VoicePlayer m={m} src={src} />;
  return (
    <a
      className="file-box"
      href={md.id ? mediaUrl(md.id) : undefined}
      download={md.name}
      onClick={(e) => m.pending && e.preventDefault()}
    >
      <span className="fi">
        {m.pending ? (
          <div
            className="ring"
            style={{
              ["--p" as string]: m.progress || 0,
              width: 34,
              height: 34,
              WebkitMask: "radial-gradient(circle, transparent 13px, #000 14px)",
              mask: "radial-gradient(circle, transparent 13px, #000 14px)",
            }}
          />
        ) : (
          <Icon name="download" size={22} />
        )}
      </span>
      <span className="grow">
        <span className="n" style={{ display: "block" }}>
          {md.name || t("chat.file")}
        </span>
        <span className="s">{fileSize(md.size, lang)}</span>
      </span>
    </a>
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
