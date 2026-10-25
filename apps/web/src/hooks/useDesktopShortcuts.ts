import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/messaging";
import { useUiStore } from "../stores/stores";

/**
 * Telegram Desktop–style keyboard shortcuts.
 */
export function useDesktopShortcuts() {
  const navigate = useNavigate();
  const clearSelection = useChatStore((s) => s.clearSelection);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chats = useChatStore((s) => s.chats);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        clearSelection();
        if (document.querySelector(".tg-ctx")) return;
        if (activeChatId && window.matchMedia("(max-width: 767px)").matches) {
          setActiveChat(null);
        }
        return;
      }

      if (typing) return;

      if (e.key === "/" || (e.ctrlKey && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        document.getElementById("chat-search")?.focus();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === ",") {
        e.preventDefault();
        navigate("/settings");
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (activeChatId) toggleRightPanel();
        return;
      }

      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        if (chats.length === 0) return;
        const idx = Math.max(
          0,
          chats.findIndex((c) => c.id === activeChatId),
        );
        const next =
          e.key === "ArrowDown"
            ? chats[Math.min(chats.length - 1, idx + 1)]
            : chats[Math.max(0, idx - 1)];
        if (next) setActiveChat(next.id);
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "f" && activeChatId) {
        e.preventDefault();
        setSearchQuery("");
        document.getElementById("chat-search")?.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeChatId,
    chats,
    clearSelection,
    navigate,
    setActiveChat,
    setSearchQuery,
    toggleRightPanel,
  ]);
}
