import { useEffect, useState } from "react";
import { get, mediaUrl, post, upload } from "../api";
import { Icon } from "../components/Icon";
import { Avatar, Modal, SearchField, pickFile, useDebounced } from "../components/ui";
import { errorText, useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, User } from "../types";
import { useContacts } from "./hooks";

export function NewRoomModal({
  type,
  onClose,
}: {
  type: "group" | "channel";
  onClose: () => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [handle, setHandle] = useState("");
  const [avatar, setAvatar] = useState("");
  const [members, setMembers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const choosePhoto = async () => {
    const f = await pickFile("image/*");
    if (!f) return;
    try {
      setAvatar((await upload(f)).id);
    } catch (e) {
      setError(errorText(lang, e));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const c = await post<Chat>("/api/chats", {
        type,
        title,
        description,
        avatar,
        handle: isPublic ? handle : "",
        members: members.map((m) => m.id),
      });
      useApp.getState().upsertChat(c);
      useApp.getState().openChat(c.id);
      onClose();
    } catch (e) {
      setError(errorText(lang, e));
      setStep(1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={type === "group" ? t("room.newGroup") : t("room.newChannel")}
      onClose={onClose}
      footer={
        step === 1 ? (
          <button
            className="btn btn-primary"
            disabled={!title.trim() || (isPublic && handle.length < 4)}
            onClick={() => setStep(2)}
          >
            {t("common.next")}
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => setStep(1)}>
              {t("common.back")}
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? <span className="spinner" /> : t("common.create")}
            </button>
          </>
        )
      }
    >
      {error && <div className="form-error">{error}</div>}
      {step === 1 ? (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <button
              onClick={choosePhoto}
              aria-label={t("room.changePhoto")}
              style={{ borderRadius: "50%" }}
            >
              {avatar ? (
                <div className="avatar" style={{ width: 72, height: 72 }}>
                  <div className="face">
                    <img src={mediaUrl(avatar, true)} alt="" />
                  </div>
                </div>
              ) : (
                <div className="avatar" style={{ width: 72, height: 72 }}>
                  <div className="face" style={{ background: "var(--glass-thin)" }}>
                    <Icon name="camera" size={28} />
                  </div>
                </div>
              )}
            </button>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor="rt">{t("room.name")}</label>
              <input
                id="rt"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                autoFocus
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rd">
              {t("room.description")}{" "}
              <span style={{ fontWeight: 400 }}>({t("common.optional")})</span>
            </label>
            <textarea
              id="rd"
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>
          <div className="segmented" style={{ marginBottom: 8 }}>
            <button aria-pressed={!isPublic} onClick={() => setPublic(false)}>
              <Icon name="lock" size={15} />
              {t("room.private")}
            </button>
            <button aria-pressed={isPublic} onClick={() => setPublic(true)}>
              <Icon name="globe" size={15} />
              {t("room.public")}
            </button>
          </div>
          <p
            className="hint"
            style={{ fontSize: 13, color: "var(--text-2)", margin: "0 4px 14px" }}
          >
            {isPublic ? t("room.publicHint") : t("room.privateHint")}
          </p>
          {isPublic && (
            <div className="field">
              <label htmlFor="rh">{t("room.handle")}</label>
              <div className="input-prefix">
                <span>@</span>
                <input
                  id="rh"
                  className="input ltr"
                  dir="ltr"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                  maxLength={32}
                  autoCapitalize="none"
                />
              </div>
            </div>
          )}
          <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "4px" }}>
            {t("room.groupType")}
          </p>
        </>
      ) : (
        <MemberPicker selected={members} onChange={setMembers} />
      )}
    </Modal>
  );
}

export function MemberPicker({
  selected,
  onChange,
}: {
  selected: User[];
  onChange: (u: User[]) => void;
}) {
  const t = useT();
  const contacts = useContacts();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim().replace(/^@/, ""), 250);
  const [found, setFound] = useState<User[]>([]);
  useEffect(() => {
    if (debounced.length < 2) return setFound([]);
    get<{ users: User[] }>(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => setFound(r.users))
      .catch(() => {});
  }, [debounced]);
  const me = useApp((s) => s.me);
  const pool = (debounced.length >= 2 ? found : contacts).filter((u) => u.id !== me?.id);
  const isSel = (u: User) => selected.some((s) => s.id === u.id);
  const toggle = (u: User) =>
    onChange(isSel(u) ? selected.filter((s) => s.id !== u.id) : [...selected, u]);
  return (
    <>
      <SearchField value={q} onChange={setQ} placeholder={t("list.search")} autoFocus />
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0 4px" }}>
          {selected.map((u) => (
            <button key={u.id} className="chip accent" onClick={() => toggle(u)}>
              {u.displayName} <Icon name="x" size={12} />
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        {pool.map((u) => (
          <button key={u.id} className="row" onClick={() => toggle(u)}>
            <Avatar id={u.id} name={u.displayName} media={u.avatar} size={42} online={u.online} />
            <div className="grow">
              <div className="title">{u.displayName}</div>
              <div className="sub ltr" style={{ textAlign: "start" }}>
                @{u.username}
              </div>
            </div>
            <span
              className="icon-btn"
              style={{
                background: isSel(u) ? "var(--accent)" : "var(--glass-thin)",
                width: 26,
                height: 26,
              }}
            >
              {isSel(u) && <Icon name="check" size={16} />}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
