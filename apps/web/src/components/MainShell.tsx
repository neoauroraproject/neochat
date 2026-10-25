import { LoadingState } from "@neochat/ui";
import { lazy, Suspense, useEffect, useState } from "react";
import { ChatListPanel } from "./chat/ChatListPanel";
import { ConversationPanel } from "./conversation/ConversationPanel";
import { NavRail } from "./layout/NavRail";
import { PanelResizer } from "./layout/PanelResizer";
import { RightInfoPanel } from "./layout/RightInfoPanel";
import { useCallMeta, useCallSync } from "../hooks/useCalls";
import { useDesktopShortcuts } from "../hooks/useDesktopShortcuts";
import { useChatsQuery, useInitCrypto, useRealtimeSync } from "../hooks/useMessaging";
import { useChatStore } from "../stores/messaging";
import { useAuthStore, useUiStore } from "../stores/stores";

const IncomingCallModal = lazy(() =>
  import("./calls/IncomingCallModal").then((m) => ({ default: m.IncomingCallModal })),
);
const ActiveCallOverlay = lazy(() =>
  import("./calls/ActiveCallOverlay").then((m) => ({ default: m.ActiveCallOverlay })),
);

export function MainShell() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const chatsQuery = useChatsQuery();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chats = useChatStore((s) => s.chats);
  const chatListWidth = useUiStore((s) => s.chatListWidth);
  const setChatListWidth = useUiStore((s) => s.setChatListWidth);
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth);
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth);
  const applyResolvedTheme = useUiStore((s) => s.applyResolvedTheme);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);

  useInitCrypto();
  useRealtimeSync();
  useCallMeta();
  useCallSync();
  useDesktopShortcuts();

  useEffect(() => {
    applyResolvedTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => applyResolvedTheme();
    mq.addEventListener("change", onScheme);
    return () => mq.removeEventListener("change", onScheme);
  }, [applyResolvedTheme]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!bootstrapped || chatsQuery.isLoading) {
    return <LoadingState />;
  }

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const mode = isMobile && activeChatId ? "chat" : isMobile ? "list" : "split";

  return (
    <div
      className={`tg-shell ${mode === "chat" ? "tg-shell--chat" : ""} ${mode === "list" ? "tg-shell--list" : ""}`}
    >
      {!isMobile ? <NavRail /> : null}

      <div
        className={`tg-list-col ${mode === "chat" ? "is-hidden-mobile" : ""}`}
        style={isMobile ? undefined : { width: chatListWidth }}
      >
        <ChatListPanel />
      </div>

      {!isMobile ? (
        <PanelResizer onResize={(delta) => setChatListWidth(chatListWidth + delta)} />
      ) : null}

      <div className={`tg-main ${mode === "list" ? "is-hidden-mobile" : ""}`}>
        <ConversationPanel onBack={isMobile ? () => undefined : undefined} />
      </div>

      {!isMobile && rightPanelOpen && activeChat ? (
        <>
          <PanelResizer
            direction="horizontal-reverse"
            onResize={(delta) => setRightPanelWidth(rightPanelWidth + delta)}
          />
          <RightInfoPanel chat={activeChat} />
        </>
      ) : null}

      <Suspense fallback={null}>
        <IncomingCallModal />
        <ActiveCallOverlay />
      </Suspense>
    </div>
  );
}
