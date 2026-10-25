import { translate, toFaDigits } from "./i18n";
import type { Chat, Message, User } from "./types";

type Lang = "fa" | "en";
const locale = (lang: Lang) => (lang === "fa" ? "fa-IR" : "en-US");

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export function timeOf(ts: number, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ts);
}

/** Chat-list style stamp: time today, weekday this week, date otherwise. */
export function listStamp(ts: number, lang: Lang) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return timeOf(ts, lang);
  if (now.getTime() - ts < 6 * 864e5)
    return new Intl.DateTimeFormat(locale(lang), { weekday: "short" }).format(d);
  return new Intl.DateTimeFormat(locale(lang), { month: "short", day: "numeric" }).format(d);
}

export function dayLabel(ts: number, lang: Lang) {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return translate(lang, "chat.today");
  if (sameDay(d, new Date(now.getTime() - 864e5))) return translate(lang, "chat.yesterday");
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return new Intl.DateTimeFormat(locale(lang), opts).format(d);
}

export function presenceText(u: User | undefined, lang: Lang): string {
  if (!u) return "";
  if (u.online) return translate(lang, "presence.online");
  if (u.lastSeenHidden || !u.lastSeen) return translate(lang, "presence.recently");
  const diff = Date.now() - u.lastSeen;
  if (diff < 60_000) return translate(lang, "presence.justNow");
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  let t: string;
  if (diff < 3600_000) t = rtf.format(-Math.round(diff / 60_000), "minute");
  else if (diff < 86400_000) t = rtf.format(-Math.round(diff / 3600_000), "hour");
  else t = `${dayLabel(u.lastSeen, lang)} ${timeOf(u.lastSeen, lang)}`;
  return translate(lang, "presence.lastSeen", { t });
}

export function fileSize(bytes: number, lang: Lang) {
  const units = lang === "fa" ? ["بایت", "KB", "MB", "GB"] : ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const s = `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
  return lang === "fa" ? toFaDigits(s) : s;
}

export function duration(sec: number, lang: Lang) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  const out =
    h > 0
      ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  return lang === "fa" ? toFaDigits(out) : out;
}

export function num(n: number, lang: Lang) {
  return new Intl.NumberFormat(locale(lang)).format(n);
}

export function chatTitle(c: Chat, lang: Lang) {
  if (c.saved) return translate(lang, "list.saved");
  if (c.type === "direct") return c.peer?.displayName || c.peer?.username || "";
  return c.title;
}

export function systemText(m: Message, lang: Lang) {
  const name = m.sender?.displayName || "";
  const ev = m.text.split(":")[0];
  const key = (
    {
      created: "sys.created",
      joined: "sys.joined",
      left: "sys.left",
      added: "sys.added",
      removed: "sys.removed",
    } as const
  )[ev as "created"];
  return key ? translate(lang, key, { name }) : m.text;
}

export function callInfo(m: Message): { status: string; video: boolean; duration: number } {
  try {
    return JSON.parse(m.text);
  } catch {
    return { status: "ended", video: false, duration: 0 };
  }
}

/** One-line preview of a message, used in the chat list and reply bars. */
export function preview(m: Message | undefined, lang: Lang, meId?: number): string {
  if (!m) return "";
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  switch (m.kind) {
    case "system":
      return systemText(m, lang);
    case "call": {
      const c = callInfo(m);
      if (c.status === "ended")
        return `${c.video ? t("call.video") : t("call.voice")} · ${duration(c.duration, lang)}`;
      if (c.status === "missed" && m.senderId !== meId) return t("call.missed");
      return t(
        c.status === "rejected"
          ? "call.rejected"
          : c.status === "cancelled"
            ? "call.cancelled"
            : "call.missed",
      );
    }
    case "image":
      return `🖼 ${m.text || t("chat.photo")}`;
    case "video":
      return `🎬 ${m.text || t("chat.video")}`;
    case "voice":
      return `🎤 ${t("chat.voice")}`;
    case "audio":
      return `🎵 ${m.text || m.media?.name || t("chat.audio")}`;
    case "file":
      return `📎 ${m.text || m.media?.name || t("chat.file")}`;
  }
  return m.text;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = [...parts[0]][0] || "";
  const second = parts.length > 1 ? [...parts[1]][0] || "" : "";
  return (first + second).toUpperCase();
}
