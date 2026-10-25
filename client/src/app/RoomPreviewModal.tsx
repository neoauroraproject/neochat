import { useState } from "react";
import { post } from "../api";
import { Avatar, Modal } from "../components/ui";
import { num } from "../format";
import { errorText, useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, RoomPreview } from "../types";

/** Preview of a public room (by handle) or a private one (by invite code) before joining. */
export function RoomPreviewModal({
  room,
  invite,
  onClose,
}: {
  room: RoomPreview;
  invite?: string;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    if (room.isMember) {
      useApp.getState().openChat(room.id);
      return onClose();
    }
    setBusy(true);
    try {
      const c = await post<Chat>(invite ? `/api/invite/${invite}` : `/api/chats/${room.id}/join`);
      useApp.getState().upsertChat(c);
      useApp.getState().openChat(c.id);
      onClose();
    } catch (e) {
      setError(errorText(lang, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={invite ? t("room.joinTitle") : ""}
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-block" disabled={busy} onClick={open}>
          {busy ? (
            <span className="spinner" />
          ) : room.isMember ? (
            t("explore.open")
          ) : (
            t("explore.join")
          )}
        </button>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="info-hero">
        <Avatar id={room.id} name={room.title} media={room.avatar} size={96} />
        <h3>{room.title}</h3>
        {room.handle && (
          <div className="s ltr" style={{ textAlign: "center" }}>
            @{room.handle}
          </div>
        )}
        <div className="s">
          {t(room.type === "channel" ? "presence.subscribers" : "presence.members", {
            n: num(room.memberCount, lang),
          })}
        </div>
        {room.description && (
          <p style={{ whiteSpace: "pre-wrap", margin: "10px 0 0", color: "var(--text-2)" }}>
            {room.description}
          </p>
        )}
      </div>
    </Modal>
  );
}
