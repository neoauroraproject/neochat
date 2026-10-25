import { useQuery, useQueryClient, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import type { Chat, ChatMember, Message, SendMessageRequest } from "@neochat/shared";
import { useToast } from "@neochat/ui";
import { useCallback, useEffect } from "react";
import { apiFetch } from "../lib/api";
import {
  decryptEnvelope,
  encryptText,
  encryptMediaMeta,
  encryptFile,
  getDeviceId,
  publishKeyBundle,
  DECRYPT_FAILED,
} from "../lib/crypto-session";
import { sdk } from "../lib/sdk";
import {
  connectRealtime,
  disconnectRealtime,
  setRealtimeHandlers,
  setOutboxSender,
  joinChat,
  leaveChat,
  enqueueOutbox,
  flushOutbox,
} from "../lib/ws";
import { useAuthStore } from "../stores/stores";
import { useChatStore, useMessageCache, usePrefsStore } from "../stores/messaging";

export function useInitCrypto() {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!user || !session) return;
    void (async () => {
      await getDeviceId();
      await publishKeyBundle(session.deviceId).catch(() => undefined);
    })();
  }, [user, session]);
}

export function useChatsQuery() {
  const setChats = useChatStore((s) => s.setChats);
  const query = useQuery({
    queryKey: ["chats"],
    queryFn: () => apiFetch<Chat[]>("/chats"),
  });

  useEffect(() => {
    if (query.data) setChats(query.data);
  }, [query.data, setChats]);

  return query;
}

export function useChatMembers(chatId: string | null) {
  return useQuery({
    queryKey: ["chat-members", chatId],
    queryFn: () => sdk.chats.listMembers(chatId!),
    enabled: !!chatId,
  });
}

function getPeerUserId(members: ChatMember[] | undefined, selfId: string): string | null {
  if (!members) return null;
  const peer = members.find((m) => m.userId !== selfId);
  return peer?.userId ?? null;
}

export function useMessagesQuery(chatId: string | null, chatType: Chat["type"] | null) {
  const userId = useAuthStore((s) => s.user?.id);
  const setDecrypted = useMessageCache((s) => s.setDecrypted);
  const membersQuery = useChatMembers(chatId);
  const peerUserId = chatType === "dm" ? getPeerUserId(membersQuery.data, userId ?? "") : null;

  const query = useInfiniteQuery({
    queryKey: ["messages", chatId],
    queryFn: async ({ pageParam }) => {
      const page = await sdk.messages.list(chatId!, {
        cursor: pageParam as number | undefined,
        limit: 30,
      });
      for (const msg of page.items) {
        const result = await decryptEnvelope(
          chatId!,
          chatType ?? "group",
          msg.envelope,
          msg.senderId,
          peerUserId,
        );
        setDecrypted({
          messageId: msg.id,
          chatId: chatId!,
          text: "error" in result ? DECRYPT_FAILED : result.text,
          failed: "error" in result,
        });
      }
      return page;
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!chatId && !!chatType,
  });

  return { ...query, peerUserId, members: membersQuery.data };
}

export function useSendMessage(
  chatId: string | null,
  chatType: Chat["type"] | null,
  peerUserId: string | null,
) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const setDecrypted = useMessageCache((s) => s.setDecrypted);

  return useMutation({
    mutationFn: async (input: { text: string; replyToId?: string; clientId?: string }) => {
      if (!chatId || !chatType || !user || !session) throw new Error("Not ready");
      const deviceId = session.deviceId;
      const envelope = await encryptText(chatId, chatType, peerUserId, input.text, deviceId);
      const body: SendMessageRequest = {
        chatId,
        contentType: "text",
        envelope,
        replyToId: input.replyToId,
        clientId: input.clientId ?? crypto.randomUUID(),
      };

      setDecrypted({
        messageId: body.clientId!,
        chatId,
        text: input.text,
        failed: false,
      });

      try {
        const msg = await sdk.messages.send(body);
        setDecrypted({ messageId: msg.id, chatId, text: input.text, failed: false });
        return msg;
      } catch (err) {
        await enqueueOutbox({
          id: body.clientId!,
          chatId,
          payload: JSON.stringify(body),
        });
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    },
  });
}

export function useUploadMedia(
  chatId: string | null,
  chatType: Chat["type"] | null,
  peerUserId: string | null,
) {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { file: File; kind: "image" | "file" | "voice" }) => {
      if (!chatId || !chatType || !session) throw new Error("Not ready");
      const { ciphertext, fileKey, sha256 } = await encryptFile(input.file);
      const presigned = await sdk.media.createUpload({
        chatId,
        kind: input.kind,
        mimeDeclared: input.file.type || "application/octet-stream",
        size: ciphertext.byteLength,
        sha256Ciphertext: sha256,
        fileName: input.file.name,
      });

      await fetch(presigned.uploadUrl, {
        method: presigned.method,
        headers: presigned.headers,
        body: ciphertext,
      });

      await sdk.media.confirmUpload(presigned.mediaObjectId, { size: ciphertext.byteLength });

      const fileKeyB64 = btoa(String.fromCharCode(...fileKey));
      const envelope = await encryptMediaMeta(
        chatId,
        chatType,
        peerUserId,
        {
          fileKey: fileKeyB64,
          fileName: input.file.name,
          mime: input.file.type,
          kind: input.kind,
        },
        session.deviceId,
      );

      return sdk.messages.send({
        chatId,
        contentType: "media",
        envelope,
        mediaObjectId: presigned.mediaObjectId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
    },
  });
}

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userId = useAuthStore((s) => s.user?.id);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const incrementUnread = useChatStore((s) => s.incrementUnread);
  const setTyping = useChatStore((s) => s.setTyping);
  const setPresence = useChatStore((s) => s.setPresence);
  const setDecrypted = useMessageCache((s) => s.setDecrypted);
  const soundEnabled = usePrefsStore((s) => s.soundEnabled);
  const browserNotifications = usePrefsStore((s) => s.browserNotifications);

  const handleDecrypt = useCallback(
    async (msg: Message) => {
      const chatType =
        useChatStore.getState().chats.find((c) => c.id === msg.chatId)?.type ?? "group";
      let peerUserId: string | null = null;
      if (chatType === "dm") {
        try {
          const members = await sdk.chats.listMembers(msg.chatId);
          peerUserId = getPeerUserId(members, userId ?? "");
        } catch {
          peerUserId = msg.senderId === userId ? null : msg.senderId;
        }
      }
      const result = await decryptEnvelope(
        msg.chatId,
        chatType,
        msg.envelope,
        msg.senderId,
        peerUserId,
      );
      setDecrypted({
        messageId: msg.id,
        chatId: msg.chatId,
        text: "error" in result ? DECRYPT_FAILED : result.text,
        failed: "error" in result,
      });
    },
    [userId, setDecrypted],
  );

  useEffect(() => {
    setOutboxSender(async (item) => {
      try {
        const body = JSON.parse(item.payload) as SendMessageRequest;
        await sdk.messages.send(body);
        return true;
      } catch {
        return false;
      }
    });
  }, []);

  useEffect(() => {
    const sock = connectRealtime();
    if (!sock) return;

    setRealtimeHandlers({
      onMessageCreated: (msg) => {
        void handleDecrypt(msg);
        void queryClient.invalidateQueries({ queryKey: ["messages", msg.chatId] });
        if (msg.chatId !== activeChatId) {
          incrementUnread(msg.chatId);
          toast("New message");
          if (soundEnabled) {
            const audio = new Audio(
              "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhBAAAAAA=",
            );
            void audio.play().catch(() => undefined);
          }
          if (browserNotifications && Notification.permission === "granted") {
            new Notification("NeoChat", { body: "New message", tag: msg.chatId });
          }
        }
      },
      onMessageUpdated: (msg) => {
        void handleDecrypt(msg);
        void queryClient.invalidateQueries({ queryKey: ["messages", msg.chatId] });
      },
      onMessageDeleted: ({ messageId }) => {
        useMessageCache.getState().removeDecrypted(messageId);
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      },
      onTypingStart: ({ chatId, userId: uid }) => setTyping(chatId, uid, true),
      onTypingStop: ({ chatId, userId: uid }) => setTyping(chatId, uid, false),
      onPresenceUpdated: ({ userId: uid, online, lastSeenAt }) =>
        setPresence(uid, { userId: uid, online, lastSeenAt }),
      onConnect: () => void flushOutbox(),
    });

    void sdk.presence.heartbeat().catch(() => undefined);
    const heartbeat = window.setInterval(() => {
      void sdk.presence.heartbeat().catch(() => undefined);
    }, 30_000);

    return () => {
      window.clearInterval(heartbeat);
      disconnectRealtime();
    };
  }, [
    activeChatId,
    browserNotifications,
    handleDecrypt,
    incrementUnread,
    queryClient,
    setPresence,
    setTyping,
    soundEnabled,
    toast,
  ]);
}

export function useJoinActiveChat(chatId: string | null) {
  useEffect(() => {
    if (!chatId) return;
    joinChat(chatId);
    return () => leaveChat(chatId);
  }, [chatId]);
}

export function useCreateChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { type: "dm"; peerUserId: string }
        | { type: "group"; title: string; memberIds: string[] }
        | { type: "channel"; title: string; description?: string },
    ) => {
      if (input.type === "dm") return sdk.chats.createDm({ peerUserId: input.peerUserId });
      if (input.type === "group")
        return sdk.chats.createGroup({ title: input.title, memberIds: input.memberIds });
      return sdk.chats.createChannel({
        title: input.title,
        description: input.description,
        isReadonly: true,
      });
    },
    onSuccess: (chat) => {
      useChatStore.getState().upsertChat(chat);
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
