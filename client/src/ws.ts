import { getToken } from "./api";
import { notifyMessage } from "./notify";
import { useApp } from "./store";
import type { Message, PublicConfig, User } from "./types";

type Listener = (d: any) => void;
const listeners = new Map<string, Set<Listener>>();
let socket: WebSocket | null = null;
let retry = 0;
let timer: number | undefined;
let wanted = false;
let everConnected = false;

export function onEvent(type: string, fn: Listener) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(fn);
  return () => listeners.get(type)!.delete(fn);
}

export function wsSend(t: string, d: unknown): boolean {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ t, d }));
  return true;
}

export function connect() {
  wanted = true;
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
  socket = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: "auth", d: { token: getToken() } }));
  ws.onmessage = (e) => {
    let msg: { t: string; d: any };
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    handle(msg.t, msg.d);
    listeners.get(msg.t)?.forEach((fn) => fn(msg.d));
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    useApp.setState({ connected: false });
    if (!wanted) return;
    // Exponential backoff with jitter, capped at 15s.
    const delay = Math.min(15000, 500 * 2 ** retry) * (0.7 + Math.random() * 0.6);
    retry++;
    timer = window.setTimeout(connect, delay);
  };
}

export function disconnect() {
  wanted = false;
  window.clearTimeout(timer);
  socket?.close();
  socket = null;
}

// Reconnect immediately when the network or the tab comes back.
window.addEventListener("online", () => {
  if (wanted && !socket) {
    window.clearTimeout(timer);
    retry = 0;
    connect();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wanted && !socket) {
    window.clearTimeout(timer);
    connect();
  }
});
setInterval(() => wsSend("ping", null), 30_000);

function handle(t: string, d: any) {
  const s = useApp.getState();
  switch (t) {
    case "ready": {
      retry = 0;
      useApp.setState({ connected: true });
      s.setMe(d.user as User);
      s.setConfig(d.config as PublicConfig);
      if (everConnected) s.markAllStale();
      everConnected = true;
      s.loadChats().then(() => {
        const active = useApp.getState().activeChatId;
        if (active) useApp.getState().loadMessages(active);
      });
      s.loadAds();
      break;
    }
    case "auth_error":
      wanted = false;
      s.logout();
      break;
    case "message": {
      const m = d as Message;
      s.applyMessage(m);
      if (m.senderId !== s.me?.id) notifyMessage(m);
      break;
    }
    case "message_edit":
      s.applyEdit(d);
      break;
    case "message_delete":
      s.applyDelete(d.chatId, d.id, d.lastMessageId);
      break;
    case "read":
      s.applyRead(d.chatId, d.userId, d.messageId);
      break;
    case "typing":
      s.applyTyping(d.chatId, d.userId, d.action);
      break;
    case "presence":
      s.applyPresence(d.userId, {
        online: d.online,
        lastSeen: d.lastSeen,
        lastSeenHidden: d.lastSeenHidden,
      });
      break;
    case "user_update":
      s.applyUser(d);
      break;
    case "chat_update":
      s.refreshChat(d.chatId);
      break;
    case "chat_removed":
      s.removeChat(d.chatId);
      break;
    case "config":
      s.setConfig(d);
      break;
    case "ads_changed":
      s.loadAds();
      break;
  }
}
