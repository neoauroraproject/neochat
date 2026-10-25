import type { Message } from "@neochat/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { useMessageCache, useChatStore } from "../../stores/messaging";
import { useAuthStore } from "../../stores/stores";

function StatusTicks({ isOwn }: { isOwn: boolean }) {
  if (!isOwn) return null;
  return (
    <span className="tg-ticks" aria-label="Delivered">
      ✓✓
    </span>
  );
}

export function MessageBubble({
  message,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  onPin,
  onReact,
  onForward,
}: {
  message: Message;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPin: () => void;
  onReact: (emoji: string) => void;
  onForward: () => void;
}) {
  const { t } = useI18n();
  const userId = useAuthStore((s) => s.user?.id);
  const cached = useMessageCache((s) => s.cache[message.id]);
  const selectionMode = useChatStore((s) => s.selectionMode);
  const selected = useChatStore((s) => s.selectedMessageIds.has(message.id));
  const toggleSelection = useChatStore((s) => s.toggleMessageSelection);
  const isOwn = message.senderId === userId;
  const failed = cached?.failed ?? false;
  const text = failed ? t("chat.decryptFailed") : (cached?.text ?? "…");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const time = useMemo(
    () =>
      new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [message.createdAt],
  );

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  return (
    <div className={`tg-row ${isOwn ? "is-own" : "is-peer"}`} role="listitem">
      {selectionMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleSelection(message.id)}
          aria-label={t("chat.selectMessage")}
          style={{ marginTop: 14, marginInlineEnd: 6 }}
        />
      ) : null}
      <div
        className="tg-bubble"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onDoubleClick={onReply}
      >
        {message.replyToId ? <div className="tg-reply-quote">{t("chat.reply")}</div> : null}
        <p className="tg-bubble-text">{text}</p>
        <div className="tg-bubble-meta">
          {message.editedAt ? <span className="tg-time">{t("chat.edited")}</span> : null}
          <span className="tg-time">{time}</span>
          <StatusTicks isOwn={isOwn} />
        </div>
      </div>

      {menu
        ? createPortal(
            <div
              className="tg-ctx"
              style={{
                left: Math.min(menu.x, window.innerWidth - 200),
                top: Math.min(menu.y, window.innerHeight - 280),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  onReply();
                  setMenu(null);
                }}
              >
                {t("chat.reply")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onForward();
                  setMenu(null);
                }}
              >
                {t("chat.forward")}
              </button>
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => {
                    onEdit();
                    setMenu(null);
                  }}
                >
                  {t("common.edit")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onCopy();
                  setMenu(null);
                }}
              >
                {t("chat.copy")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onPin();
                  setMenu(null);
                }}
              >
                {message.pinnedAt ? t("chat.unpin") : t("chat.pin")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onReact("👍");
                  setMenu(null);
                }}
              >
                👍
              </button>
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setMenu(null);
                  }}
                >
                  {t("common.delete")}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function TypingIndicator({ userIds }: { userIds: string[] }) {
  const { t } = useI18n();
  if (userIds.length === 0) return <div className="tg-typing" aria-hidden />;
  return (
    <div className="tg-typing" aria-live="polite">
      <span className="tg-typing-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {t("chat.typing")}
    </div>
  );
}

export function ComposeDock({
  value,
  onChange,
  onSend,
  onTypingStart,
  onTypingStop,
  onFile,
  onVoice,
  disabled,
  replyTo,
  onCancelReply,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onFile: (files: FileList) => void;
  onVoice: () => void;
  disabled?: boolean;
  replyTo?: string | null;
  onCancelReply?: () => void;
}) {
  const { t } = useI18n();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <footer
      className="tg-compose"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) onFile(e.dataTransfer.files);
      }}
    >
      <label
        className="tg-icon-btn"
        aria-label={t("chat.attach")}
        style={{ width: 48, height: 48 }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 015 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 005 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
        </svg>
        <input
          type="file"
          className="hidden"
          multiple
          onChange={(e) => e.target.files && onFile(e.target.files)}
        />
      </label>

      <div className="tg-compose-box">
        {replyTo ? (
          <div className="tg-reply-bar">
            <span>{t("chat.replying")}</span>
            <button
              type="button"
              className="tg-icon-btn"
              style={{ width: 28, height: 28 }}
              onClick={onCancelReply}
              aria-label={t("common.cancel")}
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="tg-compose-row">
          <textarea
            ref={taRef}
            value={value}
            rows={1}
            placeholder={t("chat.composePlaceholder")}
            aria-label={t("chat.composePlaceholder")}
            disabled={disabled}
            onChange={(e) => {
              onChange(e.target.value);
              if (e.target.value) onTypingStart();
              else onTypingStop();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            onPaste={(e) => {
              const files = e.clipboardData.files;
              if (files?.length) {
                e.preventDefault();
                onFile(files);
              }
            }}
            onBlur={onTypingStop}
          />
        </div>
      </div>

      {canSend ? (
        <button
          type="button"
          className="tg-send"
          onClick={onSend}
          disabled={disabled}
          aria-label={t("chat.send")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="tg-send"
          onClick={onVoice}
          aria-label={t("chat.voice")}
          style={{
            background: "var(--tg-input)",
            color: "var(--tg-text-secondary)",
            boxShadow: "none",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>
      )}
    </footer>
  );
}
