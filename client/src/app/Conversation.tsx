import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { adHref, adsFor, adTarget, closeChatTopAd, nextChatTopAd, trackImpression } from "../ads";
import { mediaUrl, post } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, Menu, type MenuItem } from "../components/ui";
import { chatTitle, dayLabel, num, presenceText } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { Ad, Chat, Message } from "../types";
import { Composer } from "./Composer";
import { useMobile, useTick } from "./hooks";
import { askDeleteMessage } from "./chatActions";
import { goBack } from "./nav";
import { useStaged } from "./MediaPreview";
import { MediaViewer } from "./MediaViewer";
import { Members } from "./InfoPanel";
import { MessageItem } from "./MessageItem";

const EMPTY: Message[] = [];
const GROUP_GAP = 5 * 60_000;

export function Conversation({
  chat,
  filesHidden,
  onShowFiles,
}: {
  chat: Chat;
  filesHidden?: boolean;
  onShowFiles?: () => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const me = useApp((s) => s.me)!;
  const messages = useApp((s) => s.messages[chat.id]) || EMPTY;
  const hasMore = useApp((s) => s.hasMore[chat.id]);
  const typing = useApp((s) => s.typing[chat.id]);
  const ads = useApp((s) => s.ads);
  const config = useApp((s) => s.config);
  const isMobile = useMobile();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const loadingOlder = useRef(false);
  const prevHeight = useRef(0);
  const prevLen = useRef(0);
  const [showDown, setShowDown] = useState(false);
  const [menu, setMenu] = useState<{ m: Message; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [dragging, setDragging] = useState(false);
  const [unreadAnchor, setUnreadAnchor] = useState(0);
  const [view, setView] = useState<"messages" | "members">("messages");
  // Messages newer than the moment the chat opened get a pop-in animation; history renders still.
  const openedAt = useMemo(() => Date.now(), [chat.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useTick(30_000);

  const title = chatTitle(chat, lang);
  const canPost = chat.type !== "channel" || chat.role !== "member";

  // Remember where unread messages started when the chat was opened.
  useEffect(() => {
    setUnreadAnchor(chat.unread > 0 ? chat.lastReadId : 0);
    setReplyTo(null);
    setEditing(null);
    setView("messages");
    atBottom.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  // Scroll handling: stick to bottom unless the user scrolled up; keep position when older messages prepend.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (loadingOlder.current && prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      loadingOlder.current = false;
      prevHeight.current = 0;
    } else if (atBottom.current) {
      const grew = messages.length - prevLen.current;
      // one to three new messages slide into view like Telegram; first load and big jumps land instantly
      if (prevLen.current > 0 && grew > 0 && grew <= 3)
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else el.scrollTop = el.scrollHeight;
    }
    prevLen.current = messages.length;
  }, [messages]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const sep = el.querySelector(".unread-sep") as HTMLElement | null;
    if (sep) {
      el.scrollTop = sep.offsetTop - 80;
      atBottom.current = false;
    } else el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, messages.length > 0]);

  // Mark as read whenever the newest message is visible.
  useEffect(() => {
    const read = () => {
      if (atBottom.current && document.visibilityState === "visible")
        useApp.getState().markRead(chat.id);
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [chat.id, messages]);

  const onScroll = () => {
    const el = scroller.current!;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = distance < 80;
    setShowDown(distance > 400);
    if (atBottom.current) useApp.getState().markRead(chat.id);
    if (el.scrollTop < 300 && hasMore && !loadingOlder.current && messages.length) {
      loadingOlder.current = true;
      prevHeight.current = el.scrollHeight;
      useApp
        .getState()
        .loadMessages(chat.id, true)
        .catch(() => (loadingOlder.current = false));
    }
  };

  const scrollDown = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const jumpTo = useCallback((id: number) => {
    const el = scroller.current?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const b = el.querySelector(".bubble") as HTMLElement | null;
    b?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }],
      { duration: 400, easing: "ease-out" },
    );
  }, []);

  const onMenu = useCallback((m: Message, x: number, y: number) => {
    if (m.failed) {
      useApp.getState().retry(m);
      return;
    }
    if (m.id < 0) return;
    setMenu({ m, x: x || window.innerWidth / 2, y: y || window.innerHeight / 2 });
  }, []);

  const menuItems = (m: Message): MenuItem[] => {
    const mine = m.senderId === me.id;
    const admin = chat.role !== "member" && chat.type !== "direct";
    return [
      { icon: "reply", label: t("chat.reply"), onClick: () => setReplyTo(m), hidden: !canPost },
      {
        icon: "copy",
        label: t("chat.copy"),
        onClick: () => navigator.clipboard?.writeText(m.text),
        hidden: !m.text || m.kind === "call",
      },
      {
        icon: "download",
        label: t("chat.download"),
        onClick: () => window.open(mediaUrl(m.media!.id), "_blank"),
        hidden: !m.media?.id,
      },
      {
        icon: "edit",
        label: t("common.edit"),
        onClick: () => setEditing(m),
        hidden: !mine || m.kind === "call" || m.kind === "system",
      },
      {
        icon: "trash",
        label: t("common.delete"),
        danger: true,
        onClick: () => askDeleteMessage(m.id),
        hidden: !(mine || admin),
      },
    ];
  };

  // Group consecutive messages, insert day separators, the unread marker and sponsored posts in channels.
  // The server already drops local ads when the admin disables them; network ads always come through.
  const channelAds = useMemo(() => adsFor(ads, "channel"), [ads]);
  const items = useMemo(() => {
    const out: React.ReactNode[] = [];
    let prev: Message | undefined;
    let sinceAd = 0;
    let adIdx = 0;
    messages.forEach((m, i) => {
      const next = messages[i + 1];
      if (!prev || dayLabel(prev.createdAt, lang) !== dayLabel(m.createdAt, lang)) {
        out.push(
          <div key={`d${m.id}`} className="day-sep">
            {dayLabel(m.createdAt, lang)}
          </div>,
        );
      }
      if (
        unreadAnchor &&
        m.id > unreadAnchor &&
        (!prev || prev.id <= unreadAnchor) &&
        m.senderId !== me.id
      ) {
        out.push(
          <div key="unread" className="unread-sep">
            {t("chat.newMessages")}
          </div>,
        );
      }
      const groupStart =
        !prev ||
        prev.senderId !== m.senderId ||
        prev.kind === "system" ||
        m.createdAt - prev.createdAt > GROUP_GAP;
      const groupEnd =
        !next ||
        next.senderId !== m.senderId ||
        next.kind === "system" ||
        next.createdAt - m.createdAt > GROUP_GAP;
      let tail: Message | undefined;
      if (groupStart) {
        let j = i;
        while (
          j + 1 < messages.length &&
          messages[j + 1].senderId === m.senderId &&
          messages[j + 1].kind !== "system" &&
          messages[j + 1].createdAt - messages[j].createdAt <= GROUP_GAP
        )
          j++;
        tail = messages[j];
      }
      out.push(
        <MessageItem
          key={m.clientId || m.id}
          m={m}
          chat={chat}
          tail={tail}
          first={groupStart}
          last={groupEnd}
          fresh={m.createdAt >= openedAt}
          onMenu={onMenu}
          onOpenMedia={setViewer}
          onJumpTo={jumpTo}
          onReply={canPost ? setReplyTo : undefined}
        />,
      );
      prev = m;
      if (chat.type === "channel" && channelAds.length && m.id > 0) {
        sinceAd++;
        if (sinceAd >= (config?.adsChannelEvery || 20) && next) {
          sinceAd = 0;
          const ad = channelAds[adIdx++ % channelAds.length];
          out.push(<SponsoredPost key={`ad${m.id}`} ad={ad} />);
        }
      }
    });
    return out;
  }, [
    messages,
    lang,
    chat,
    unreadAnchor,
    me.id,
    onMenu,
    jumpTo,
    canPost,
    channelAds,
    config?.adsChannelEvery,
    t,
  ]);

  const typers = Object.entries(typing || {}).filter(([, v]) => v.until > Date.now());
  let status: string;
  let statusOn = false;
  if (typers.length) {
    const a = typers[0][1].action;
    status = t(
      a === "recording"
        ? "presence.recording"
        : a === "uploading"
          ? "presence.uploading"
          : "presence.typing",
    );
    statusOn = true;
  } else if (chat.type === "direct") {
    status = chat.saved ? "" : presenceText(chat.peer, lang);
    statusOn = !!chat.peer?.online;
  } else {
    status = t(chat.type === "channel" ? "presence.subscribers" : "presence.members", {
      n: num(chat.memberCount, lang),
    });
  }

  const call = (video: boolean) => chat.peer && useCall.getState().start(chat.peer, video);
  const openInfo = () => useApp.setState((s) => ({ infoOpen: !s.infoOpen }));
  const admin = chat.role === "owner" || chat.role === "admin";
  const hasMembers = chat.type === "group" || (chat.type === "channel" && admin);
  const typerNames = typers.map(([uid]) => {
    const id = Number(uid);
    if (chat.peer?.id === id) return chat.peer.displayName;
    for (let k = messages.length - 1; k >= 0; k--)
      if (messages[k].senderId === id) return messages[k].sender.displayName;
    return "";
  });

  return (
    <section
      className="pane panel conv"
      onDragOver={(e) => {
        if (canPost && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!canPost) return;
        if (e.dataTransfer.files.length) useStaged.getState().add(chat.id, e.dataTransfer.files);
      }}
    >
      {isMobile ? (
        <header className="conv-head">
          <button className="glass-circle" onClick={goBack} aria-label={t("common.back")}>
            <Icon name="back" size={22} className="flip-rtl" />
          </button>
          <button className="who" onClick={openInfo}>
            <Avatar
              id={chat.saved ? -1 : (chat.peer?.id ?? chat.id)}
              name={title}
              media={chat.saved ? undefined : (chat.peer?.avatar ?? chat.avatar)}
              size={42}
              online={chat.type === "direct" && !chat.saved && chat.peer?.online}
              icon={chat.saved ? "bookmark" : undefined}
            />
            <div style={{ minWidth: 0 }}>
              <div className="title">{title}</div>
              {status && <div className={`status${statusOn ? " on" : ""}`}>{status}</div>}
            </div>
          </button>
          {chat.type === "direct" && !chat.saved && config?.callsEnabled && (
            <>
              {config.videoCallsEnabled && (
                <button
                  className="icon-btn hdr-call"
                  onClick={() => call(true)}
                  aria-label={t("call.video")}
                >
                  <Icon name="video" size={22} />
                </button>
              )}
              <button
                className="icon-btn hdr-call"
                onClick={() => call(false)}
                aria-label={t("call.voice")}
              >
                <Icon name="phone" size={21} />
              </button>
            </>
          )}
          <button className="icon-btn" onClick={openInfo} aria-label={t("chat.info")}>
            <Icon name="more-v" size={22} />
          </button>
        </header>
      ) : (
        <header className="conv-head">
          <button className="who" onClick={openInfo}>
            <span className="title">{title}</span>
            {chat.type === "direct" && status && (
              <span className={`status${statusOn ? " on" : ""}`}>{status}</span>
            )}
          </button>
          {hasMembers && (
            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={view === "messages"}
                onClick={() => setView("messages")}
              >
                {t("conv.messages")}
              </button>
              <button
                role="tab"
                aria-selected={view === "members"}
                onClick={() => setView("members")}
              >
                {chat.type === "channel" ? t("room.subscribers") : t("conv.participants")}
              </button>
            </div>
          )}
          {chat.type === "direct" && !chat.saved && config?.callsEnabled && (
            <div className="head-actions">
              {config.videoCallsEnabled && (
                <button className="sq-btn" onClick={() => call(true)} aria-label={t("call.video")}>
                  <Icon name="video" size={18} />
                </button>
              )}
              <button className="sq-btn" onClick={() => call(false)} aria-label={t("call.voice")}>
                <Icon name="phone" size={17} />
              </button>
            </div>
          )}
          {filesHidden && onShowFiles && (
            <button className="sq-btn" onClick={onShowFiles} aria-label={t("conv.showFiles")}>
              <Icon name="folder" size={18} />
            </button>
          )}
        </header>
      )}
      <ChatTopAd chatId={chat.id} />

      {view === "members" && !isMobile && (
        <div className="members-view">
          <Members chat={chat} bare />
        </div>
      )}
      <div
        className="messages"
        ref={scroller}
        onScroll={onScroll}
        hidden={view === "members" && !isMobile}
      >
        <div className="spacer" />
        {hasMore && messages.length > 0 && (
          <div className="sys-msg" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            {t("chat.loadingOlder")}
          </div>
        )}
        {messages.length === 0 && (
          <div className="empty" style={{ margin: "auto" }}>
            <div className="empty-icon">
              <Icon name="chat" size={30} />
            </div>
            <h3>{t("chat.empty")}</h3>
            <p>{t("chat.emptyHint")}</p>
          </div>
        )}
        {items}
      </div>

      {showDown && (
        <button
          className="scroll-down glass-float"
          onClick={scrollDown}
          aria-label={t("chat.scrollDown")}
        >
          <Icon name="down" size={20} />
          {chat.unread > 0 && <span className="badge">{num(chat.unread, lang)}</span>}
        </button>
      )}

      {typers.length > 0 && view === "messages" && (
        <div className="typing-row" aria-live="polite">
          <span className="typing-dots">
            <i />
            <i />
            <i />
          </span>
          <span>
            {typerNames[0] ? t("conv.isTyping", { name: typerNames[0].split(" ")[0] }) : status}
          </span>
        </div>
      )}

      {view === "members" && !isMobile ? null : canPost ? (
        <Composer
          chat={chat}
          replyTo={replyTo}
          editing={editing}
          onCancel={() => (setReplyTo(null), setEditing(null))}
          onSent={() => (atBottom.current = true)}
        />
      ) : chat.role ? (
        <div className="readonly-bar">
          <button
            className="btn btn-sm"
            onClick={() => useApp.getState().setPrefs(chat.id, { muted: !chat.muted })}
          >
            <Icon name={chat.muted ? "bell" : "bell-off"} size={16} />
            {chat.muted ? t("list.unmute") : t("list.mute")}
          </button>
        </div>
      ) : (
        <div className="readonly-bar">
          <button
            className="btn btn-primary"
            onClick={() =>
              post(`/api/chats/${chat.id}/join`).then(() => useApp.getState().refreshChat(chat.id))
            }
          >
            {t("chat.join")}
          </button>
        </div>
      )}

      {dragging && (
        <div
          className="overlay"
          style={{ position: "absolute", borderRadius: "inherit", pointerEvents: "none" }}
        >
          <div className="empty">
            <div className="empty-icon">
              <Icon name="attach" size={30} />
            </div>
            <h3>{t("chat.attach")}</h3>
          </div>
        </div>
      )}
      {menu && (
        <Menu x={menu.x} y={menu.y} items={menuItems(menu.m)} onClose={() => setMenu(null)} />
      )}
      {viewer && <MediaViewer message={viewer} onClose={() => setViewer(null)} />}
    </section>
  );
}

/** Slim, closable banner under the chat header — appears now and then, like Telegram's sponsored bar. */
function ChatTopAd({ chatId }: { chatId: number }) {
  const t = useT();
  const [ad, setAd] = useState<Ad | null>(null);
  useEffect(() => {
    // Wait a moment after opening the chat so it never competes with the first read.
    const id = setTimeout(() => setAd(nextChatTopAd(useApp.getState().ads)), 2500);
    return () => clearTimeout(id);
  }, [chatId]);
  useEffect(() => {
    if (ad) trackImpression(ad);
  }, [ad]);
  if (!ad) return null;
  const close = () => {
    closeChatTopAd();
    setAd(null);
  };
  return (
    <div className="chat-top-ad" role="complementary">
      <a
        href={adHref(ad)}
        target={adTarget(ad)}
        rel="noopener noreferrer"
        onClick={() => setAd(null)}
      >
        <span className="tag">{ad.badge || t("chat.sponsored")}</span>
        <span className="t">{ad.title}</span>
        {ad.body && <span className="b">{ad.body}</span>}
      </a>
      {ad.link && ad.cta && (
        <a
          className="btn btn-sm btn-primary"
          href={adHref(ad)}
          target={adTarget(ad)}
          rel="noopener noreferrer"
          onClick={() => setAd(null)}
        >
          {ad.cta}
        </a>
      )}
      <button className="icon-btn" onClick={close} aria-label={t("common.close")}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

function SponsoredPost({ ad }: { ad: Ad }) {
  const t = useT();
  useEffect(() => trackImpression(ad), [ad]);
  return (
    <div className="sponsored">
      {ad.image && <img src={mediaUrl(ad.image)} alt="" loading="lazy" />}
      <div className="c">
        <div className="tag">{ad.badge || t("chat.sponsored")}</div>
        <div className="t">{ad.title}</div>
        {ad.body && <div className="b">{ad.body}</div>}
        {ad.link && (
          <a
            className="btn btn-primary"
            href={adHref(ad)}
            target={adTarget(ad)}
            rel="noopener noreferrer"
          >
            {ad.cta || t("explore.open")}
            <Icon name="external" size={16} />
          </a>
        )}
      </div>
    </div>
  );
}
