import { useEffect, useRef, useState } from "react";
import { adHref, adsFor, adTarget, trackImpression } from "../ads";
import { get } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, BrandLogo } from "../components/ui";
import { num } from "../format";
import { useT } from "../i18n";
import { useApp, type Filter, type Section } from "../store";
import type { Chat, RoomPreview } from "../types";
import { CallView } from "./CallView";
import { ChatList, matchesFilter } from "./ChatList";
import { Conversation } from "./Conversation";
import { useMobile } from "./hooks";
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

const tabs: {
  id: Section;
  icon: string;
  key: "nav.chats" | "nav.calls" | "nav.explore" | "nav.settings";
}[] = [
  { id: "chats", icon: "chat", key: "nav.chats" },
  { id: "calls", icon: "phone", key: "nav.calls" },
  { id: "explore", icon: "users", key: "nav.explore" },
  { id: "settings", icon: "settings", key: "nav.settings" },
];

/** Native iOS tab bar: icon over label, filled glyph and accent tint on the active tab. */
function TabBar({ hidden }: { hidden?: boolean }) {
  const t = useT();
  const section = useApp((s) => s.section);
  const unread = useUnreadTotal();
  const lang = useApp((s) => s.lang);
  return (
    <nav className={`tabbar${hidden ? " away" : ""}`} aria-hidden={hidden}>
      {tabs.map((n) => (
        <button
          key={n.id}
          aria-current={section === n.id}
          onClick={() => useApp.setState({ section: n.id })}
        >
          <span className="tab-ic">
            <Icon name={n.icon} size={26} filled={section === n.id} stroke={1.7} />
            {n.id === "chats" && unread > 0 && <span className="badge">{num(unread, lang)}</span>}
          </span>
          <span className="tab-lb">{t(n.key)}</span>
        </button>
      ))}
    </nav>
  );
}

/** Desktop folder rail, like Telegram Desktop's folders column. */
function Rail() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me)!;
  const chats = useApp((s) => s.chats);
  const filter = useApp((s) => s.filter);
  const section = useApp((s) => s.section);
  const count = (f: Filter) =>
    Object.values(chats).filter((c) => matchesFilter(c, f) && c.unread > 0 && !c.muted).length;
  const archived = Object.values(chats).some((c) => c.archived);
  const folders: { id: Filter; icon: string; label: string }[] = [
    { id: "all", icon: "chat", label: t("nav.all") },
    { id: "direct", icon: "users", label: t("nav.direct") },
    { id: "groups", icon: "group", label: t("nav.groups") },
    { id: "channels", icon: "megaphone", label: t("nav.channels") },
    ...(archived ? [{ id: "archive" as Filter, icon: "archive", label: t("nav.archive") }] : []),
  ];
  const item = (
    key: string,
    icon: string,
    label: string,
    current: boolean,
    onClick: () => void,
    badge = 0,
  ) => (
    <button key={key} className="rail-item" aria-current={current} onClick={onClick} title={label}>
      <span className="ic">
        <Icon name={icon} size={24} filled={current} stroke={1.7} />
        {badge > 0 && <span className="badge">{num(badge, lang)}</span>}
      </span>
      <span className="lb">{label}</span>
    </button>
  );
  return (
    <nav className="rail" aria-label="folders">
      <button
        className="rail-me"
        onClick={() => useApp.setState({ section: "settings" })}
        title={me.displayName}
      >
        <Avatar id={me.id} name={me.displayName} media={me.avatar} size={38} />
      </button>
      {folders.map((f) =>
        item(
          f.id,
          f.icon,
          f.label,
          section === "chats" && filter === f.id,
          () => useApp.setState({ filter: f.id, section: "chats" }),
          count(f.id),
        ),
      )}
      <span className="rail-gap" />
      {item("calls", "phone", t("nav.calls"), section === "calls", () =>
        useApp.setState({ section: "calls" }),
      )}
      {item("explore", "compass", t("nav.explore"), section === "explore", () =>
        useApp.setState({ section: "explore" }),
      )}
      {item("settings", "settings", t("nav.settings"), section === "settings", () =>
        useApp.setState({ section: "settings" }),
      )}
      {me.isAdmin &&
        item("admin", "dashboard", t("nav.admin"), false, () => location.assign("/admin"))}
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
      <div>
        <BrandLogo size={88} />
        <h2>{config?.appName}</h2>
        <p>{t("chat.select")}</p>
        <p className="small">{config?.welcomeText || t("chat.selectHint")}</p>
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
  const section = useApp((s) => s.section);
  const activeId = useApp((s) => s.activeChatId);
  const chat = useApp((s) => (s.activeChatId ? s.chats[s.activeChatId] : undefined));
  const infoOpen = useApp((s) => s.infoOpen);
  const callPhase = useCall((s) => s.phase);
  const leavingChat = useLeaving<Chat>(chat, 340);
  const showInfo = infoOpen && chat ? chat : undefined;
  const leavingInfo = useLeaving<Chat>(showInfo, 340);

  // Escape closes the top layer like Telegram Desktop.
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
        <TabBar hidden={!!chat} />
        <OfflineBanner />
        <DeepLinks />
        {callPhase !== "idle" && <CallView />}
      </div>
    );
  }

  return (
    <div className={`desk${showInfo && section !== "settings" ? " with-info" : ""}`}>
      <Rail />
      <section className="col-list">
        {listPane}
        <SidebarAd />
      </section>
      <main className="col-main">
        {section === "settings" ? (
          <SettingsPane />
        ) : chat ? (
          <Conversation key={chat.id} chat={chat} />
        ) : (
          <Welcome />
        )}
      </main>
      {showInfo && section !== "settings" && (
        <aside className="col-info">
          <InfoPanel chat={showInfo} />
        </aside>
      )}
      <OfflineBanner />
      <DeepLinks />
      {callPhase !== "idle" && <CallView />}
    </div>
  );
}
