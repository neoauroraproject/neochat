import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { get, mediaUrl } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, BrandLogo } from "../components/ui";
import { num } from "../format";
import { useT } from "../i18n";
import { syncPush } from "../notify";
import { useApp, type Section } from "../store";
import type { Chat, RoomPreview } from "../types";
import { CallView } from "./CallView";
import { ChatList } from "./ChatList";
import { Conversation } from "./Conversation";
import { useMedia, useMobile } from "./hooks";
import { InfoPanel } from "./InfoPanel";
import { InstallGuide } from "./InstallGuide";
import { goBack } from "./nav";
import { CallsPane, ExplorePane } from "./Panes";
import { RoomPreviewModal } from "./RoomPreviewModal";
import { SettingsPane } from "./SettingsPane";
import { SharedPanel, SidebarAd } from "./SharedPanel";

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

/** The reference's icon rail: brand mark, section icons with a soft active tile and edge bar, me at the bottom. */
function Rail() {
  const t = useT();
  const section = useApp((s) => s.section);
  const me = useApp((s) => s.me)!;
  const unread = useUnreadTotal();
  const lang = useApp((s) => s.lang);
  const logo = useApp((s) => s.config?.logoMedia);
  const items: { id: Section; icon: string; key: (typeof sections)[number]["key"] }[] = [
    { id: "explore", icon: "eye", key: "nav.explore" },
    { id: "chats", icon: "group", key: "nav.chats" },
    { id: "calls", icon: "video", key: "nav.calls" },
    { id: "settings", icon: "settings", key: "nav.settings" },
  ];
  return (
    <nav className="rail" aria-label="main">
      <div className="rail-logo">{logo ? <img src={mediaUrl(logo)} alt="" /> : <BrandMark />}</div>
      <div className="rail-nav">
        {me.isAdmin && (
          <button
            className="rail-btn"
            onClick={() => location.assign("/admin")}
            title={t("nav.admin")}
            aria-label={t("nav.admin")}
          >
            <Icon name="gauge" size={22} />
          </button>
        )}
        {items.map((n) => {
          const on = section === n.id;
          return (
            <button
              key={n.id}
              className="rail-btn"
              aria-current={on}
              onClick={() => useApp.setState({ section: n.id })}
              title={t(n.key)}
              aria-label={t(n.key)}
            >
              <Icon name={n.icon} size={22} filled={on} />
              {n.id === "chats" && unread > 0 && <span className="badge">{num(unread, lang)}</span>}
            </button>
          );
        })}
      </div>
      <button
        className="rail-me"
        onClick={() => useApp.setState({ section: "settings" })}
        aria-label={t("nav.settings")}
      >
        <Avatar id={me.id} name={me.displayName} media={me.avatar} size={38} />
      </button>
    </nav>
  );
}

/** The app's mark without its tile: a speech bubble in the accent color. */
function BrandMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 4.5C8.8 4.5 3 9.6 3 15.9c0 3.6 1.9 6.8 4.8 8.9l-1 4.5c-.2.8.7 1.4 1.4 1l5.3-3.1c.8.1 1.6.2 2.5.2 7.2 0 13-5.1 13-11.5S23.2 4.5 16 4.5Z"
        fill="var(--accent)"
      />
      <circle cx="10.8" cy="16" r="1.8" fill="#fff" />
      <circle cx="16" cy="16" r="1.8" fill="#fff" />
      <circle cx="21.2" cy="16" r="1.8" fill="#fff" />
    </svg>
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

function Welcome() {
  const t = useT();
  const config = useApp((s) => s.config);
  return (
    <section className="welcome">
      <BrandLogo size={88} />
      <h2>{config?.appName}</h2>
      <p>{t("chat.select")}</p>
      <p className="small">{config?.welcomeText || t("chat.selectHint")}</p>
      <div className="welcome-foot">
        <SidebarAd />
        <span className="copy">{t("common.copyright")}</span>
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
    // Opened from a notification while the app was closed: /?chat=<id>.
    const fromPush = Number(new URLSearchParams(location.search).get("chat"));
    if (fromPush) {
      useApp
        .getState()
        .refreshChat(fromPush)
        .then((c) => c && useApp.getState().openChat(c.id));
    }
    if (join || handle || fromPush) history.replaceState(null, "", "/");
  }, []);

  // Tapping a notification while the app is open in the background.
  useEffect(() => {
    syncPush();
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "open-chat" && e.data.chatId) useApp.getState().openChat(e.data.chatId);
    };
    sw.addEventListener("message", onMsg);
    return () => sw.removeEventListener("message", onMsg);
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

/**
 * Interactive edge swipe-back for phones. The conversation tracks the finger 1:1, the list below slides
 * in with parallax, and the release uses the flick's velocity (projected 180ms ahead) to commit or cancel.
 */
function useEdgeBack(
  root: React.RefObject<HTMLDivElement>,
  enabled: boolean,
  onCommit: () => void,
) {
  useEffect(() => {
    const el = root.current;
    if (!enabled || !el) return;
    const rtl = document.documentElement.dir === "rtl";
    const sign = rtl ? -1 : 1; // trailing direction: +x in LTR, -x in RTL
    let st: {
      id: number;
      x0: number;
      y0: number;
      t0: number;
      last: number;
      lastT: number;
      v: number;
      locked?: boolean;
    } | null = null;
    const screens = () => ({
      top: el.querySelector<HTMLElement>(".push-screen:not(.top):not(.leaving)"),
      under: el.querySelector<HTMLElement>(".tab-screen"),
      bar: el.querySelector<HTMLElement>(".capsule"),
    });
    const paint = (dist: number, animate: boolean) => {
      const { top, under } = screens();
      const W = el.clientWidth;
      const tr = animate ? "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)" : "none";
      if (top) {
        top.style.animation = "none";
        top.style.transition = tr;
        top.style.transform = `translateX(${sign * dist}px)`;
      }
      if (under) {
        under.style.transition = tr;
        // from the resting offset (-28% toward the leading side) back to 0
        under.style.transform = `translateX(${-sign * 0.28 * W * (1 - dist / W)}px)`;
      }
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || document.querySelector(".overlay")) return;
      const edge = rtl ? el.clientWidth - e.clientX : e.clientX;
      if (edge > 28) return;
      const { top } = screens();
      if (!top) return;
      st = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        t0: e.timeStamp,
        last: e.clientX,
        lastT: e.timeStamp,
        v: 0,
      };
    };
    const move = (e: PointerEvent) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = sign * (e.clientX - st.x0);
      const dy = e.clientY - st.y0;
      if (!st.locked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
          st = null;
          return;
        }
        st.locked = true;
        el.setPointerCapture(e.pointerId);
      }
      const dt = Math.max(1, e.timeStamp - st.lastT);
      st.v = (sign * (e.clientX - st.last)) / dt; // px/ms toward trailing
      st.last = e.clientX;
      st.lastT = e.timeStamp;
      paint(Math.max(0, Math.min(dx, el.clientWidth)), false);
    };
    const up = (e: PointerEvent) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st;
      st = null;
      if (!s.locked) return;
      const W = el.clientWidth;
      const dist = Math.max(0, sign * (s.last - s.x0));
      const commit = dist + s.v * 180 > W * 0.4;
      paint(commit ? W : 0, true);
      // Only transform/transition are reset: clearing the inline `animation: none` would replay the slide-in.
      const reset = () => {
        const { top, under } = screens();
        [top, under].forEach((n) => {
          if (n) {
            n.style.transform = "";
            n.style.transition = "";
          }
        });
      };
      if (commit) {
        navigator.vibrate?.(6);
        window.setTimeout(() => {
          onCommit();
          window.setTimeout(reset, 160); // after React drops the pushed state, so the parallax rule applies again
        }, 300);
      } else window.setTimeout(reset, 340);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [root, enabled, onCommit]);
}

export function AppShell() {
  const isMobile = useMobile();
  const wide = useMedia("(min-width: 1280px)");
  const section = useApp((s) => s.section);
  const activeId = useApp((s) => s.activeChatId);
  const chat = useApp((s) => (s.activeChatId ? s.chats[s.activeChatId] : undefined));
  const infoOpen = useApp((s) => s.infoOpen);
  const callPhase = useCall((s) => s.phase);
  const callMin = useCall((s) => s.minimized);
  const phoneRef = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);
  const leavingChat = useLeaving<Chat>(chat, 340);
  useEffect(() => {
    if (chat) swiped.current = false;
  }, [chat]);
  const commitSwipe = useCallback(() => {
    swiped.current = true; // the screen already left under the finger: skip the exit animation
    goBack();
  }, []);
  useEdgeBack(phoneRef, isMobile && !!chat && !infoOpen, commitSwipe);
  const showInfo = infoOpen && chat ? chat : undefined;
  const leavingInfo = useLeaving<Chat>(showInfo, 340);
  // The shared-files column stays open on wide screens; narrower ones slide it over the chat on demand.
  const [filesOpen, setFilesOpenState] = useState(() => {
    try {
      return localStorage.getItem("neochat.files") !== "0";
    } catch {
      return true;
    }
  });
  const setFilesOpen = useCallback((v: boolean) => {
    setFilesOpenState(v);
    try {
      localStorage.setItem("neochat.files", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [activeId]);
  const sideOpen = wide ? filesOpen : peek;

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
    const stackChat = chat || (swiped.current ? undefined : leavingChat);
    const stackInfo = showInfo || leavingInfo;
    return (
      <div className={`phone${chat ? " pushed" : ""}`} ref={phoneRef}>
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
        <InstallGuide />
        {callPhase !== "idle" && <CallView />}
      </div>
    );
  }

  // Desktop: the reference's card — rail, list, gray center panel and the shared-files column.
  const inCall = callPhase !== "idle" && !callMin;
  let center: React.ReactNode;
  if (inCall) center = <CallView embedded />;
  else if (section === "settings") center = <SettingsPane />;
  else if (chat)
    center = (
      <Conversation
        key={chat.id}
        chat={chat}
        filesHidden={!sideOpen}
        onShowFiles={() => (wide ? setFilesOpen(true) : setPeek(true))}
      />
    );
  else center = <Welcome />;

  let side: React.ReactNode = null;
  if (chat && !inCall && section !== "settings") {
    if (showInfo) side = <InfoPanel chat={showInfo} />;
    else if (sideOpen)
      side = (
        <SharedPanel chat={chat} onHide={() => (wide ? setFilesOpen(false) : setPeek(false))} />
      );
  }

  return (
    <div className="dash">
      <div className={`dash-card${wide ? "" : " compact"}${side ? " has-side" : ""}`}>
        <Rail />
        <section className="col-list">{listPane}</section>
        <main className="col-main">{center}</main>
        {side && !wide && (
          <div
            className="side-scrim"
            onClick={() => (showInfo ? useApp.setState({ infoOpen: false }) : setPeek(false))}
          />
        )}
        {side && (
          <aside className="col-side" key={showInfo ? "info" : "files"}>
            {side}
          </aside>
        )}
      </div>
      {callPhase !== "idle" && callMin && <CallView />}
      <OfflineBanner />
      <DeepLinks />
      <InstallGuide />
    </div>
  );
}
