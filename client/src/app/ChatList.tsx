import { useEffect, useMemo, useRef, useState } from "react";
import { adHref, adsFor, adTarget, trackImpression } from "../ads";
import { get, mediaUrl } from "../api";
import { Icon } from "../components/Icon";
import {
  Avatar,
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
import type { Ad, Chat, RoomPreview, User } from "../types";
import { useContacts, useMedia, useMobile, useTick } from "./hooks";
import { useNewMenu } from "./NewMenu";
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

export function ChatList() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const chats = useApp((s) => s.chats);
  const filter = useApp((s) => s.filter);
  const loaded = useApp((s) => s.chatsLoaded);
  const [q, setQ] = useState("");
  const newMenu = useNewMenu();
  const isMobile = useMobile();
  const { collapsed, onScroll } = useLargeTitle();
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

  const title = filter === "archive" ? t("nav.archive") : t("nav.chats");
  const me = useApp((s) => s.me);
  const narrow = !useMedia("(min-width: 1180px)");
  const compose = (
    <button
      className="glass-circle"
      onClick={(e) => newMenu.open(e.currentTarget)}
      aria-label={t("list.newChat")}
    >
      <Icon name="edit" size={20} />
    </button>
  );

  return (
    <div className={`screen list-screen${collapsed ? " collapsed" : ""}`}>
      {isMobile && (
        <header className="m-top">
          {filter === "archive" ? (
            <button className="glass-circle" onClick={() => useApp.setState({ filter: "all" })}>
              <Icon name="back" size={22} className="flip-rtl" />
            </button>
          ) : (
            <button
              className="glass-circle avatar-btn"
              onClick={() => useApp.setState({ section: "settings" })}
              aria-label={t("nav.settings")}
            >
              {me && <Avatar id={me.id} name={me.displayName} media={me.avatar} size={38} />}
            </button>
          )}
          <div className="m-title">{title}</div>
          {compose}
        </header>
      )}
      <div className="screen-scroll" onScroll={onScroll}>
        <div className="search-row">
          <SearchField value={q} onChange={setQ} placeholder={t("list.search")} />
          {!isMobile && compose}
        </div>
        {!query && (isMobile || narrow || filter === "archive") && <FolderTabs />}
        {query ? (
          <SearchResults query={query} local={local} />
        ) : (
          <>
            {filter === "all" && <Stories />}
            {filter === "all" && <AdBanner />}
            <div className="cells">
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
        )}
      </div>
      {newMenu.element}
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

/** Horizontal swipe on touch reveals row actions; vertical movement keeps scrolling the list. */
function useSwipe(width: number) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef<{ x0: number; y0: number; base: number; t: number; locked?: "x" | "y" } | null>(
    null,
  );
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const sign = rtl ? 1 : -1; // actions sit at the inline end; content moves toward the inline start
  const close = () => setX(0);
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      st.current = { x0: e.clientX, y0: e.clientY, base: x, t: e.timeStamp };
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
          setDragging(true);
        }
      }
      if (s.locked !== "x") return;
      let next = s.base + dx;
      const max = width * Math.abs(sign);
      // Past the actions the row follows with rubber-band resistance.
      const over = sign * next - max;
      if (over > 0) next = sign * (max + over * 0.25);
      if (sign * next < 0) next = next * 0.25;
      setX(next);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = st.current;
      st.current = null;
      if (!s || s.locked !== "x") return;
      setDragging(false);
      const v = (e.clientX - s.x0) / Math.max(1, e.timeStamp - s.t);
      const open = sign * v > 0.3 || (sign * v > -0.3 && sign * x > width / 2);
      setX(open ? sign * width : 0);
      if (open) closeOpenRow = close;
    },
  };
  return { x, dragging, close, handlers, isOpen: x !== 0 };
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
  const swipe = useSwipe(216);
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
  ];
  const act = (fn: () => void) => () => {
    swipe.close();
    fn();
  };

  const read = !!(mine && lm && c.othersReadId >= lm.id);
  return (
    <div className={`cell-wrap${compact ? " compact" : ""}${swipe.x !== 0 ? " swiping" : ""}`}>
      {isMobile && !compact && (
        <div className="swipe-actions" aria-hidden={!swipe.isOpen}>
          <button className="sa pin" onClick={act(items[0].onClick)}>
            <Icon name="pin" size={22} />
            <span>{items[0].label}</span>
          </button>
          <button className="sa mute" onClick={act(items[1].onClick)}>
            <Icon name={items[1].icon} size={22} />
            <span>{items[1].label}</span>
          </button>
          <button className="sa archive" onClick={act(items[2].onClick)}>
            <Icon name="archive" size={22} />
            <span>{items[2].label}</span>
          </button>
        </div>
      )}
      <button
        className={`chat-cell${c.unread > 0 && !c.muted ? " unread" : ""}${c.pinned ? " pinned" : ""}`}
        aria-current={active}
        style={{
          transform: swipe.x ? `translateX(${swipe.x}px)` : undefined,
          transition: swipe.dragging ? "none" : undefined,
        }}
        onClick={() => (swipe.isOpen ? swipe.close() : useApp.getState().openChat(c.id))}
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
          </span>
          <span className="line2">
            <span className="sub">{sub}</span>
            <span className="dot-time">· {listStamp(c.lastMessageAt, lang)}</span>
          </span>
        </span>
        <span className="trail">
          {c.unread > 0 ? (
            <span className={`badge${c.muted ? " muted" : ""}`}>{num(c.unread, lang)}</span>
          ) : read && c.peer && !c.saved ? (
            <Avatar id={c.peer.id} name={title} media={c.peer.avatar} size={16} />
          ) : mine ? (
            <Icon name={read ? "checks" : "check"} size={16} className="tick" />
          ) : null}
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
  const reqId = useRef(0);
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
      {res && !local.length && !people.length && !rooms.length && (
        <Empty icon="search" title={t("list.noResults")} />
      )}
      {room && <RoomPreviewModal room={room} onClose={() => setRoom(null)} />}
    </div>
  );
}
