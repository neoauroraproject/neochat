import { chatTitle, preview } from "./format";
import { useApp } from "./store";
import type { Message } from "./types";

const PREF_NOTIFY = "neochat.notify";
const PREF_SOUND = "neochat.sound";

export function getPref(key: "notify" | "sound"): boolean {
  try {
    return localStorage.getItem(key === "notify" ? PREF_NOTIFY : PREF_SOUND) !== "0";
  } catch {
    return true;
  }
}

export function setPref(key: "notify" | "sound", v: boolean) {
  try {
    localStorage.setItem(key === "notify" ? PREF_NOTIFY : PREF_SOUND, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;
export function audio(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** A short two-tone chime synthesized on the fly — no audio assets to ship. */
export function chime() {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.09);
    o.stop(t + i * 0.09 + 0.3);
  });
}

export function notifyMessage(m: Message) {
  const s = useApp.getState();
  const chat = s.chats[m.chatId];
  if (!chat || chat.muted || m.kind === "system") return;
  const viewing = s.activeChatId === m.chatId && document.visibilityState === "visible";
  if (viewing) return;
  if (getPref("sound")) chime();
  if (document.visibilityState === "visible" || !getPref("notify")) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const title =
    chat.type === "group"
      ? `${m.sender.displayName} · ${chatTitle(chat, s.lang)}`
      : chatTitle(chat, s.lang);
  try {
    const n = new Notification(title, {
      body: preview(m, s.lang, s.me?.id),
      tag: `chat-${m.chatId}`,
      icon: "/icon.svg",
    });
    n.onclick = () => {
      window.focus();
      useApp.getState().openChat(m.chatId);
      n.close();
    };
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}
