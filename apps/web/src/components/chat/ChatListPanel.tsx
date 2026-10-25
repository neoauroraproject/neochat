import { Dialog, EmptyState, Input } from "@neochat/ui";
import type { Chat, PublicUser } from "@neochat/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateChat } from "../../hooks/useMessaging";
import { useI18n } from "../../i18n/I18nProvider";
import { apiFetch } from "../../lib/api";
import { useChatStore } from "../../stores/messaging";
import { useUiStore } from "../../stores/stores";

function chatLabel(chat: Chat): string {
  if (chat.title) return chat.title;
  if (chat.type === "dm") return "Direct message";
  return chat.type.charAt(0).toUpperCase() + chat.type.slice(1);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function ChatListItem({
  chat,
  active,
  onClick,
  index,
  typing,
}: {
  chat: Chat;
  active: boolean;
  onClick: () => void;
  index: number;
  typing?: boolean;
}) {
  const { t } = useI18n();
  const unread = chat.unreadCount ?? 0;
  const label = chatLabel(chat);
  const preview = typing
    ? t("chat.typing")
    : chat.type === "dm"
      ? "Encrypted message"
      : chat.type === "channel"
        ? "Channel"
        : "Group chat";

  return (
    <button
      type="button"
      className={`tg-chat-item ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}
    >
      <div className="tg-avatar" aria-hidden>
        {initials(label)}
      </div>
      <div className="tg-chat-body">
        <div className="tg-chat-top">
          <span className="tg-chat-title">{label}</span>
          <span className="tg-chat-meta">{formatTime(chat.updatedAt)}</span>
        </div>
        <div className="tg-chat-bottom">
          <span className={`tg-chat-preview ${typing ? "is-typing" : ""}`}>{preview}</span>
          {unread > 0 ? <span className="tg-unread">{unread > 99 ? "99+" : unread}</span> : null}
        </div>
      </div>
    </button>
  );
}

function NewChatDialog({
  open,
  onClose,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  mode: "dm" | "group" | "channel";
}) {
  const { t } = useI18n();
  const createChat = useCreateChat();
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function searchUsers(q: string) {
    setQuery(q);
    if (q.length < 2) {
      setUsers([]);
      return;
    }
    const results = await apiFetch<PublicUser[]>(`/users/search?q=${encodeURIComponent(q)}`);
    setUsers(results);
  }

  async function submit() {
    setLoading(true);
    try {
      let chat: Chat;
      if (mode === "dm" && selected[0]) {
        chat = await createChat.mutateAsync({ type: "dm", peerUserId: selected[0] });
      } else if (mode === "group") {
        chat = await createChat.mutateAsync({ type: "group", title, memberIds: selected });
      } else {
        chat = await createChat.mutateAsync({ type: "channel", title });
      }
      setActiveChat(chat.id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t(`chat.new.${mode}`)}>
      <div className="space-y-3">
        {(mode === "group" || mode === "channel") && (
          <Input
            label={t("chat.title")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        )}
        {mode !== "channel" && (
          <>
            <Input
              label={t("chat.searchUsers")}
              value={query}
              onChange={(e) => void searchUsers(e.target.value)}
            />
            <ul className="max-h-40 overflow-y-auto space-y-1">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`w-full text-start px-2 py-1.5 rounded text-sm ${
                      selected.includes(u.id)
                        ? "bg-[var(--tg-selection)]"
                        : "hover:bg-[var(--tg-sidebar-hover)]"
                    }`}
                    onClick={() =>
                      setSelected(
                        mode === "dm"
                          ? [u.id]
                          : selected.includes(u.id)
                            ? selected.filter((id) => id !== u.id)
                            : [...selected, u.id],
                      )
                    }
                  >
                    {u.displayName} @{u.username}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="tg-chip"
            style={{ flex: "none", padding: "0 14px" }}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="tg-primary"
            style={{ width: "auto", padding: "0 18px", margin: 0 }}
            disabled={loading}
            onClick={() => void submit()}
          >
            {loading ? t("common.loading") : t("common.ok")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function ChatListPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const folder = useUiStore((s) => s.folder);
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const typing = useChatStore((s) => s.typing);
  const [newMode, setNewMode] = useState<"dm" | "group" | "channel" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = chats;
    if (folder === "unread") list = list.filter((c) => (c.unreadCount ?? 0) > 0);
    else if (folder === "groups") list = list.filter((c) => c.type === "group");
    else if (folder === "channels") list = list.filter((c) => c.type === "channel");
    else if (folder === "archived") list = [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => chatLabel(c).toLowerCase().includes(q));
  }, [chats, folder, searchQuery]);

  return (
    <aside className="tg-sidebar">
      <header className="tg-side-header">
        <div className="relative md:hidden">
          <button
            type="button"
            className="tg-icon-btn"
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="tg-ctx" style={{ position: "absolute", top: 44, insetInlineStart: 0 }}>
              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                  setMenuOpen(false);
                }}
              >
                {t("common.theme")}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate("/settings");
                  setMenuOpen(false);
                }}
              >
                {t("common.settings")}
              </button>
            </div>
          ) : null}
        </div>
        <div className="tg-search">
          <span className="tg-search-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          </span>
          <input
            id="chat-search"
            placeholder={t("chat.searchChats")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t("chat.searchChats")}
          />
        </div>
        <button
          type="button"
          className="tg-icon-btn"
          aria-label={t("chat.new.dm")}
          onClick={() => setNewMode("dm")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
          </svg>
        </button>
      </header>

      <div className="tg-fab-row">
        <button type="button" className="tg-chip" onClick={() => setNewMode("dm")}>
          {t("chat.new.dm")}
        </button>
        <button type="button" className="tg-chip" onClick={() => setNewMode("group")}>
          {t("chat.new.group")}
        </button>
        <button type="button" className="tg-chip" onClick={() => setNewMode("channel")}>
          {t("chat.new.channel")}
        </button>
      </div>

      <div className="tg-chat-list tg-scroll" role="list" aria-label={t("chat.list")}>
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon="💬"
              title={t("chat.empty.title")}
              description={t("chat.empty.subtitle")}
            />
          </div>
        ) : (
          filtered.map((chat, index) => {
            const isTyping = (typing[chat.id]?.size ?? 0) > 0;
            return (
              <ChatListItem
                key={chat.id}
                chat={chat}
                index={index}
                typing={isTyping}
                active={chat.id === activeChatId}
                onClick={() => setActiveChat(chat.id)}
              />
            );
          })
        )}
      </div>

      {newMode ? <NewChatDialog open mode={newMode} onClose={() => setNewMode(null)} /> : null}
    </aside>
  );
}
