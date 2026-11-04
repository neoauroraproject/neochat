import { useEffect, useState, type ReactNode } from "react";
import { get } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, ColHead, Empty, SearchField } from "../components/ui";
import { duration, listStamp, presenceText } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { CallEntry } from "../types";
import { SearchResults, useLargeTitle } from "./ChatList";
import { useContacts, useMobile } from "./hooks";
import { MobileHeader, PillSegment, RoundButton } from "./MobileHeader";
import { useNewMenu } from "./NewMenu";

/** A native screen: translucent bar with a title that appears once the large title scrolls away. */
export function LargeTitleScreen({
  title,
  grouped,
  trailing,
  middle,
  actions,
  bare,
  children,
}: {
  title: string;
  grouped?: boolean;
  trailing?: ReactNode;
  /** Phone only: controls between the title and the round actions (a segmented filter). */
  middle?: ReactNode;
  /** Phone only: round header buttons (search, +). */
  actions?: ReactNode;
  /** Phone only: no title bar (the screen draws its own top, like the profile in Settings). */
  bare?: boolean;
  children: ReactNode;
}) {
  const { collapsed, onScroll } = useLargeTitle();
  const t = useT();
  const isMobile = useMobile();
  if (!isMobile) {
    return (
      <div className={`screen${grouped ? " grouped" : ""}`}>
        <ColHead
          title={title}
          onBack={() => useApp.setState({ section: "chats" })}
          backLabel={t("common.back")}
          trailing={trailing}
        />
        <div className="screen-scroll">{children}</div>
      </div>
    );
  }
  return (
    <div className={`screen${grouped ? " grouped" : ""}${collapsed ? " collapsed" : ""}`}>
      {!bare && <MobileHeader title={title} middle={middle} actions={actions ?? trailing} />}
      <div className="screen-scroll" onScroll={onScroll}>
        {children}
      </div>
    </div>
  );
}

export function CallsPane() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const phase = useCall((s) => s.phase);
  const [list, setList] = useState<CallEntry[] | null>(null);
  const [only, setOnly] = useState<"all" | "missed">("all");
  const isMobile = useMobile();
  useEffect(() => {
    if (phase === "idle")
      get<CallEntry[]>("/api/calls")
        .then(setList)
        .catch(() => setList([]));
  }, [phase]);
  return (
    <LargeTitleScreen
      title={t("nav.calls")}
      middle={
        <PillSegment
          value={only}
          onChange={setOnly}
          options={[
            { id: "all", label: t("calls.all") },
            { id: "missed", label: t("calls.missed") },
          ]}
        />
      }
      actions={
        <RoundButton
          icon="plus"
          solid
          label={t("nav.explore")}
          onClick={() => useApp.setState({ section: "explore" })}
        />
      }
    >
      {list === null && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}
      {list?.length === 0 && <Empty icon="phone" title={t("call.noHistory")} />}
      <div className="cells">
        {list
          ?.filter((c) => only === "all" || (c.status !== "ended" && !c.outgoing))
          .map((c) => {
            const missed = c.status !== "ended" && !c.outgoing;
            return (
              <div key={c.id} className="cell-wrap">
                <div
                  className="chat-cell call-cell"
                  role="button"
                  tabIndex={0}
                  onClick={() => useApp.getState().openChat(c.chatId)}
                >
                  <Avatar
                    id={c.peer.id}
                    name={c.peer.displayName}
                    media={c.peer.avatar}
                    size={isMobile ? 52 : 44}
                  />
                  <span className="cell-body">
                    <span className="line1">
                      <span
                        className="title"
                        style={{ color: missed ? "var(--danger)" : undefined }}
                      >
                        {c.peer.displayName}
                      </span>
                      <span className="time">{listStamp(c.startedAt, lang)}</span>
                    </span>
                    <span className="line2">
                      <span className={`sub one call-dir${missed ? " missed" : ""}`}>
                        <Icon
                          name={missed || !c.outgoing ? "arrow-in" : "arrow-out"}
                          size={15}
                          stroke={1.7}
                        />
                        {c.video && <Icon name="video" size={14} stroke={1.7} />}
                        {c.status === "ended"
                          ? `${c.outgoing ? t("call.outgoing") : t("call.incoming")} · ${duration((c.endedAt - c.answeredAt) / 1000, lang)}`
                          : c.status === "rejected"
                            ? t("call.rejected")
                            : c.status === "cancelled"
                              ? t("call.cancelled")
                              : t("call.missed")}
                      </span>
                      <button
                        className="icon-btn call-again"
                        aria-label={c.video ? t("call.video") : t("call.voice")}
                        onClick={(e) => {
                          e.stopPropagation();
                          useCall.getState().start(c.peer, c.video);
                        }}
                      >
                        <Icon name={c.video ? "video" : "phone"} size={21} />
                      </button>
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </LargeTitleScreen>
  );
}

export function ExplorePane() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const contacts = useContacts();
  const isMobile = useMobile();
  const newMenu = useNewMenu();
  const query = q.trim().replace(/^@/, "");
  const showSearch = !isMobile || searching || !!q || contacts.length === 0;
  return (
    <LargeTitleScreen
      title={t(isMobile ? "nav.contacts" : "explore.title")}
      actions={
        <>
          <RoundButton
            icon="search"
            label={t("common.search")}
            active={searching}
            onClick={() => {
              if (searching) setQ("");
              setSearching(!searching);
            }}
          />
          <RoundButton
            icon="plus"
            solid
            label={t("list.newChat")}
            onClick={(e) => newMenu.open(e.currentTarget)}
          />
        </>
      }
    >
      {showSearch && (
        <div className="search-wrap">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder={t("list.search")}
            autoFocus={searching || window.matchMedia("(pointer: fine)").matches}
          />
        </div>
      )}
      {newMenu.element}
      {query.length >= 2 ? (
        <SearchResults query={query.toLowerCase()} />
      ) : (
        <>
          {(!isMobile || contacts.length === 0) && (
            <p className="screen-hint">{t("explore.hint")}</p>
          )}
          {isMobile && contacts.length > 0 && (
            <div className="contact-grid">
              {contacts.map((u) => (
                <button
                  key={u.id}
                  className="contact-card"
                  onClick={() => useApp.getState().openDirect(u.id)}
                >
                  <Avatar id={u.id} name={u.displayName} media={u.avatar} size={64} />
                  <b>{u.displayName}</b>
                  <span className={u.online ? "on" : ""}>
                    {u.online && <i />}
                    {presenceText(u, lang)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!isMobile && contacts.length > 0 && (
            <div className="section-label">{t("list.recent")}</div>
          )}
          {!isMobile && (
            <div className="cells">
              {contacts.map((u) => (
                <div key={u.id} className="cell-wrap">
                  <button className="chat-cell" onClick={() => useApp.getState().openDirect(u.id)}>
                    <Avatar
                      id={u.id}
                      name={u.displayName}
                      media={u.avatar}
                      size={44}
                      online={u.online}
                    />
                    <span className="cell-body">
                      <span className="line1">
                        <span className="title">{u.displayName}</span>
                      </span>
                      <span className="line2">
                        <span className="sub one ltr" style={{ textAlign: "start" }}>
                          @{u.username}
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </LargeTitleScreen>
  );
}
