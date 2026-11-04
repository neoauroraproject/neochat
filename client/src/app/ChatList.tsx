import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { adHref, adsFor, adTarget, trackImpression } from "../ads";
import { get, mediaUrl } from "../api";
import { Icon } from "../components/Icon";
import {
  Avatar,
  ColHead,
  Empty,
  Menu,
  SearchField,
  useDebounced,
  usePress,
  type MenuItem,
} from "../components/ui";
import { chatTitle, listStamp, num, preview } from "../format";
import { useT } from "../i18n";
import { sortedChats, useApp, type Filter } from "../store";
import { searchMessages } from "../localdb";
import type { Ad, Chat, Message, RoomPreview, User } from "../types";
import { useConnState, useContacts, useMobile, useTick } from "./hooks";
import { askRemoveChat } from "./chatActions";
import { useNewMenu } from "./NewMenu";
import { MobileHeader, RoundButton } from "./MobileHeader";
import { RoomPreviewModal } from "./RoomPreviewModal";

export function matchesFilter(c: Chat, f: Filter) {
  if (f === "archive") return c.archived;
  if (c.archived) return false;
  switch (f) {
    case "direct":
      return c.type === "direct";
    case "groups":
      return c.type === "group";
    case "channels":
      return c.type === "channel";
    case "unread":
      return c.unread > 0;
  }
  return true;
}

/** Large-title navigation: the big title scrolls away and a small one fades into the translucent bar. */
export function useLargeTitle() {
  const [collapsed, setCollapsed] = useState(false);
  const onScroll = (e: React.UIEvent<HTMLElement>) => setCollapsed(e.currentTarget.scrollTop > 38);
  return { collapsed, onScroll };
}

/** FLIP: rows that change position (a chat jumping to the top) glide there instead of teleporting. */
function useFlip(resetKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(new Map<string, number>());
  const key = useRef(resetKey);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (key.current !== resetKey) {
      key.current = resetKey;
      prev.current = new Map();
    }
    const next = new Map<string, number>();
    el.querySelectorAll<HTMLElement>(":scope > .cell-wrap[data-id]").forEach((n) => {
      const id = n.dataset.id!;
      const top = n.offsetTop;
      next.set(id, top);
      const old = prev.current.get(id);
      if (
        old !== undefined &&
        old !== top &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        n.animate([{ transform: `translateY(${old - top}px)` }, { transform: "translateY(0)" }], {
          duration: 380,
          easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        });
      }
    });
    prev.current = next;
  });
  return ref;
}

export function ChatList() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const chats = useApp((s) => s.chats);
  const filter = useApp((s) => s.filter);
  const loaded = useApp((s) => s.chatsLoaded);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const newMenu = useNewMenu();
  const isMobile = useMobile();
  const { collapsed, onScroll } = useLargeTitle();
  const cellsRef = useFlip(filter);
  useTick(60_000);

  const list = useMemo(
    () => sortedChats(chats).filter((c) => matchesFilter(c, filter)),
    [chats, filter],
  );
  const query = q.trim().toLowerCase().replace(/^@/, "");
  const local = query
    ? sortedChats(chats).filter(
        (c) =>
          chatTitle(c, lang).toLowerCase().includes(query) ||
          c.peer?.username.toLowerCase().includes(query) ||
          c.handle.toLowerCase().includes(query),
      )
    : [];

  const appName = useApp((s) => s.config?.appName);
  const conn = useConnState();
  const title =
    filter === "archive" ? (
      t("nav.archive")
    ) : conn !== "ok" ? (
      <ConnectingLabel state={conn} />
    ) : (
      appName || t("nav.chats")
    );

  const rows = (
    <>
      <div className="cells" ref={cellsRef}>
        {list.map((c) => (
          <ChatRow key={c.id} chat={c} />
        ))}
      </div>
      {loaded && list.length === 0 && (
        <Empty icon="chat" title={t("list.empty")} text={t("list.emptyHint")}>
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => useApp.setState({ section: "explore" })}
          >
            {t("nav.explore")}
          </button>
        </Empty>
      )}
      {!loaded && list.length === 0 && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}
    </>
  );

  if (!isMobile) {
    const back = () => {
      const s = useApp.getState();
      if (s.filter !== "all") useApp.setState({ filter: "all" });
      else if (s.activeChatId) s.openChat(null);
    };
    return (
      <div className="screen list-screen">
        <ColHead title={title} onBack={back} backLabel={t("common.back")} />
        <div className="screen-scroll">
          <MeBlock />
          <div className="search-row">
            <SearchField value={q} onChange={setQ} placeholder={t("list.search")} />
          </div>
          {query ? (
            <SearchResults query={query} local={local} />
          ) : (
            <>
              <ListHead onNew={(el) => newMenu.open(el)} />
              {filter === "all" && <AdBanner />}
              {rows}
            </>
          )}
        </div>
        {newMenu.element}
      </div>
    );
  }

  const closeSearch = () => {
    setQ("");
    setSearching(false);
  };
  return (
    <div className={`screen list-screen${collapsed ? " collapsed" : ""}`}>
      <MobileHeader
        title={title}
        leading={
          filter === "archive" ? (
            <button
              className="m-back"
              onClick={() => useApp.setState({ filter: "all" })}
              aria-label={t("common.back")}
            >
              <Icon name="back" size={22} className="flip-rtl" />
            </button>
          ) : undefined
        }
        actions={
          <>
            <RoundButton
              icon="search"
              label={t("common.search")}
              active={searching}
              onClick={() => (searching ? closeSearch() : setSearching(true))}
            />
            <RoundButton
              icon="plus"
              solid
              label={t("list.newChat")}
              onClick={(e) => newMenu.open(e.currentTarget)}
            />
          </>
        }
      />
      <div className="screen-scroll" onScroll={onScroll}>
        {(searching || q) && (
          <div className="search-row m-search">
            <SearchField value={q} onChange={setQ} placeholder={t("list.search")} autoFocus />
            <button className="m-cancel" onClick={closeSearch}>
              {t("common.cancel")}
            </button>
          </div>
        )}
        {!query && <FolderTabs />}
        {query ? (
          <SearchResults query={query} local={local} />
        ) : (
          <>
            {filter === "all" && <Stories />}
            {filter === "all" && <AdBanner />}
            {rows}
          </>
        )}
      </div>
      {newMenu.element}
    </div>
  );
}

/** "Connecting" (or "Waiting for network") with three small dots that appear one by one. */
export function ConnectingLabel({ state }: { state: "connecting" | "offline" }) {
  const t = useT();
  return (
    <span className="conn-label" role="status">
      {t(state === "offline" ? "list.waitingNetwork" : "list.connecting")}
      <span className="conn-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

/** The signed-in person at the top of the list column: photo, name and a status pill with account actions. */
function MeBlock() {
  const t = useT();
  const me = useApp((s) => s.me)!;
  const connected = useApp((s) => s.connected);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const items: MenuItem[] = [
    {
      icon: "settings",
      label: t("nav.settings"),
      onClick: () => useApp.setState({ section: "settings" }),
    },
    {
      icon: "dashboard",
      label: t("nav.admin"),
      onClick: () => location.assign("/admin"),
      hidden: !me.isAdmin,
    },
    {
      icon: "logout",
      label: t("me.logout"),
      danger: true,
      onClick: () => useApp.getState().logout(),
    },
  ];
  return (
    <div className="me-block">
      <button
        className="me-gear"
        onClick={() => useApp.setState({ section: "settings" })}
        aria-label={t("nav.settings")}
      >
        <Icon name="settings" size={17} />
      </button>
      <button className="me-photo" onClick={() => useApp.setState({ section: "settings" })}>
        <Avatar id={me.id} name={me.displayName} media={me.avatar} size={104} online={connected} />
      </button>
      <div className="me-name">{me.displayName}</div>
      <button
        className={`me-status${connected ? "" : " off"}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 6 });
        }}
      >
        {connected ? t("me.available") : t("common.connecting")}
        <Icon name="down" size={13} stroke={2.2} />
      </button>
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** "Last chats" with the new-chat button and a menu that switches between folders. */
function ListHead({ onNew }: { onNew: (anchor: HTMLElement) => void }) {
  const t = useT();
  const filter = useApp((s) => s.filter);
  const chats = useApp((s) => s.chats);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const archived = Object.values(chats).some((c) => c.archived);
  const folders: { id: Filter; icon: string; label: string }[] = [
    { id: "all", icon: "chat", label: t("nav.all") },
    { id: "direct", icon: "users", label: t("nav.direct") },
    { id: "groups", icon: "group", label: t("nav.groups") },
    { id: "channels", icon: "megaphone", label: t("nav.channels") },
    { id: "unread", icon: "bell", label: t("nav.unread") },
    ...(archived ? [{ id: "archive" as Filter, icon: "archive", label: t("nav.archive") }] : []),
  ];
  const label =
    filter === "all" ? t("list.lastChats") : folders.find((f) => f.id === filter)?.label;
  return (
    <div className="list-head">
      <span className="lbl">{label}</span>
      <button
        className="add-btn"
        onClick={(e) => onNew(e.currentTarget)}
        aria-label={t("list.newChat")}
      >
        <Icon name="plus" size={16} stroke={2.2} />
      </button>
      <button
        className="kebab"
        aria-label={t("nav.all")}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.right, y: r.bottom + 4 });
        }}
      >
        <Icon name="more-v" size={18} stroke={2.4} />
      </button>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={folders.map((f) => ({
            icon: f.id === filter ? "check" : f.icon,
            label: f.label,
            onClick: () => useApp.setState({ filter: f.id }),
          }))}
        />
      )}
    </div>
  );
}

/** Telegram-style folder tabs with an underline that slides to the active folder. */
function FolderTabs() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const chats = useApp((s) => s.chats);
  const filter = useApp((s) => s.filter);
  const ref = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);
  const count = (f: Filter) =>
    Object.values(chats).filter((c) => matchesFilter(c, f) && c.unread > 0 && !c.muted).length;
  const archived = Object.values(chats).some((c) => c.archived);
  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: t("nav.all") },
    { id: "direct", label: t("nav.direct") },
    { id: "groups", label: t("nav.groups") },
    { id: "channels", label: t("nav.channels") },
    ...(archived ? [{ id: "archive" as Filter, label: t("nav.archive") }] : []),
  ];
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && ref.current) setInk({ x: el.offsetLeft, w: el.offsetWidth });
  }, [filter, lang, archived]);
  return (
    <div className="folder-tabs" role="tablist" ref={ref}>
      {tabs.map((f) => {
        const n = count(f.id);
        return (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => useApp.setState({ filter: f.id })}
          >
            <span>
              {f.label}
              {n > 0 && <i className="badge">{num(n, lang)}</i>}
            </span>
          </button>
        );
      })}
      {ink && <b className="ink" style={{ transform: `translateX(${ink.x}px)`, width: ink.w }} />}
    </div>
  );
}

/** Online people as story-style circles; a colored ring means they are online now. */
function Stories() {
  const contacts = useContacts();
  const me = useApp((s) => s.me);
  const shown = contacts.filter((u) => u.id !== me?.id).slice(0, 20);
  if (shown.length === 0) return null;
  return (
    <div className="stories">
      {shown.map((u) => (
        <button
          key={u.id}
          className={`story${u.online ? " online" : ""}`}
          onClick={() => useApp.getState().openDirect(u.id)}
          title={"@" + u.username}
        >
          <Avatar id={u.id} name={u.displayName} media={u.avatar} size={54} online={u.online} />
          <span className="name">{u.displayName}</span>
        </button>
      ))}
    </div>
  );
}

const dismissedAds = new Set<Ad["id"]>();

function AdBanner() {
  const t = useT();
  const ads = useApp((s) => s.ads);
  const [, force] = useState(0);
  const ad = adsFor(ads, "chatlist").find((a) => !dismissedAds.has(a.id));
  useEffect(() => {
    if (ad) trackImpression(ad);
  }, [ad]);
  if (!ad) return null;
  return (
    <div className="ad-cell">
      <a href={adHref(ad)} target={adTarget(ad)} rel="noopener noreferrer">
        {ad.image ? (
          <img src={mediaUrl(ad.image, true)} alt="" />
        ) : (
          <span className="ad-icon">
            <Icon name="megaphone" size={22} />
          </span>
        )}
        <span className="grow">
          <span className="t">
            {ad.title}
            <em>{ad.badge || t("chat.sponsored")}</em>
          </span>
          {ad.body && <span className="b">{ad.body}</span>}
        </span>
      </a>
      <button
        className="icon-btn"
        aria-label={t("common.close")}
        onClick={() => {
          dismissedAds.add(ad.id);
          force((n) => n + 1);
        }}
      >
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

// Only one row is swiped open at a time, like UITableView.
let closeOpenRow: (() => void) | null = null;

/**
 * Horizontal swipe (touch) reveals icon actions at the inline end; a long swipe past the actions runs the
 * primary one. The row follows the finger through direct style writes (no re-render per frame) and settles
 * with the velocity it was released at. Vertical movement keeps scrolling the list.
 */
function useSwipe(width: number, onFull: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  const x = useRef(0);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const st = useRef<{ x0: number; y0: number; base: number; t: number; locked?: "x" | "y" } | null>(
    null,
  );
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const sign = rtl ? 1 : -1; // actions sit at the inline end; content moves toward the inline start

  const apply = (v: number, animate: boolean) => {
    x.current = v;
    const el = ref.current;
    if (el) {
      el.style.transition = animate ? "" : "none";
      el.style.transform = v ? `translateX(${v}px)` : "";
    }
    setOpen(v !== 0);
  };
  const close = () => {
    armedRef.current = false;
    setArmed(false);
    apply(0, true);
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      st.current = { x0: e.clientX, y0: e.clientY, base: x.current, t: e.timeStamp };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current;
      if (!s) return;
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      if (!s.locked) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        s.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (s.locked === "x") {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
        }
      }
      if (s.locked !== "x") return;
      let next = s.base + dx;
      const travel = sign * next; // positive = revealing the actions
      if (travel < 0) next = next * 0.25; // dragging the wrong way resists
      apply(next, false);
      // reachable on any screen: a little past the actions, or most of the row, whichever is larger
      const fullAt = Math.max(width + 48, (ref.current?.offsetWidth ?? 360) * 0.78);
      const isArmed = travel > fullAt;
      if (isArmed !== armedRef.current) {
        armedRef.current = isArmed;
        setArmed(isArmed);
        navigator.vibrate?.(8);
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = st.current;
      st.current = null;
      if (!s || s.locked !== "x") return;
      if (armedRef.current) {
        // fly the row out, then run the primary action
        apply(sign * window.innerWidth, true);
        setTimeout(() => {
          onFull();
          close();
        }, 220);
        return;
      }
      const v = (e.clientX - s.x0) / Math.max(1, e.timeStamp - s.t); // px per ms
      const travel = sign * x.current;
      const projected = travel + sign * v * 220; // where the flick would come to rest
      const shouldOpen = projected > width * 0.5;
      apply(shouldOpen ? sign * width : 0, true);
      if (shouldOpen) closeOpenRow = close;
    },
  };
  return { ref, open, armed, close, handlers };
}

export function ChatRow({ chat: c, compact }: { chat: Chat; compact?: boolean }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me);
  const active = useApp((s) => s.activeChatId === c.id);
  const typing = useApp((s) => s.typing[c.id]);
  const draft = useApp((s) => s.drafts[c.id]);
  const isMobile = useMobile();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const press = usePress((x, y) => setMenu({ x, y }));
  const swipe = useSwipe(256, () => useApp.getState().setPrefs(c.id, { archived: !c.archived }));
  const title = chatTitle(c, lang);
  const lm = c.lastMessage;
  const typers = Object.entries(typing || {}).filter(([, v]) => v.until > Date.now());
  const mine = lm && lm.senderId === me?.id && lm.kind !== "system";

  let sub: React.ReactNode;
  if (typers.length) {
    const action = typers[0][1].action;
    sub = (
      <span className="typing">
        {t(
          action === "recording"
            ? "presence.recording"
            : action === "uploading"
              ? "presence.uploading"
              : "presence.typing",
        )}
      </span>
    );
  } else if (draft && !active) {
    sub = (
      <>
        <span className="draft">{t("list.draft")}: </span>
        {draft}
      </>
    );
  } else if (lm) {
    const who =
      c.type === "group" && lm.kind !== "system"
        ? mine
          ? t("common.you")
          : lm.sender.displayName.split(" ")[0]
        : "";
    sub = (
      <>
        {who && <span className="who">{who}: </span>}
        {preview(lm, lang, me?.id)}
      </>
    );
  } else if (c.type !== "direct") {
    sub = t(c.type === "channel" ? "presence.subscribers" : "presence.members", {
      n: num(c.memberCount, lang),
    });
  }

  const prefs = useApp.getState().setPrefs;
  const items: MenuItem[] = [
    {
      icon: "pin",
      label: c.pinned ? t("list.unpin") : t("list.pin"),
      onClick: () => prefs(c.id, { pinned: !c.pinned }),
    },
    {
      icon: c.muted ? "bell" : "bell-off",
      label: c.muted ? t("list.unmute") : t("list.mute"),
      onClick: () => prefs(c.id, { muted: !c.muted }),
    },
    {
      icon: "archive",
      label: c.archived ? t("list.unarchive") : t("list.archive"),
      onClick: () => prefs(c.id, { archived: !c.archived }),
    },
    {
      icon: "trash",
      label:
        c.type === "direct"
          ? t("list.deleteChat")
          : c.role === "owner"
            ? t("room.delete")
            : t("room.leave"),
      danger: true,
      onClick: () => askRemoveChat(c),
    },
  ];
  const act = (fn: () => void) => () => {
    swipe.close();
    fn();
  };

  const read = !!(mine && lm && c.othersReadId >= lm.id);
  const badge =
    c.unread > 0 ? (
      <span className={`badge${c.muted ? " muted" : ""}`}>{num(c.unread, lang)}</span>
    ) : null;
  const tick = badge ? null : read && c.peer && !c.saved ? (
    <Icon name="checks" size={15} className="tick read" />
  ) : mine ? (
    <Icon name={read ? "checks" : "check"} size={15} className="tick" />
  ) : null;
  // Phones put the unread count on the name's line (after the time) and the ticks before the time.
  const trail = isMobile ? (
    tick && <span className="trail ticks">{tick}</span>
  ) : (
    <span className="trail">{badge || tick}</span>
  );
  return (
    <div
      className={`cell-wrap${compact ? " compact" : ""}${swipe.open ? " swiping" : ""}`}
      data-id={c.id}
    >
      {isMobile && !compact && (
        <div className={`swipe-actions${swipe.armed ? " armed" : ""}`} aria-hidden={!swipe.open}>
          <button className="sa" onClick={act(items[0].onClick)} aria-label={items[0].label}>
            <Icon name="pin" size={22} filled={c.pinned} />
          </button>
          <button className="sa" onClick={act(items[1].onClick)} aria-label={items[1].label}>
            <Icon name={items[1].icon} size={22} />
          </button>
          <button className="sa full" onClick={act(items[2].onClick)} aria-label={items[2].label}>
            <Icon name="archive" size={22} />
          </button>
          <button className="sa del" onClick={act(items[3].onClick)} aria-label={items[3].label}>
            <Icon name="trash" size={22} />
          </button>
        </div>
      )}
      <button
        className={`chat-cell${c.unread > 0 && !c.muted ? " unread" : ""}${c.pinned ? " pinned" : ""}`}
        aria-current={active}
        ref={swipe.ref as React.Ref<HTMLButtonElement>}
        onClick={() => (swipe.open ? swipe.close() : useApp.getState().openChat(c.id))}
        {...(isMobile ? swipe.handlers : {})}
        {...press}
      >
        <Avatar
          id={c.saved ? -1 : (c.peer?.id ?? c.id)}
          name={title}
          media={c.saved ? undefined : (c.peer?.avatar ?? c.avatar)}
          size={compact ? 40 : isMobile ? 52 : 46}
          online={c.type === "direct" && !c.saved && c.peer?.online}
          icon={c.saved ? "bookmark" : undefined}
        />
        <span className="cell-body">
          <span className="line1">
            {c.type === "group" && <Icon name="group" size={14} className="kind" />}
            {c.type === "channel" && <Icon name="megaphone" size={14} className="kind" />}
            <span className="title">{title}</span>
            {c.muted && <Icon name="bell-off" size={13} className="kind" />}
            {c.pinned && <Icon name="pin" size={13} className="kind" />}
            {isMobile && trail}
            <span className="time">{listStamp(c.lastMessageAt, lang)}</span>
            {isMobile && badge && <span className="trail">{badge}</span>}
          </span>
          <span className="line2">
            <span className="sub">{sub}</span>
            {!isMobile && trail}
          </span>
        </span>
      </button>
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Local chats + global people/room search by username — the "find by @id" flow. */
export function SearchResults({ query, local = [] }: { query: string; local?: Chat[] }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const debounced = useDebounced(query, 250);
  const [res, setRes] = useState<{ users: User[]; rooms: RoomPreview[] } | null>(null);
  const [room, setRoom] = useState<RoomPreview | null>(null);
  const [found, setFound] = useState<Message[]>([]);
  const chats = useApp((s) => s.chats);
  const meId = useApp((s) => s.me?.id);
  const reqId = useRef(0);
  // Messages are searched in the phone's own copy, so this works without the network.
  useEffect(() => {
    if (!meId || debounced.length < 2) return setFound([]);
    searchMessages(meId, debounced).then(setFound);
  }, [debounced, meId]);
  useEffect(() => {
    if (debounced.length < 2) return setRes(null);
    const id = ++reqId.current;
    get<{ users: User[]; rooms: RoomPreview[] }>(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => id === reqId.current && setRes(r))
      .catch(() => {});
  }, [debounced]);

  const localIds = new Set(local.map((c) => c.peer?.id).filter(Boolean));
  const people = (res?.users || []).filter((u) => !localIds.has(u.id));
  const rooms = (res?.rooms || []).filter((r) => !local.some((c) => c.id === r.id));
  return (
    <div className="results">
      {local.length > 0 && <div className="section-label">{t("list.myChats")}</div>}
      {local.map((c) => (
        <ChatRow key={c.id} chat={c} compact />
      ))}
      {people.length > 0 && <div className="section-label">{t("list.people")}</div>}
      {people.map((u) => (
        <button
          key={u.id}
          className="row person"
          onClick={() => useApp.getState().openDirect(u.id)}
        >
          <Avatar id={u.id} name={u.displayName} media={u.avatar} size={42} online={u.online} />
          <div className="grow">
            <div className="title">{u.displayName}</div>
            <div className="sub ltr" style={{ textAlign: "start" }}>
              @{u.username}
            </div>
          </div>
        </button>
      ))}
      {rooms.length > 0 && <div className="section-label">{t("list.publicRooms")}</div>}
      {rooms.map((r) => (
        <button key={r.id} className="row person" onClick={() => setRoom(r)}>
          <Avatar id={r.id} name={r.title} media={r.avatar} size={42} />
          <div className="grow">
            <div className="title">{r.title}</div>
            <div className="sub">
              <span className="ltr">@{r.handle}</span> ·{" "}
              {t(r.type === "channel" ? "presence.subscribers" : "presence.members", {
                n: num(r.memberCount, lang),
              })}
            </div>
          </div>
        </button>
      ))}
      {found.length > 0 && <div className="section-label">{t("list.messages")}</div>}
      {found.map((m) => {
        const c = chats[m.chatId];
        if (!c) return null;
        return (
          <button
            key={m.id}
            className="row person"
            onClick={() => {
              useApp.getState().openChat(c.id);
              useApp.setState({ jumpTo: { chatId: c.id, messageId: m.id } });
            }}
          >
            <Avatar
              id={c.peer?.id ?? c.id}
              name={chatTitle(c, lang)}
              media={c.peer?.avatar || c.avatar}
              size={42}
            />
            <div className="grow">
              <div className="title">
                {chatTitle(c, lang)}
                <span className="muted" style={{ float: "inline-end", fontSize: 12 }}>
                  {listStamp(m.createdAt, lang)}
                </span>
              </div>
              <div className="sub">
                <Highlight text={m.text} q={debounced} />
              </div>
            </div>
          </button>
        );
      })}
      {res && !local.length && !people.length && !rooms.length && !found.length && (
        <Empty icon="search" title={t("list.noResults")} />
      )}
      {room && <RoomPreviewModal room={room} onClose={() => setRoom(null)} />}
    </div>
  );
}

/** The matched words in bold, with a little context around them. */
function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return <>{text.slice(0, 80)}</>;
  const start = Math.max(0, i - 24);
  const n = q.trim().length;
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, i)}
      <b>{text.slice(i, i + n)}</b>
      {text.slice(i + n, i + n + 60)}
    </>
  );
}
