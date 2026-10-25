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

export function ChatList() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const chats = useApp((s) => s.chats);
  const filter = useApp((s) => s.filter);
  const loaded = useApp((s) => s.chatsLoaded);
  const config = useApp((s) => s.config);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const newMenu = useNewMenu();
  const sidebarVisible = useMedia("(min-width: 1281px)");
  const isMobile = useMobile();
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

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("nav.all") },
    { id: "unread", label: t("nav.unread") },
    { id: "direct", label: t("nav.direct") },
    { id: "groups", label: t("nav.groups") },
    { id: "channels", label: t("nav.channels") },
    { id: "archive", label: t("nav.archive") },
  ];
  const archivedCount = Object.values(chats).filter((c) => c.archived).length;

  return (
    <div className="list-pane-inner">
      <div className="list-head">
        <div className="top">
          <h1 className={isMobile ? "m-title" : ""}>
            {filter === "archive"
              ? t("nav.archive")
              : isMobile
                ? t("nav.chats")
                : config?.appName || t("nav.chats")}
          </h1>
          {isMobile ? (
            <button
              className="icon-btn"
              onClick={() => (setSearchOpen(!searchOpen), setQ(""))}
              aria-label={t("common.search")}
            >
              <Icon name={searchOpen ? "x" : "search"} size={22} />
            </button>
          ) : (
            <button
              className="icon-btn filled"
              onClick={(e) => newMenu.open(e.currentTarget)}
              aria-label={t("list.newChat")}
            >
              <Icon name="edit" size={18} />
            </button>
          )}
        </div>
        {(!isMobile || searchOpen) && (
          <SearchField
            value={q}
            onChange={setQ}
            placeholder={t("list.search")}
            autoFocus={isMobile}
          />
        )}
        {!query && (!sidebarVisible || filter === "archive") && (
          <div className="segmented" role="tablist">
            {filters
              .filter((f) => f.id !== "archive" || archivedCount > 0 || filter === "archive")
              .map((f) => (
                <button
                  key={f.id}
                  aria-pressed={filter === f.id}
                  onClick={() => useApp.setState({ filter: f.id })}
                >
                  {f.label}
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="list-scroll">
        {query ? (
          <SearchResults query={query} local={local} />
        ) : (
          <>
            {filter === "all" && (isMobile ? <StoryCards /> : <OnlineStrip />)}
            {filter === "all" && <AdBanner />}
            {list.map((c) => (
              <ChatRow key={c.id} chat={c} />
            ))}
            {loaded && list.length === 0 && (
              <Empty icon="chat" title={t("list.empty")} text={t("list.emptyHint")}>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                  onClick={() => useApp.setState({ section: "explore" })}
                >
                  <Icon name="search" size={18} />
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

function OnlineStrip() {
  const t = useT();
  const contacts = useContacts();
  const me = useApp((s) => s.me);
  const shown = contacts.filter((u) => u.id !== me?.id).slice(0, 20);
  if (shown.length === 0) return null;
  return (
    <>
      <div className="section-label">{t("list.recent")}</div>
      <div className="stories">
        {shown.map((u) => (
          <button
            key={u.id}
            className={`story${u.online ? " online" : ""}`}
            onClick={() => useApp.getState().openDirect(u.id)}
            title={"@" + u.username}
          >
            <Avatar id={u.id} name={u.displayName} media={u.avatar} size={52} online={u.online} />
            <span>{u.displayName.split(" ")[0]}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Mobile "stories" row from the design: rounded photo cards with a small avatar, used for people online. */
function StoryCards() {
  const t = useT();
  const contacts = useContacts();
  const me = useApp((s) => s.me);
  const shown = contacts.filter((u) => u.id !== me?.id).slice(0, 20);
  return (
    <>
      <div className="m-section">
        <span>{t("list.stories")}</span>
        <button onClick={() => useApp.setState({ section: "explore" })}>
          <Icon name="users" size={15} />
          {t("list.allPeople")}
        </button>
      </div>
      <div className="story-cards">
        <button className="story-card add" onClick={() => useApp.setState({ section: "explore" })}>
          <span className="tile">
            <Icon name="plus" size={20} />
            <small>{t("list.newChat")}</small>
          </span>
        </button>
        {shown.map((u) => (
          <button
            key={u.id}
            className={`story-card${u.online ? " online" : ""}`}
            onClick={() => useApp.getState().openDirect(u.id)}
            title={"@" + u.username}
          >
            <span className="tile">
              <Avatar id={u.id} name={u.displayName} media={u.avatar} size={64} squircle />
            </span>
            <span className="mini">
              <Avatar id={u.id} name={u.displayName} media={u.avatar} size={26} />
            </span>
            <span className="name">{u.displayName}</span>
          </button>
        ))}
      </div>
    </>
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
    <div className="ad-card">
      <a className="ad-link" href={adHref(ad)} target={adTarget(ad)} rel="noopener noreferrer">
        {ad.image && <img src={mediaUrl(ad.image, true)} alt="" />}
        <div className="grow">
          <div className="t">{ad.title}</div>
          {ad.body && <div className="b">{ad.body}</div>}
        </div>
      </a>
      <span className="tag">{ad.badge || t("chat.sponsored")}</span>
      <button
        className="icon-btn x"
        aria-label={t("common.close")}
        onClick={() => {
          dismissedAds.add(ad.id);
          force((n) => n + 1);
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function ChatRow({ chat: c, compact }: { chat: Chat; compact?: boolean }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me);
  const active = useApp((s) => s.activeChatId === c.id);
  const typing = useApp((s) => s.typing[c.id]);
  const draft = useApp((s) => s.drafts[c.id]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const press = usePress((x, y) => setMenu({ x, y }));
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

  const items: MenuItem[] = [
    {
      icon: "pin",
      label: c.pinned ? t("list.unpin") : t("list.pin"),
      onClick: () => useApp.getState().setPrefs(c.id, { pinned: !c.pinned }),
    },
    {
      icon: c.muted ? "bell" : "bell-off",
      label: c.muted ? t("list.unmute") : t("list.mute"),
      onClick: () => useApp.getState().setPrefs(c.id, { muted: !c.muted }),
    },
    {
      icon: "archive",
      label: c.archived ? t("list.unarchive") : t("list.archive"),
      onClick: () => useApp.getState().setPrefs(c.id, { archived: !c.archived }),
    },
  ];

  return (
    <>
      <button
        className={`row chat-row${c.unread > 0 && !c.muted ? " has-unread" : ""}`}
        aria-current={active}
        onClick={() => useApp.getState().openChat(c.id)}
        {...press}
      >
        <Avatar
          id={c.saved ? -1 : (c.peer?.id ?? c.id)}
          name={title}
          media={c.saved ? undefined : (c.peer?.avatar ?? c.avatar)}
          size={compact ? 40 : 52}
          online={c.type === "direct" && !c.saved && c.peer?.online}
          icon={c.saved ? "bookmark" : undefined}
        />
        <div className="grow">
          <div className="line1">
            {c.type === "group" && <Icon name="group" size={15} />}
            {c.type === "channel" && <Icon name="megaphone" size={15} />}
            <span className="title">{title}</span>
            {c.muted && <Icon name="bell-off" size={13} />}
          </div>
          <div className="sub">{sub}</div>
        </div>
        <div className="meta">
          <span className="time">
            {mine && lm && (
              <Icon
                name={c.othersReadId >= lm.id ? "checks" : "check"}
                size={15}
                className={c.othersReadId >= lm.id ? "read" : ""}
              />
            )}
            {listStamp(c.lastMessageAt, lang)}
          </span>
          {c.unread > 0 ? (
            <span className={`badge${c.muted ? " muted" : ""}`}>{num(c.unread, lang)}</span>
          ) : c.pinned ? (
            <Icon name="pin" size={14} />
          ) : (
            <span style={{ height: 22 }} />
          )}
        </div>
      </button>
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </>
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
    <>
      {local.length > 0 && <div className="section-label">{t("list.myChats")}</div>}
      {local.map((c) => (
        <ChatRow key={c.id} chat={c} compact />
      ))}
      {people.length > 0 && <div className="section-label">{t("list.people")}</div>}
      {people.map((u) => (
        <button key={u.id} className="row" onClick={() => useApp.getState().openDirect(u.id)}>
          <Avatar id={u.id} name={u.displayName} media={u.avatar} size={44} online={u.online} />
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
        <button key={r.id} className="row" onClick={() => setRoom(r)}>
          <Avatar id={r.id} name={r.title} media={r.avatar} size={44} />
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
    </>
  );
}
