import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { adHref, adsFor, adTarget, trackImpression } from "../ads";
import { get } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, BrandLogo } from "../components/ui";
import { chatTitle, num } from "../format";
import { useT } from "../i18n";
import { sortedChats, useApp, type Filter, type Section } from "../store";
import type { Chat, RoomPreview } from "../types";
import { CallView } from "./CallView";
import { ChatList, matchesFilter } from "./ChatList";
import { Conversation } from "./Conversation";
import { useMedia, useMobile } from "./hooks";
import { InfoPanel } from "./InfoPanel";
import { CallsPane, ExplorePane } from "./Panes";
import { RoomPreviewModal } from "./RoomPreviewModal";
import { SettingsPane } from "./SettingsPane";

function useUnreadTotal() {
  return useApp((s) =>
    Object.values(s.chats).reduce(
      (n, c) => n + (c.muted || c.archived ? 0 : c.unread > 0 ? 1 : 0),
      0,
    ),
  );
}

const sections: {
  id: Section;
  icon: string;
  key: "nav.chats" | "nav.calls" | "nav.explore" | "nav.settings";
}[] = [
  { id: "chats", icon: "chat", key: "nav.chats" },
  { id: "calls", icon: "video", key: "nav.calls" },
  { id: "explore", icon: "users", key: "nav.explore" },
  { id: "settings", icon: "settings", key: "nav.settings" },
];

/** visionOS ornament: the vertical glass pill floating beside the window. */
function Ornament() {
  const t = useT();
  const section = useApp((s) => s.section);
  const me = useApp((s) => s.me);
  const unread = useUnreadTotal();
  const lang = useApp((s) => s.lang);
  return (
    <nav className="ornament" aria-label="main">
      {sections.map((n) => (
        <button
          key={n.id}
          aria-current={section === n.id}
          onClick={() => useApp.setState({ section: n.id })}
          title={t(n.key)}
          aria-label={t(n.key)}
        >
          <Icon name={n.icon} size={22} filled={section === n.id} />
          {n.id === "chats" && unread > 0 && <span className="badge">{num(unread, lang)}</span>}
        </button>
      ))}
      {me?.isAdmin && (
        <>
          <span className="orn-sep" />
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

/** Telegram-style floating capsule: icons only, a lens slides behind the active tab. */
function TabCapsule({ hidden }: { hidden?: boolean }) {
  const t = useT();
  const section = useApp((s) => s.section);
  const unread = useUnreadTotal();
  const lang = useApp((s) => s.lang);
  const bar = useRef<HTMLElement>(null);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('button[aria-current="true"]');
    if (el) setLens({ x: el.offsetLeft, w: el.offsetWidth });
  }, [section, lang]);
  return (
    <nav className={`capsule${hidden ? " away" : ""}`} ref={bar} aria-hidden={hidden}>
      {lens && (
        <span className="lens" style={{ transform: `translateX(${lens.x}px)`, width: lens.w }} />
      )}
      {sections.map((n) => (
        <button
          key={n.id}
          aria-current={section === n.id}
          aria-label={t(n.key)}
          onClick={() => useApp.setState({ section: n.id })}
        >
          <Icon name={n.icon === "video" ? "phone" : n.icon} size={26} filled={section === n.id} />
          {n.id === "chats" && unread > 0 && <span className="badge">{num(unread, lang)}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Sidebar card from the reference: profile, menu with icon tiles, and the rooms you're in. */
function Sidebar() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me)!;
  const chats = useApp((s) => s.chats);
  const filter = useApp((s) => s.filter);
  const section = useApp((s) => s.section);
  const activeId = useApp((s) => s.activeChatId);
  const count = (f: Filter) =>
    Object.values(chats).filter((c) => matchesFilter(c, f) && c.unread > 0 && !c.muted).length;
  const archived = Object.values(chats).some((c) => c.archived);
  const rooms = sortedChats(chats).filter((c) => c.type !== "direct" && !c.archived);
  const items: { id: Filter; icon: string; label: string }[] = [
    { id: "all", icon: "chat", label: t("nav.chats") },
    { id: "direct", icon: "users", label: t("nav.direct") },
    { id: "groups", icon: "group", label: t("nav.groups") },
    { id: "channels", icon: "megaphone", label: t("nav.channels") },
    ...(archived ? [{ id: "archive" as Filter, icon: "archive", label: t("nav.archive") }] : []),
  ];
  return (
    <aside className="side-card">
      <div className="profile-row">
        <button className="me" onClick={() => useApp.setState({ section: "settings" })}>
          <Avatar id={me.id} name={me.displayName} media={me.avatar} size={44} />
          <span className="name">{me.displayName}</span>
          <Icon name="down" size={16} />
        </button>
        <button
          className="icon-btn"
          onClick={() => useApp.setState({ section: "settings" })}
          aria-label={t("nav.settings")}
        >
          <Icon name="settings" size={22} filled />
        </button>
      </div>
      <div className="menu-list">
        {items.map((i) => {
          const n = count(i.id);
          return (
            <button
              key={i.id}
              className="menu-row"
              aria-current={section === "chats" && filter === i.id}
              onClick={() => useApp.setState({ filter: i.id, section: "chats" })}
            >
              <span className="tile">
                <Icon name={i.icon} size={20} filled />
              </span>
              <span className="lb">{i.label}</span>
              {n > 0 && <span className="badge pill">{num(n, lang)}</span>}
            </button>
          );
        })}
      </div>
      {rooms.length > 0 && <div className="side-label">{t("nav.rooms")}</div>}
      <div className="room-list">
        {rooms.map((c) => (
          <button
            key={c.id}
            className="room-row"
            aria-current={activeId === c.id}
            onClick={() => useApp.getState().openChat(c.id)}
          >
            <Avatar id={c.id} name={c.title} media={c.avatar} size={40} squircle />
            <span className="txt">
              <span className="t">{chatTitle(c, lang)}</span>
              <span className="s">
                {t(c.type === "channel" ? "presence.subscribers" : "presence.members", {
                  n: num(c.memberCount, lang),
                })}
              </span>
            </span>
            {c.unread > 0 && <span className={`udot${c.muted ? " muted" : ""}`} />}
          </button>
        ))}
      </div>
      <SidebarAd />
      <div className="side-foot">{t("common.copyright")}</div>
    </aside>
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
    <a className="side-ad" href={adHref(ad)} target={adTarget(ad)} rel="noopener noreferrer">
      <span className="t">{ad.title}</span>
      {ad.body && <span className="b">{ad.body}</span>}
      <span className="tag">{ad.badge || t("chat.sponsored")}</span>
    </a>
  );
}

function Welcome() {
  const t = useT();
  const config = useApp((s) => s.config);
  return (
    <section className="welcome">
      <BrandLogo size={96} />
      <h2>{config?.appName}</h2>
      <p>{t("chat.select")}</p>
      <p className="small">{config?.welcomeText || t("chat.selectHint")}</p>
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
    <div className="offline-banner">
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

/** Keeps the last value mounted for `ms` after it becomes undefined, so screens can animate out. */
function useLeaving<T>(value: T | undefined, ms: number) {
  const last = useRef<T | undefined>(value);
  const [leaving, setLeaving] = useState<T | undefined>();
  useEffect(() => {
    if (value) {
      last.current = value;
      setLeaving(undefined);
      return;
    }
    if (!last.current) return;
    setLeaving(last.current);
    last.current = undefined;
    const id = setTimeout(() => setLeaving(undefined), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return leaving;
}

export function AppShell() {
  const isMobile = useMobile();
  const wide = useMedia("(min-width: 1180px)");
  const section = useApp((s) => s.section);
  const activeId = useApp((s) => s.activeChatId);
  const chat = useApp((s) => (s.activeChatId ? s.chats[s.activeChatId] : undefined));
  const infoOpen = useApp((s) => s.infoOpen);
  const callPhase = useCall((s) => s.phase);
  const callMin = useCall((s) => s.minimized);
  const leavingChat = useLeaving<Chat>(chat, 340);
  const showInfo = infoOpen && chat ? chat : undefined;
  const leavingInfo = useLeaving<Chat>(showInfo, 340);

  // Escape closes the top layer.
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

  // The phone's back button/gesture pops the top screen.
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

  if (isMobile) {
    const stackChat = chat || leavingChat;
    const stackInfo = showInfo || leavingInfo;
    return (
      <div className={`phone${chat ? " pushed" : ""}`}>
        <div className="phone-glass" />
        <div key={section} className="tab-screen">
          {section === "settings" ? <SettingsPane /> : listPane}
        </div>
        {stackChat && (
          <div className={`push-screen${chat ? "" : " leaving"}`} key={stackChat.id}>
            <Conversation chat={stackChat} />
          </div>
        )}
        {stackInfo && (
          <div className={`push-screen top${showInfo ? "" : " leaving"}`}>
            <InfoPanel chat={stackInfo} />
          </div>
        )}
        <TabCapsule hidden={!!chat} />
        <OfflineBanner />
        <DeepLinks />
        {callPhase !== "idle" && <CallView />}
      </div>
    );
  }

  // Desktop: calls live inside the right card, exactly like the reference.
  const inCall = callPhase !== "idle" && !callMin;
  let right: React.ReactNode;
  if (inCall) right = <CallView embedded />;
  else if (section === "settings") right = <SettingsPane />;
  else if (showInfo) right = <InfoPanel chat={showInfo} />;
  else if (chat) right = <Conversation key={chat.id} chat={chat} />;
  else right = <Welcome />;

  return (
    <div className="vos">
      <Ornament />
      <div className={`vos-window${wide ? "" : " narrow"}`}>
        {wide && <Sidebar />}
        <section className="vos-list">{listPane}</section>
        <main className="vos-card">{right}</main>
      </div>
      {callPhase !== "idle" && callMin && <CallView />}
      <OfflineBanner />
      <DeepLinks />
    </div>
  );
}
