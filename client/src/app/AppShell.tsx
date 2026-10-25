import { useEffect, useState } from "react";
import { get } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, BrandLogo } from "../components/ui";
import { num } from "../format";
import { useT } from "../i18n";
import { sortedChats, useApp, type Filter, type Section } from "../store";
import type { RoomPreview } from "../types";
import { CallView } from "./CallView";
import { ChatList, matchesFilter } from "./ChatList";
import { Conversation } from "./Conversation";
import { useMedia, useMobile } from "./hooks";
import { InfoPanel } from "./InfoPanel";
import { CallsPane, ExplorePane } from "./Panes";
import { RoomPreviewModal } from "./RoomPreviewModal";
import { SettingsPane } from "./SettingsPane";
import { useNewMenu } from "./NewMenu";
import { adHref, adsFor, adTarget, trackImpression } from "../ads";

function useUnreadTotal() {
  return useApp((s) =>
    Object.values(s.chats).reduce(
      (n, c) => n + (c.muted || c.archived ? 0 : c.unread > 0 ? 1 : 0),
      0,
    ),
  );
}

const navItems: {
  id: Section;
  icon: string;
  key: "nav.chats" | "nav.calls" | "nav.explore" | "nav.settings";
}[] = [
  { id: "chats", icon: "chat", key: "nav.chats" },
  { id: "calls", icon: "phone", key: "nav.calls" },
  { id: "explore", icon: "compass", key: "nav.explore" },
  { id: "settings", icon: "settings", key: "nav.settings" },
];

function NavPill() {
  const t = useT();
  const section = useApp((s) => s.section);
  const me = useApp((s) => s.me);
  const unread = useUnreadTotal();
  const lang = useApp((s) => s.lang);
  return (
    <nav className="navpill glass-float" aria-label="main">
      {navItems.map((n) => (
        <button
          key={n.id}
          aria-current={section === n.id}
          onClick={() => useApp.setState({ section: n.id })}
          title={t(n.key)}
          aria-label={t(n.key)}
        >
          <Icon name={n.icon} size={22} />
          {n.id === "chats" && unread > 0 && <span className="badge">{num(unread, lang)}</span>}
        </button>
      ))}
      {me?.isAdmin && (
        <>
          <div className="sep" />
          <button
            onClick={() => location.assign("/admin")}
            title={t("nav.admin")}
            aria-label={t("nav.admin")}
          >
            <Icon name="dashboard" size={21} />
          </button>
        </>
      )}
    </nav>
  );
}

/** Mobile bottom bar from the design: four tabs with a raised accent "+" in the middle. */
function TabBar() {
  const t = useT();
  const section = useApp((s) => s.section);
  const unread = useUnreadTotal();
  const lang = useApp((s) => s.lang);
  const newMenu = useNewMenu();
  const tab = (n: (typeof navItems)[number]) => (
    <button
      key={n.id}
      aria-current={section === n.id}
      onClick={() => useApp.setState({ section: n.id })}
      aria-label={t(n.key)}
    >
      <Icon name={n.id === "chats" ? "send" : n.icon} size={24} />
      {n.id === "chats" && unread > 0 && <span className="badge">{num(unread, lang)}</span>}
    </button>
  );
  return (
    <nav className="tabbar">
      {tab(navItems[0])}
      {tab(navItems[1])}
      <button
        className="tab-fab"
        onClick={(e) => newMenu.open(e.currentTarget, true)}
        aria-label={t("list.newChat")}
      >
        <Icon name="plus" size={26} stroke={2.4} />
      </button>
      {tab(navItems[2])}
      {tab(navItems[3])}
      {newMenu.element}
    </nav>
  );
}

function SidebarAd() {
  const ad = useApp((s) => adsFor(s.ads, "sidebar")[0]);
  const t = useT();
  useEffect(() => {
    if (ad) trackImpression(ad);
  }, [ad]);
  if (!ad) return null;
  return (
    <a
      className="ad-card side-ad"
      href={adHref(ad)}
      target={adTarget(ad)}
      rel="noopener noreferrer"
    >
      <div className="grow">
        <div className="t">{ad.title}</div>
        {ad.body && <div className="b">{ad.body}</div>}
      </div>
      <span className="tag">{ad.badge || t("chat.sponsored")}</span>
    </a>
  );
}

/** Left column from the reference design: profile, sections with counters, and the rooms you're in. */
function Sidebar() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me)!;
  const chats = useApp((s) => s.chats);
  const filter = useApp((s) => s.filter);
  const section = useApp((s) => s.section);
  const config = useApp((s) => s.config);
  const count = (f: Filter) =>
    Object.values(chats).filter((c) => matchesFilter(c, f) && c.unread > 0 && !c.muted).length;
  const rooms = sortedChats(chats).filter((c) => c.type !== "direct" && !c.archived);
  const items: { id: Filter; icon: string; label: string }[] = [
    { id: "all", icon: "chat", label: t("nav.chats") },
    { id: "direct", icon: "users", label: t("nav.direct") },
    { id: "groups", icon: "group", label: t("nav.groups") },
    { id: "channels", icon: "megaphone", label: t("nav.channels") },
    { id: "archive", icon: "archive", label: t("nav.archive") },
  ];
  return (
    <aside className="pane panel sidebar">
      <div className="profile-head">
        <Avatar id={me.id} name={me.displayName} media={me.avatar} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{me.displayName}</div>
          <div className="handle">@{me.username}</div>
        </div>
        <button
          className="icon-btn"
          onClick={() => useApp.setState({ section: "settings" })}
          aria-label={t("nav.settings")}
        >
          <Icon name="settings" size={21} />
        </button>
      </div>
      {items.map((i) => {
        const n = count(i.id);
        return (
          <button
            key={i.id}
            className="side-item"
            aria-current={section === "chats" && filter === i.id}
            onClick={() => useApp.setState({ filter: i.id, section: "chats" })}
          >
            <span className="ic">
              <Icon name={i.icon} size={19} />
            </span>
            <span className="grow">{i.label}</span>
            {n > 0 && <span className="badge">{num(n, lang)}</span>}
          </button>
        );
      })}
      {rooms.length > 0 && <div className="section-label">{t("nav.rooms")}</div>}
      <div className="side-rooms">
        {rooms.map((c) => (
          <button
            key={c.id}
            className="row"
            aria-current={useApp.getState().activeChatId === c.id}
            onClick={() => useApp.getState().openChat(c.id)}
          >
            <Avatar id={c.id} name={c.title} media={c.avatar} size={38} squircle />
            <div className="grow">
              <div className="title">{c.title}</div>
              <div className="sub">
                {t(c.type === "channel" ? "presence.subscribers" : "presence.members", {
                  n: num(c.memberCount, lang),
                })}
              </div>
            </div>
            {c.unread > 0 && (
              <span
                className={`badge${c.muted ? " muted" : ""}`}
                style={{ minWidth: 10, width: 10, height: 10, padding: 0 }}
              />
            )}
          </button>
        ))}
      </div>
      <SidebarAd />
      <div className="side-foot">
        {config?.appName} · {t("common.copyright")}
      </div>
    </aside>
  );
}

function Welcome() {
  const t = useT();
  const config = useApp((s) => s.config);
  return (
    <section className="pane panel welcome">
      <div>
        <BrandLogo size={96} />
        <h2>{config?.appName}</h2>
        <p style={{ marginBottom: 6 }}>{t("chat.select")}</p>
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>
          {config?.welcomeText || t("chat.selectHint")}
        </p>
        <p className="copyright">{t("common.copyright")}</p>
      </div>
    </section>
  );
}

function OfflineBanner() {
  const t = useT();
  const connected = useApp((s) => s.connected);
  const [show, setShow] = useState(false);
  // Avoid flashing the banner during the first quick connect.
  useEffect(() => {
    if (connected) return setShow(false);
    const id = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(id);
  }, [connected]);
  if (!show) return null;
  return (
    <div className="offline-banner glass-float">
      <span className="spinner" />
      {navigator.onLine ? t("common.connecting") : t("common.offline")}
    </div>
  );
}

/** Handles /join/<code> and /@handle deep links. */
function DeepLinks() {
  const [room, setRoom] = useState<{ room: RoomPreview; invite?: string } | null>(null);
  useEffect(() => {
    const path = decodeURIComponent(location.pathname);
    const join = path.match(/^\/join\/([\w-]+)/);
    const handle = path.match(/^\/@(\w+)/);
    if (join) {
      get<RoomPreview>(`/api/invite/${join[1]}`)
        .then((r) => setRoom({ room: r, invite: join[1] }))
        .catch(() => useApp.getState().toast("Invite link is invalid", "error"));
    } else if (handle) {
      get<{ users: { id: number; username: string }[]; rooms: RoomPreview[] }>(
        `/api/search?q=${handle[1]}`,
      ).then((r) => {
        const rm = r.rooms.find((x) => x.handle.toLowerCase() === handle[1].toLowerCase());
        const u = r.users.find((x) => x.username.toLowerCase() === handle[1].toLowerCase());
        if (rm) setRoom({ room: rm });
        else if (u) useApp.getState().openDirect(u.id);
      });
    }
    if (join || handle) history.replaceState(null, "", "/");
  }, []);
  return room ? (
    <RoomPreviewModal room={room.room} invite={room.invite} onClose={() => setRoom(null)} />
  ) : null;
}

export function AppShell() {
  const isMobile = useMobile();
  const wide = useMedia("(min-width: 1281px)");
  const section = useApp((s) => s.section);
  const activeId = useApp((s) => s.activeChatId);
  const chat = useApp((s) => (s.activeChatId ? s.chats[s.activeChatId] : undefined));
  const infoOpen = useApp((s) => s.infoOpen);
  const callPhase = useCall((s) => s.phase);

  // Escape closes the conversation like Telegram Desktop; mobile back button closes the top screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".overlay")) {
        const s = useApp.getState();
        if (s.infoOpen) useApp.setState({ infoOpen: false });
        else if (s.activeChatId) s.openChat(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!isMobile || !activeId) return;
    history.pushState({ chat: activeId }, "");
    const onPop = () => {
      const s = useApp.getState();
      if (s.infoOpen) {
        useApp.setState({ infoOpen: false });
        history.pushState({ chat: activeId }, "");
      } else s.openChat(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isMobile, activeId]);

  useEffect(() => {
    if (activeId && !chat) useApp.getState().openChat(null);
  }, [activeId, chat]);

  const listPane =
    section === "calls" ? <CallsPane /> : section === "explore" ? <ExplorePane /> : <ChatList />;
  const showInfo = infoOpen && chat;

  if (isMobile) {
    return (
      <div className="shell">
        <div className="window">
          {section === "settings" ? (
            <SettingsPane />
          ) : (
            <section className="pane panel list-pane">{listPane}</section>
          )}
          {chat && <Conversation key={chat.id} chat={chat} />}
          {showInfo && <InfoPanel chat={chat} />}
        </div>
        {!chat && <TabBar />}
        <OfflineBanner />
        <DeepLinks />
        {callPhase !== "idle" && <CallView />}
      </div>
    );
  }

  return (
    <div className="shell">
      <NavPill />
      <div
        className={`window glass-window${wide ? "" : " no-sidebar"}${showInfo && section !== "settings" ? " info-open" : ""}`}
      >
        {wide && <Sidebar />}
        <section className="pane list-pane">{listPane}</section>
        {section === "settings" ? (
          <SettingsPane />
        ) : chat ? (
          <Conversation key={chat.id} chat={chat} />
        ) : (
          <Welcome />
        )}
        {showInfo && section !== "settings" && <InfoPanel chat={chat} />}
        <OfflineBanner />
      </div>
      <DeepLinks />
      {callPhase !== "idle" && <CallView />}
    </div>
  );
}
