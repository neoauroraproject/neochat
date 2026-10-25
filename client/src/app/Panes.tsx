import { useEffect, useState, type ReactNode } from "react";
import { get } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, Empty, SearchField } from "../components/ui";
import { duration, listStamp } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { CallEntry } from "../types";
import { SearchResults, useLargeTitle } from "./ChatList";
import { useContacts } from "./hooks";

/** A native screen: translucent bar with a title that appears once the large title scrolls away. */
export function LargeTitleScreen({
  title,
  grouped,
  trailing,
  children,
}: {
  title: string;
  grouped?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const { collapsed, onScroll } = useLargeTitle();
  return (
    <div className={`screen${grouped ? " grouped" : ""}${collapsed ? " collapsed" : ""}`}>
      <header className="navbar">
        <div className="nav-side" />
        <div className="nav-title">{title}</div>
        <div className="nav-side end">{trailing}</div>
      </header>
      <div className="screen-scroll" onScroll={onScroll}>
        <h1 className="large-title">{title}</h1>
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
  useEffect(() => {
    if (phase === "idle")
      get<CallEntry[]>("/api/calls")
        .then(setList)
        .catch(() => setList([]));
  }, [phase]);
  return (
    <LargeTitleScreen title={t("nav.calls")}>
      {list === null && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}
      {list?.length === 0 && <Empty icon="phone" title={t("call.noHistory")} />}
      <div className="cells">
        {list?.map((c) => {
          const missed = c.status !== "ended" && !c.outgoing;
          return (
            <div key={c.id} className="cell-wrap">
              <div
                className="chat-cell call-cell"
                role="button"
                tabIndex={0}
                onClick={() => useApp.getState().openChat(c.chatId)}
              >
                <Avatar id={c.peer.id} name={c.peer.displayName} media={c.peer.avatar} size={44} />
                <span className="cell-body">
                  <span className="line1">
                    <span className="title" style={{ color: missed ? "var(--danger)" : undefined }}>
                      {c.peer.displayName}
                    </span>
                    <span className="time">{listStamp(c.startedAt, lang)}</span>
                  </span>
                  <span className="line2">
                    <span className="sub one">
                      <Icon name={c.video ? "video" : "phone"} size={13} />{" "}
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
  const [q, setQ] = useState("");
  const contacts = useContacts();
  const query = q.trim().replace(/^@/, "");
  return (
    <LargeTitleScreen title={t("explore.title")}>
      <div className="search-wrap">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder={t("list.search")}
          autoFocus={window.matchMedia("(pointer: fine)").matches}
        />
      </div>
      {query.length >= 2 ? (
        <SearchResults query={query.toLowerCase()} />
      ) : (
        <>
          <p className="screen-hint">{t("explore.hint")}</p>
          {contacts.length > 0 && <div className="section-label">{t("list.recent")}</div>}
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
        </>
      )}
    </LargeTitleScreen>
  );
}
