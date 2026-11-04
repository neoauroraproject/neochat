import { useMemo, useState } from "react";
import { post } from "../api";
import { Icon } from "../components/Icon";
import { Avatar, Modal, SearchField, Toggle } from "../components/ui";
import { chatTitle } from "../format";
import { errorText, useT } from "../i18n";
import { sortedChats, useApp } from "../store";
import type { Chat, Message } from "../types";

/**
 * Forward one or more messages to one or more chats. Files are not stored again on the server:
 * the new messages point at the same file. "Hide sender" drops the "Forwarded from" label.
 */
export function ForwardModal({ messages, onClose }: { messages: Message[]; onClose: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const chats = useApp((s) => s.chats);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [hide, setHide] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const all = sortedChats(chats).filter((c: Chat) => c.type !== "channel" || c.role !== "member");
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((c) => chatTitle(c, lang).toLowerCase().includes(needle)) : all;
  }, [chats, q, lang]);
  const toggle = (id: number) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= 20 ? p : [...p, id],
    );

  const send = async () => {
    setBusy(true);
    try {
      await post("/api/messages/forward", {
        ids: messages.map((m) => m.id),
        to: picked,
        hideSender: hide,
      });
      useApp.getState().toast(t("fwd.sent", { n: picked.length }));
      if (picked.length === 1) useApp.getState().openChat(picked[0]);
      onClose();
    } catch (e) {
      useApp.getState().toast(errorText(lang, e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("fwd.title", { n: messages.length })}
      onClose={onClose}
      footer={
        <>
          <label className="mp-original">
            <Toggle checked={hide} onChange={setHide} label={t("fwd.hideSender")} />
            <span>
              {t("fwd.hideSender")}
              <small>{t(hide ? "fwd.hideOn" : "fwd.hideOff")}</small>
            </span>
          </label>
          <button
            className="btn btn-primary"
            disabled={!picked.length || busy}
            onClick={send}
            style={{ width: "100%" }}
          >
            {busy ? <span className="spinner" /> : <Icon name="share" size={17} />}
            {t("fwd.send", { n: picked.length })}
          </button>
        </>
      }
    >
      <SearchField value={q} onChange={setQ} placeholder={t("common.search")} />
      <div className="fwd-list">
        {list.map((c) => {
          const on = picked.includes(c.id);
          return (
            <button
              key={c.id}
              className={`row person${on ? " picked" : ""}`}
              onClick={() => toggle(c.id)}
            >
              <Avatar
                id={c.saved ? -1 : (c.peer?.id ?? c.id)}
                name={chatTitle(c, lang)}
                media={c.saved ? undefined : (c.peer?.avatar ?? c.avatar)}
                icon={c.saved ? "bookmark" : undefined}
                size={40}
              />
              <div className="grow">
                <div className="title">{chatTitle(c, lang)}</div>
              </div>
              <span className={`mp-check${on ? " on" : ""}`}>
                {on && <Icon name="check" size={14} stroke={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
