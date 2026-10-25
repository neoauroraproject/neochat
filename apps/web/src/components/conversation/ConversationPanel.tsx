import type { Message } from "@neochat/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComposeDock, MessageBubble, TypingIndicator } from "./MessageBubble";
import { CallButtons } from "../calls/CallButtons";
import { useI18n } from "../../i18n/I18nProvider";
import {
  useJoinActiveChat,
  useMessagesQuery,
  useSendMessage,
  useUploadMedia,
} from "../../hooks/useMessaging";
import { apiFetch } from "../../lib/api";
import { encryptDraft, decryptDraft, getDeviceId } from "../../lib/crypto-session";
import { sdk } from "../../lib/sdk";
import { emitTypingStart, emitTypingStop } from "../../lib/ws";
import { useAuthStore, useUiStore } from "../../stores/stores";
import { useChatStore, useComposeStore, useMessageCache } from "../../stores/messaging";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function PresenceLabel({ userId }: { userId: string | null }) {
  const { t } = useI18n();
  const presence = useChatStore((s) => (userId ? s.presence[userId] : undefined));
  if (!userId) return <span className="tg-conv-status">{t("chat.selectChatHint")}</span>;
  if (presence?.online) return <span className="tg-conv-status is-online">{t("chat.online")}</span>;
  if (presence?.lastSeenAt) {
    return (
      <span className="tg-conv-status">
        {t("chat.lastSeen")} {new Date(presence.lastSeenAt).toLocaleString()}
      </span>
    );
  }
  return <span className="tg-conv-status">{t("chat.lastSeen")}</span>;
}

export function ConversationPanel({ onBack }: { onBack?: () => void }) {
  const { t } = useI18n();
  const userId = useAuthStore((s) => s.user?.id);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chats = useChatStore((s) => s.chats);
  const typing = useChatStore((s) => s.typing);
  const clearUnread = useChatStore((s) => s.clearUnread);
  const clearSelection = useChatStore((s) => s.clearSelection);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const chat = chats.find((c) => c.id === activeChatId) ?? null;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, peerUserId } =
    useMessagesQuery(activeChatId, chat?.type ?? null);
  useJoinActiveChat(activeChatId);

  const sendMessage = useSendMessage(activeChatId, chat?.type ?? null, peerUserId ?? null);
  const uploadMedia = useUploadMedia(activeChatId, chat?.type ?? null, peerUserId ?? null);

  const getDraft = useComposeStore((s) => s.getDraft);
  const setDraftLocal = useComposeStore((s) => s.setDraft);
  const clearDraftLocal = useComposeStore((s) => s.clearDraft);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);

  const messages = useMemo(
    () => (data?.pages.flatMap((p) => p.items) ?? []).slice().reverse(),
    [data],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 12,
  });

  useEffect(() => {
    if (activeChatId) {
      clearUnread(activeChatId);
      const draft = getDraft(activeChatId);
      if (!draft) {
        void apiFetch<{ ciphertext: string } | null>(`/chats/${activeChatId}/draft`)
          .then(async (d) => {
            if (d?.ciphertext) {
              const text = await decryptDraft(
                activeChatId,
                chat?.type ?? "group",
                d.ciphertext,
                peerUserId ?? null,
              );
              if (text) setDraftLocal(activeChatId, text);
            }
          })
          .catch(() => undefined);
      }
    }
  }, [activeChatId, chat?.type, clearUnread, getDraft, peerUserId, setDraftLocal]);

  const draftSaveTimer = useRef<number | null>(null);
  const saveDraft = useCallback(
    (text: string) => {
      if (!activeChatId) return;
      setDraftLocal(activeChatId, text);
      if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = window.setTimeout(() => {
        void (async () => {
          const deviceId = await getDeviceId();
          if (!text.trim()) {
            await apiFetch(`/chats/${activeChatId}/draft`, { method: "DELETE" }).catch(
              () => undefined,
            );
            return;
          }
          const ciphertext = await encryptDraft(
            activeChatId,
            chat?.type ?? "group",
            peerUserId ?? null,
            text,
            deviceId,
          );
          await apiFetch(`/chats/${activeChatId}/draft`, {
            method: "PUT",
            body: JSON.stringify({ ciphertext }),
          }).catch(() => undefined);
        })();
      }, 800);
    },
    [activeChatId, chat?.type, peerUserId, setDraftLocal],
  );

  const handleSend = useCallback(async () => {
    if (!activeChatId) return;
    const text = getDraft(activeChatId).trim();
    if (!text) return;
    await sendMessage.mutateAsync({ text, replyToId: replyToId ?? undefined });
    clearDraftLocal(activeChatId);
    setReplyToId(null);
    void apiFetch(`/chats/${activeChatId}/draft`, { method: "DELETE" }).catch(() => undefined);
    emitTypingStop(activeChatId);
    requestAnimationFrame(() => {
      const el = parentRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [activeChatId, clearDraftLocal, getDraft, replyToId, sendMessage]);

  const handleFiles = useCallback(
    (files: FileList) => {
      void (async () => {
        for (const file of files) {
          const kind = file.type.startsWith("image/") ? "image" : "file";
          await uploadMedia.mutateAsync({ file, kind });
        }
      })();
    },
    [uploadMedia],
  );

  const handleVoice = useCallback(() => {
    if (recording) {
      recording.stop();
      setRecording(null);
      return;
    }
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        void uploadMedia.mutateAsync({ file, kind: "voice" });
      };
      rec.start();
      setRecording(rec);
    });
  }, [recording, uploadMedia]);

  useEffect(() => {
    const onScroll = () => {
      const el = parentRef.current;
      if (!el || !hasNextPage || isFetchingNextPage) return;
      if (el.scrollTop < 80) void fetchNextPage();
    };
    const el = parentRef.current;
    el?.addEventListener("scroll", onScroll);
    return () => el?.removeEventListener("scroll", onScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
        if (onBack) {
          setActiveChat(null);
          onBack();
        }
      }
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        document.getElementById("chat-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection, onBack, setActiveChat]);

  const typingUsers = activeChatId
    ? [...(typing[activeChatId] ?? [])].filter((id) => id !== userId)
    : [];

  const title = chat?.title ?? chat?.type ?? "";

  if (!activeChatId || !chat) {
    return (
      <div className="tg-conv">
        <div className="tg-empty">
          <div className="tg-empty-card">
            <h3>{t("chat.selectChat")}</h3>
            <p>{t("chat.selectChatHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="tg-conv">
      <header className="tg-conv-header">
        {onBack ? (
          <button
            type="button"
            className="tg-icon-btn md:hidden"
            aria-label="Back"
            onClick={() => {
              setActiveChat(null);
              onBack();
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
        ) : null}
        <div className="tg-avatar tg-avatar--sm" aria-hidden>
          {initials(title)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="tg-conv-title truncate">{title}</div>
          {typingUsers.length > 0 ? (
            <span className="tg-conv-status is-online">{t("chat.typing")}</span>
          ) : (
            <PresenceLabel userId={chat.type === "dm" ? peerUserId : null} />
          )}
        </div>
        <CallButtons chatId={activeChatId} />
        <button
          type="button"
          className="tg-icon-btn"
          aria-label="Search in chat"
          title="Search"
          onClick={() => document.getElementById("chat-search")?.focus()}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
        </button>
        <button
          type="button"
          className="tg-icon-btn"
          aria-label="Chat info"
          title="Info (Ctrl+I)"
          onClick={() => useUiStore.getState().toggleRightPanel()}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
        </button>
      </header>

      {messages.some((m) => m.pinnedAt) ? (
        <div className="tg-pinned-banner" role="status">
          <span className="tg-pinned-label">Pinned message</span>
          <span className="tg-pinned-text">
            {(() => {
              const pinned = [...messages].reverse().find((m) => m.pinnedAt);
              if (!pinned) return "";
              const cached = useMessageCache.getState().cache[pinned.id];
              return cached?.text ?? "Encrypted message";
            })()}
          </span>
        </div>
      ) : null}
      <div
        ref={parentRef}
        className="tg-messages tg-scroll"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {isFetchingNextPage ? (
          <div className="tg-day-sep">
            <span>…</span>
          </div>
        ) : null}
        {isLoading ? (
          <div className="tg-empty">
            <div className="tg-empty-card">{t("common.loading")}</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="tg-empty">
            <div className="tg-empty-card">
              <h3>{t("chat.noMessages")}</h3>
              <p>{t("chat.noMessagesHint")}</p>
            </div>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const message = messages[item.index] as Message;
              return (
                <div
                  key={message.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    insetInlineStart: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <MessageBubble
                    message={message}
                    onReply={() => setReplyToId(message.id)}
                    onEdit={() => {
                      const cached = useMessageCache.getState().cache[message.id];
                      if (cached) setDraftLocal(activeChatId, cached.text);
                    }}
                    onDelete={() => void sdk.messages.remove(message.id)}
                    onCopy={() => {
                      const cached = useMessageCache.getState().cache[message.id];
                      if (cached) void navigator.clipboard.writeText(cached.text);
                    }}
                    onPin={() =>
                      message.pinnedAt
                        ? void sdk.chats.unpinMessage(chat.id, message.id)
                        : void sdk.chats.pinMessage(chat.id, message.id)
                    }
                    onReact={(emoji) => void sdk.messages.react(message.id, { emoji })}
                    onForward={() => undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TypingIndicator userIds={typingUsers} />

      <ComposeDock
        value={getDraft(activeChatId)}
        onChange={(v) => saveDraft(v)}
        onSend={() => void handleSend()}
        onTypingStart={() => emitTypingStart(activeChatId)}
        onTypingStop={() => emitTypingStop(activeChatId)}
        onFile={handleFiles}
        onVoice={handleVoice}
        disabled={sendMessage.isPending}
        replyTo={replyToId}
        onCancelReply={() => setReplyToId(null)}
      />
    </section>
  );
}
