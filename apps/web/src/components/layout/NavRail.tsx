import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuthStore, useUiStore } from "../../stores/stores";
import { useChatStore } from "../../stores/messaging";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "N";
}

export function NavRail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const folder = useUiStore((s) => s.folder);
  const setFolder = useUiStore((s) => s.setFolder);
  const navCollapsed = useUiStore((s) => s.navCollapsed);
  const setNavCollapsed = useUiStore((s) => s.setNavCollapsed);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const chats = useChatStore((s) => s.chats);

  const unreadTotal = chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  const items: Array<{
    id: typeof folder | "settings" | "collapse";
    label: string;
    icon: string;
    badge?: number;
    onClick: () => void;
    active?: boolean;
  }> = [
    {
      id: "all",
      label: "All chats",
      icon: "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z",
      badge: unreadTotal || undefined,
      onClick: () => setFolder("all"),
      active: folder === "all",
    },
    {
      id: "unread",
      label: "Unread",
      icon: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
      onClick: () => setFolder("unread"),
      active: folder === "unread",
    },
    {
      id: "groups",
      label: "Groups",
      icon: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
      onClick: () => setFolder("groups"),
      active: folder === "groups",
    },
    {
      id: "channels",
      label: "Channels",
      icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15H9V8h2v9zm4 0h-2V8h2v9z",
      onClick: () => setFolder("channels"),
      active: folder === "channels",
    },
    {
      id: "archived",
      label: "Archived",
      icon: "M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z",
      onClick: () => setFolder("archived"),
      active: folder === "archived",
    },
  ];

  return (
    <nav className={`tg-nav ${navCollapsed ? "is-collapsed" : ""}`} aria-label="Main">
      <button
        type="button"
        className="tg-nav-profile"
        title={user?.displayName ?? t("app.name")}
        onClick={() => navigate("/settings")}
      >
        <span className="tg-avatar tg-avatar--sm" aria-hidden>
          {initials(user?.displayName ?? "NeoChat")}
        </span>
      </button>

      <div className="tg-nav-items">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tg-nav-btn ${item.active ? "is-active" : ""}`}
            title={item.label}
            aria-label={item.label}
            aria-current={item.active ? "page" : undefined}
            onClick={item.onClick}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={item.icon} />
            </svg>
            {item.badge ? (
              <span className="tg-nav-badge">{item.badge > 99 ? "99+" : item.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="tg-nav-footer">
        <button
          type="button"
          className="tg-nav-btn"
          title={t("common.theme")}
          onClick={toggleTheme}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
          </svg>
        </button>
        <button
          type="button"
          className="tg-nav-btn"
          title={t("common.settings")}
          onClick={() => navigate("/settings")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.57.23-1.12.54-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.4 1.05.72 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.57-.22 1.12-.54 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
          </svg>
        </button>
        <button
          type="button"
          className="tg-nav-btn"
          title={navCollapsed ? "Expand" : "Collapse"}
          onClick={() => setNavCollapsed(!navCollapsed)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path
              d={
                navCollapsed
                  ? "M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
                  : "M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"
              }
            />
          </svg>
        </button>
      </div>
    </nav>
  );
}
