import type { CallInvite, CallSession, Message } from "@neochat/shared";
import { io, type Socket } from "socket.io-client";
import { getTokens } from "./api";
import { idbDelete, idbGetAll, idbSet } from "./idb";

export type RealtimeEventHandlers = {
  onMessageCreated?: (message: Message) => void;
  onMessageUpdated?: (message: Message) => void;
  onMessageDeleted?: (data: { messageId: string; chatId?: string }) => void;
  onTypingStart?: (data: { chatId: string; userId: string }) => void;
  onTypingStop?: (data: { chatId: string; userId: string }) => void;
  onReceiptUpdated?: (data: {
    messageId: string;
    userId: string;
    status: string;
    chatId?: string;
  }) => void;
  onPresenceUpdated?: (data: { userId: string; online: boolean; lastSeenAt: string }) => void;
  onCallInvite?: (invite: CallInvite) => void;
  onCallAccept?: (data: { callId: string; userId: string; session: CallSession }) => void;
  onCallReject?: (data: { callId: string; userId: string }) => void;
  onCallEnd?: (data: {
    callId: string;
    userId: string;
    reason: string;
    session: CallSession;
  }) => void;
  onCallParticipantJoined?: (data: {
    callId: string;
    userId: string;
    displayName?: string;
  }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export interface OutboxItem {
  id: string;
  chatId: string;
  payload: string;
  createdAt: string;
  retries: number;
}

let socket: Socket | null = null;
let handlers: RealtimeEventHandlers = {};

function wsUrl(): string {
  const base = import.meta.env.VITE_API_URL ?? "";
  return `${base}/ws`;
}

export function setRealtimeHandlers(next: RealtimeEventHandlers): void {
  handlers = { ...handlers, ...next };
}

export function connectRealtime(): Socket | null {
  const { access } = getTokens();
  if (!access) return null;

  if (socket?.connected) return socket;

  socket = io(wsUrl(), {
    auth: { token: access },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on("connect", () => {
    handlers.onConnect?.();
    void flushOutbox();
  });

  socket.on("disconnect", () => {
    handlers.onDisconnect?.();
  });

  socket.on("message.created", (message: Message) => {
    handlers.onMessageCreated?.(message);
  });

  socket.on("message.updated", (message: Message) => {
    handlers.onMessageUpdated?.(message);
  });

  socket.on("message.deleted", (data: { messageId: string }) => {
    handlers.onMessageDeleted?.(data);
  });

  socket.on("typing.start", (data: { chatId: string; userId: string }) => {
    handlers.onTypingStart?.(data);
  });

  socket.on("typing.stop", (data: { chatId: string; userId: string }) => {
    handlers.onTypingStop?.(data);
  });

  socket.on("receipt.updated", (data: { messageId: string; userId: string; status: string }) => {
    handlers.onReceiptUpdated?.(data);
  });

  socket.on("presence.updated", (data: { userId: string; online: boolean; lastSeenAt: string }) => {
    handlers.onPresenceUpdated?.(data);
  });

  socket.on("call.invite", (invite: CallInvite) => {
    handlers.onCallInvite?.(invite);
  });

  socket.on("call.accept", (data: { callId: string; userId: string; session: CallSession }) => {
    handlers.onCallAccept?.(data);
  });

  socket.on("call.reject", (data: { callId: string; userId: string }) => {
    handlers.onCallReject?.(data);
  });

  socket.on(
    "call.end",
    (data: { callId: string; userId: string; reason: string; session: CallSession }) => {
      handlers.onCallEnd?.(data);
    },
  );

  socket.on(
    "call.participant-joined",
    (data: { callId: string; userId: string; displayName?: string }) => {
      handlers.onCallParticipantJoined?.(data);
    },
  );

  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

export function joinChat(chatId: string): void {
  socket?.emit("chat.join", { chatId });
}

export function leaveChat(chatId: string): void {
  socket?.emit("chat.leave", { chatId });
}

export function emitTypingStart(chatId: string): void {
  socket?.emit("typing.start", { chatId });
}

export function emitTypingStop(chatId: string): void {
  socket?.emit("typing.stop", { chatId });
}

export async function enqueueOutbox(
  item: Omit<OutboxItem, "createdAt" | "retries">,
): Promise<void> {
  const entry: OutboxItem = { ...item, createdAt: new Date().toISOString(), retries: 0 };
  await idbSet("outbox", item.id, entry);
}

export async function removeOutbox(id: string): Promise<void> {
  await idbDelete("outbox", id);
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return idbGetAll<OutboxItem>("outbox");
}

export type OutboxSender = (item: OutboxItem) => Promise<boolean>;

let outboxSender: OutboxSender | null = null;

export function setOutboxSender(sender: OutboxSender): void {
  outboxSender = sender;
}

export async function flushOutbox(): Promise<void> {
  if (!outboxSender) return;
  const items = await listOutbox();
  for (const item of items) {
    try {
      const ok = await outboxSender(item);
      if (ok) await removeOutbox(item.id);
    } catch {
      await idbSet("outbox", item.id, { ...item, retries: item.retries + 1 });
    }
  }
}
