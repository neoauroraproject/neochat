import { useEffect, useState } from "react";
import { get } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, Empty, SearchField } from "../components/ui";
import { duration, listStamp } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { CallEntry } from "../types";
import { SearchResults } from "./ChatList";
import { useContacts } from "./hooks";

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
    <div className="list-pane-inner">
      <div className="list-head">
        <div className="top">
          <h1>{t("nav.calls")}</h1>
        </div>
      </div>
      <div className="list-scroll">
        {list === null && (
          <div className="empty">
            <span className="spinner" />
          </div>
        )}
        {list?.length === 0 && <Empty icon="phone" title={t("call.noHistory")} />}
        {list && list.length > 0 && <div className="section-label">{t("call.history")}</div>}
        {list?.map((c) => {
          const missed = c.status !== "ended";
          return (
            <div
              key={c.id}
              className="row"
              role="button"
              tabIndex={0}
              onClick={() => useApp.getState().openChat(c.chatId)}
            >
              <Avatar
                id={c.peer.id}
                name={c.peer.displayName}
                media={c.peer.avatar}
                size={48}
                online={c.peer.online}
              />
              <div className="grow">
                <div
                  className="title"
                  style={{ color: missed && !c.outgoing ? "var(--danger)" : undefined }}
                >
                  {c.peer.displayName}
                </div>
                <div className="sub" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon name={c.outgoing ? "external" : "download"} size={13} />
                  {c.status === "ended"
                    ? `${c.outgoing ? t("call.outgoing") : t("call.incoming")} · ${duration((c.endedAt - c.answeredAt) / 1000, lang)}`
                    : c.status === "rejected"
                      ? t("call.rejected")
                      : c.status === "cancelled"
                        ? t("call.cancelled")
                        : t("call.missed")}
                  {" · "}
                  {listStamp(c.startedAt, lang)}
                </div>
              </div>
              <button
                className="icon-btn filled"
                aria-label={c.video ? t("call.video") : t("call.voice")}
                onClick={(e) => {
                  e.stopPropagation();
                  useCall.getState().start(c.peer, c.video);
                }}
              >
                <Icon name={c.video ? "video" : "phone"} size={19} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExplorePane() {
  const t = useT();
  const [q, setQ] = useState("");
  const contacts = useContacts();
  const query = q.trim().replace(/^@/, "");
  return (
    <div className="list-pane-inner">
      <div className="list-head">
        <div className="top">
          <h1>{t("explore.title")}</h1>
        </div>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder={t("list.search")}
          autoFocus={window.matchMedia("(pointer: fine)").matches}
        />
      </div>
      <div className="list-scroll">
        {query.length >= 2 ? (
          <SearchResults query={query.toLowerCase()} />
        ) : (
          <>
            <p style={{ color: "var(--text-2)", fontSize: 14, padding: "4px 10px" }}>
              {t("explore.hint")}
            </p>
            {contacts.length > 0 && <div className="section-label">{t("list.recent")}</div>}
            {contacts.map((u) => (
              <button key={u.id} className="row" onClick={() => useApp.getState().openDirect(u.id)}>
                <Avatar
                  id={u.id}
                  name={u.displayName}
                  media={u.avatar}
                  size={44}
                  online={u.online}
                />
                <div className="grow">
                  <div className="title">{u.displayName}</div>
                  <div className="sub ltr" style={{ textAlign: "start" }}>
                    @{u.username}
                  </div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
