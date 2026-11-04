import { useEffect, useState } from "react";
import { mediaUrl, put } from "../api";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { lockHint, unlock, type Unlocked } from "../lockbox";
import { useApp } from "../store";
import type { Message } from "../types";
import { useTick } from "./hooks";

/** "Forwarded from Sara" above a forwarded message. */
export function ForwardLabel({ name }: { name: string }) {
  const t = useT();
  return (
    <div className="fwd-label">
      <Icon name="share" size={12} />
      {t("msg.forwardedFrom", { name })}
    </div>
  );
}

/**
 * A password-locked message: a lock with the hint until the right password is typed. What is
 * opened stays in this bubble's memory only and is never written to the phone's storage.
 */
export function LockedContent({ m }: { m: Message }) {
  const t = useT();
  const [open, setOpen] = useState<Unlocked | null>(null);
  const [asking, setAsking] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const hint = lockHint(m.text);
  useEffect(
    () => () => {
      if (open?.t === "file") URL.revokeObjectURL(open.url);
    },
    [open],
  );

  if (open?.t === "text") return <div className="text locked-open">{open.text}</div>;
  if (open?.t === "file")
    return open.mime.startsWith("image/") ? (
      <img className="locked-img" src={open.url} alt={open.name} />
    ) : open.mime.startsWith("video/") ? (
      <video className="locked-img" src={open.url} controls playsInline />
    ) : (
      <a className="file-box" href={open.url} download={open.name}>
        <span className="fi">
          <Icon name="file" size={20} />
        </span>
        <span className="grow">
          <span className="n">{open.name}</span>
        </span>
      </a>
    );

  const submit = async () => {
    if (!pw || busy) return;
    setBusy(true);
    setErr(false);
    try {
      setOpen(await unlock(m.text, pw, m.media?.id ? mediaUrl(m.media.id) : undefined));
    } catch {
      setErr(true);
      navigator.vibrate?.([30, 40, 30]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="locked-box" onClick={(e) => e.stopPropagation()}>
      <button className="locked-head" onClick={() => setAsking(true)} disabled={m.id < 0}>
        <span className="locked-icon">
          <Icon name="lock" size={18} />
        </span>
        <span className="grow">
          <b>{t(m.media ? "lock.lockedPhoto" : "lock.locked")}</b>
          {hint && <span className="muted">{t("lock.hint", { hint })}</span>}
        </span>
      </button>
      {asking && (
        <form
          className={`locked-form${err ? " err" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t("lock.password")}
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !pw}>
            {busy ? <span className="spinner" /> : t("lock.open")}
          </button>
        </form>
      )}
      {err && <div className="locked-err">{t("lock.wrong")}</div>}
    </div>
  );
}

/** A view-once photo or video: no preview, opens once, then it is gone for both sides. */
export function OnceContent({ m, out, onOpen }: { m: Message; out: boolean; onOpen: () => void }) {
  const t = useT();
  const video = m.media?.kind === "video" || m.kind === "video";
  const opened = m.once === 2;
  const canOpen = !out && !opened && m.id > 0;
  return (
    <button
      className={`once-box${opened ? " opened" : ""}`}
      onClick={canOpen ? onOpen : undefined}
      disabled={!canOpen}
    >
      <span className="once-icon">
        <Icon name={opened ? "eye" : video ? "video" : "image"} size={19} />
        <b>1</b>
      </span>
      <span className="grow">
        <b>{t(video ? "once.video" : "once.photo")}</b>
        <span className="muted">
          {opened ? t("once.opened") : out ? t("once.waiting") : t("once.tap")}
        </span>
      </span>
    </button>
  );
}

/** Time left before a self-destructing message disappears (or a timer mark until it is seen). */
export function TtlBadge({ m }: { m: Message }) {
  const lang = useApp((s) => s.lang);
  useTick(m.destroyAt ? 1000 : 0);
  if (!m.ttl) return null;
  if (!m.destroyAt)
    return (
      <span className="ttl-badge" title="⏱">
        <Icon name="clock" size={11} />
      </span>
    );
  const left = Math.max(0, m.destroyAt - Date.now());
  const p = Math.min(1, left / (m.ttl * 1000));
  const sec = Math.ceil(left / 1000);
  const label =
    sec >= 86400
      ? `${Math.ceil(sec / 86400)}d`
      : sec >= 3600
        ? `${Math.ceil(sec / 3600)}h`
        : sec >= 60
          ? `${Math.ceil(sec / 60)}m`
          : `${sec}s`;
  return (
    <span className="ttl-badge live" style={{ ["--p" as string]: p }}>
      <i />
      {lang === "fa" ? label.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : label}
    </span>
  );
}

/** Reactions under a message: one chip per emoji with a count; tap to add or remove yours. */
export function Reactions({ m }: { m: Message }) {
  const meId = useApp((s) => s.me?.id);
  const lang = useApp((s) => s.lang);
  if (!m.reactions?.length) return null;
  return (
    <div className="reactions">
      {m.reactions.map((r) => {
        const mine = !!meId && r.users.includes(meId);
        return (
          <button
            key={r.emoji}
            className={`react-chip${mine ? " mine" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              react(m, mine ? "" : r.emoji);
            }}
          >
            <span>{r.emoji}</span>
            {r.users.length > 1 && (
              <b>
                {lang === "fa"
                  ? String(r.users.length).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
                  : r.users.length}
              </b>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Sets (or clears with "") my reaction, showing it at once and correcting from the server. */
export async function react(m: Message, emoji: string) {
  const s = useApp.getState();
  const me = s.me?.id;
  if (!me || m.id < 0) return;
  const without = (m.reactions || [])
    .map((r) => ({ ...r, users: r.users.filter((u) => u !== me) }))
    .filter((r) => r.users.length);
  const next = emoji
    ? without.some((r) => r.emoji === emoji)
      ? without.map((r) => (r.emoji === emoji ? { ...r, users: [...r.users, me] } : r))
      : [...without, { emoji, users: [me] }]
    : without;
  s.applyReactions(m.chatId, m.id, next);
  try {
    const res = await put<{ reactions: Message["reactions"] }>(`/api/messages/${m.id}/reaction`, {
      emoji,
    });
    s.applyReactions(m.chatId, m.id, res.reactions || []);
  } catch {
    s.applyReactions(m.chatId, m.id, m.reactions || []);
  }
}

/** The emoji row at the top of a message's long-press menu. */
export function ReactionBar({ m, onDone }: { m: Message; onDone: () => void }) {
  const emojis = useApp((s) => s.config?.reactionEmojis) || [];
  const meId = useApp((s) => s.me?.id);
  const mine = m.reactions?.find((r) => meId && r.users.includes(meId))?.emoji;
  return (
    <div className="reaction-bar" role="group">
      {emojis.map((e) => (
        <button
          key={e}
          className={mine === e ? "on" : ""}
          onClick={() => {
            react(m, mine === e ? "" : e);
            onDone();
          }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
