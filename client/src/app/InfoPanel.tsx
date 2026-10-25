import { useEffect, useState } from "react";
import { del, get, mediaUrl, patch, post, upload } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Avatar, Menu, Modal, pickFile, type MenuItem } from "../components/ui";
import { chatTitle, num, presenceText } from "../format";
import { errorText, useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, Member, Message, User } from "../types";
import { useMobile } from "./hooks";
import { MediaViewer } from "./MediaViewer";
import { MemberPicker } from "./NewRoomModal";

export function InfoPanel({ chat }: { chat: Chat }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const config = useApp((s) => s.config);
  const messages = useApp((s) => s.messages[chat.id]);
  const isMobile = useMobile();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [memberMenu, setMemberMenu] = useState<{ m: Member; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [viewer, setViewer] = useState<Message | null>(null);
  const admin = chat.role === "owner" || chat.role === "admin";
  const isRoom = chat.type !== "direct";
  const title = chatTitle(chat, lang);
  const close = () => useApp.setState({ infoOpen: false });

  const loadMembers = () => {
    if (isRoom && (chat.type === "group" || admin))
      get<Member[]>(`/api/chats/${chat.id}/members`)
        .then(setMembers)
        .catch(() => setMembers(null));
  };
  useEffect(loadMembers, [chat.id, chat.memberCount, admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const media = (messages || [])
    .filter((m) => m.kind === "image" && m.media?.id)
    .slice(-30)
    .reverse();
  const inviteLink = chat.inviteCode ? `${location.origin}/join/${chat.inviteCode}` : "";
  const publicLink = chat.handle ? `${location.origin}/@${chat.handle}` : "";

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s);
    useApp.getState().toast(t("common.copied"));
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      useApp.getState().toast(errorText(lang, e), "error");
    }
  };

  const leave = () =>
    confirm(t("common.confirm")) &&
    act(async () => {
      await post(`/api/chats/${chat.id}/leave`);
      useApp.getState().removeChat(chat.id);
      close();
    });

  const remove = () =>
    confirm(t("common.confirm")) &&
    act(async () => {
      await del(`/api/chats/${chat.id}`);
      useApp.getState().removeChat(chat.id);
      close();
    });

  const memberItems = (m: Member): MenuItem[] => [
    {
      icon: "chat",
      label: t("explore.message"),
      onClick: () => useApp.getState().openDirect(m.user.id),
    },
    {
      icon: "shield",
      label: m.role === "admin" ? t("room.removeAdmin") : t("room.makeAdmin"),
      onClick: () =>
        act(() =>
          patch(`/api/chats/${chat.id}/members/${m.user.id}`, {
            role: m.role === "admin" ? "member" : "admin",
          }).then(loadMembers),
        ),
      hidden: chat.role !== "owner" || m.role === "owner",
    },
    {
      icon: "trash",
      label: t("room.remove"),
      danger: true,
      onClick: () => act(() => del(`/api/chats/${chat.id}/members/${m.user.id}`).then(loadMembers)),
      hidden: !admin || m.role === "owner" || (m.role === "admin" && chat.role !== "owner"),
    },
  ];

  return (
    <aside className="pane panel info-pane">
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 10px 0" }}>
        <button className="icon-btn" onClick={close} aria-label={t("common.close")}>
          <Icon name={isMobile ? "back" : "x"} size={20} className={isMobile ? "flip-rtl" : ""} />
        </button>
        {isRoom && admin && (
          <button
            className="icon-btn"
            onClick={() => setEditing(true)}
            aria-label={t("room.editInfo")}
          >
            <Icon name="edit" size={19} />
          </button>
        )}
      </div>
      <div className="info-hero">
        <Avatar
          id={chat.saved ? -1 : (chat.peer?.id ?? chat.id)}
          name={title}
          media={chat.saved ? undefined : (chat.peer?.avatar ?? chat.avatar)}
          size={104}
          icon={chat.saved ? "bookmark" : undefined}
        />
        <h3>{title}</h3>
        <div className="s">
          {chat.type === "direct"
            ? chat.saved
              ? ""
              : presenceText(chat.peer, lang)
            : t(chat.type === "channel" ? "presence.subscribers" : "presence.members", {
                n: num(chat.memberCount, lang),
              })}
        </div>
      </div>
      <div className="info-actions">
        {chat.type === "direct" && !chat.saved && config?.callsEnabled && (
          <>
            <button onClick={() => chat.peer && useCall.getState().start(chat.peer, false)}>
              <Icon name="phone" size={20} />
              {t("call.voice")}
            </button>
            {config.videoCallsEnabled && (
              <button onClick={() => chat.peer && useCall.getState().start(chat.peer, true)}>
                <Icon name="video" size={20} />
                {t("call.video")}
              </button>
            )}
          </>
        )}
        <button onClick={() => useApp.getState().setPrefs(chat.id, { muted: !chat.muted })}>
          <Icon name={chat.muted ? "bell" : "bell-off"} size={20} />
          {chat.muted ? t("list.unmute") : t("list.mute")}
        </button>
        {isRoom && (
          <button onClick={leave}>
            <Icon name="logout" size={20} />
            {t("room.leave")}
          </button>
        )}
      </div>

      <div className="info-body">
        {(chat.peer?.bio || chat.description || chat.peer?.username || publicLink || inviteLink) &&
          !chat.saved && (
            <div className="card-group">
              {chat.type === "direct" && chat.peer && (
                <button className="item" onClick={() => copy("@" + chat.peer!.username)}>
                  <div className="grow">
                    <div className="ltr" style={{ textAlign: "start" }}>
                      @{chat.peer.username}
                    </div>
                    <div className="muted">{t("auth.username")}</div>
                  </div>
                  <Icon name="copy" size={16} />
                </button>
              )}
              {(chat.peer?.bio || chat.description) && (
                <div className="item">
                  <div className="grow">
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {chat.peer?.bio || chat.description}
                    </div>
                    <div className="muted">
                      {chat.type === "direct" ? t("settings.bio") : t("room.description")}
                    </div>
                  </div>
                </div>
              )}
              {publicLink && (
                <button className="item" onClick={() => copy(publicLink)}>
                  <Icon name="link" size={18} />
                  <div className="grow">
                    <div
                      className="ltr"
                      style={{ textAlign: "start", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      @{chat.handle}
                    </div>
                    <div className="muted">{t("room.handle")}</div>
                  </div>
                  <Icon name="copy" size={16} />
                </button>
              )}
              {inviteLink && (
                <div className="item">
                  <Icon name="lock" size={18} />
                  <button
                    className="grow"
                    style={{ textAlign: "start", minWidth: 0 }}
                    onClick={() => copy(inviteLink)}
                  >
                    <div
                      className="ltr"
                      style={{
                        textAlign: "start",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 13,
                      }}
                    >
                      {inviteLink}
                    </div>
                    <div className="muted">{t("room.inviteLink")}</div>
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      act(() =>
                        patch<Chat>(`/api/chats/${chat.id}`, { resetInvite: true }).then((c) =>
                          useApp.getState().upsertChat(c),
                        ),
                      )
                    }
                  >
                    {t("room.resetLink")}
                  </button>
                </div>
              )}
            </div>
          )}

        {media.length > 0 && (
          <>
            <div className="section-label">{t("room.mediaShared")}</div>
            <div className="media-grid" style={{ marginBottom: 18 }}>
              {media.map((m) => (
                <button key={m.id} onClick={() => setViewer(m)}>
                  <img src={mediaUrl(m.media!.id, !!m.media!.hasThumb)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}

        {members && (
          <>
            <div className="section-label" style={{ display: "flex", alignItems: "center" }}>
              <span style={{ flex: 1 }}>
                {chat.type === "channel" ? t("room.subscribers") : t("room.members")} ·{" "}
                {num(members.length, lang)}
              </span>
            </div>
            <div className="card-group" style={{ padding: 4 }}>
              {(chat.type === "group" || admin) && (
                <button
                  className="row"
                  onClick={() => setAdding(true)}
                  style={{ color: "var(--accent)" }}
                >
                  <span className="icon-btn filled" style={{ width: 40, height: 40 }}>
                    <Icon name="user-plus" size={19} />
                  </span>
                  <span className="title">{t("room.addMember")}</span>
                </button>
              )}
              {members.map((m) => (
                <button
                  key={m.user.id}
                  className="row"
                  onClick={(e) => setMemberMenu({ m, x: e.clientX, y: e.clientY })}
                >
                  <Avatar
                    id={m.user.id}
                    name={m.user.displayName}
                    media={m.user.avatar}
                    size={40}
                    online={m.user.online}
                  />
                  <div className="grow">
                    <div className="title">{m.user.displayName}</div>
                    <div className="sub">{presenceText(m.user, lang)}</div>
                  </div>
                  {m.role !== "member" && (
                    <span className="chip">
                      {m.role === "owner" ? t("room.owner") : t("room.admin")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="card-group">
          {chat.type === "direct" && (
            <button className="item" style={{ color: "var(--danger)" }} onClick={remove}>
              <Icon name="trash" size={18} />
              {t("list.deleteChat")}
            </button>
          )}
          {isRoom && chat.role === "owner" && (
            <button className="item" style={{ color: "var(--danger)" }} onClick={remove}>
              <Icon name="trash" size={18} />
              {t("room.delete")}
            </button>
          )}
          {isRoom && (
            <button className="item" style={{ color: "var(--danger)" }} onClick={leave}>
              <Icon name="logout" size={18} />
              {t("room.leave")}
            </button>
          )}
        </div>
      </div>

      {memberMenu && (
        <Menu
          x={memberMenu.x}
          y={memberMenu.y}
          items={memberItems(memberMenu.m)}
          onClose={() => setMemberMenu(null)}
        />
      )}
      {adding && <AddMembersModal chat={chat} onClose={() => (setAdding(false), loadMembers())} />}
      {editing && <EditRoomModal chat={chat} onClose={() => setEditing(false)} />}
      {viewer && <MediaViewer message={viewer} onClose={() => setViewer(null)} />}
    </aside>
  );
}

function AddMembersModal({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [sel, setSel] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    for (const u of sel) {
      try {
        await post(`/api/chats/${chat.id}/members`, { userId: u.id });
      } catch (e) {
        useApp.getState().toast(`${u.displayName}: ${errorText(lang, e)}`, "error");
      }
    }
    setBusy(false);
    onClose();
  };
  return (
    <Modal
      title={t("room.addMembers")}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" disabled={!sel.length || busy} onClick={submit}>
          {t("room.addMembers")}
        </button>
      }
    >
      <MemberPicker selected={sel} onChange={setSel} />
    </Modal>
  );
}

function EditRoomModal({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [title, setTitle] = useState(chat.title);
  const [description, setDescription] = useState(chat.description);
  const [handle, setHandle] = useState(chat.handle);
  const [avatar, setAvatar] = useState(chat.avatar);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      const c = await patch<Chat>(`/api/chats/${chat.id}`, { title, description, handle, avatar });
      useApp.getState().upsertChat(c);
      onClose();
    } catch (e) {
      setError(errorText(lang, e));
    }
  };
  const photo = async () => {
    const f = await pickFile("image/*");
    if (f) setAvatar((await upload(f)).id);
  };
  return (
    <Modal
      title={t("room.editInfo")}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={save}>
          {t("common.save")}
        </button>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <button onClick={photo} style={{ position: "relative" }}>
          <Avatar id={chat.id} name={title} media={avatar} size={88} />
          <span
            className="icon-btn accent"
            style={{ position: "absolute", bottom: 0, insetInlineEnd: 0, width: 30, height: 30 }}
          >
            <Icon name="camera" size={16} />
          </span>
        </button>
      </div>
      <div className="field">
        <label>{t("room.name")}</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />
      </div>
      <div className="field">
        <label>{t("room.description")}</label>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </div>
      <div className="field">
        <label>
          {t("room.handle")} ({t("common.optional")})
        </label>
        <div className="input-prefix">
          <span>@</span>
          <input
            className="input ltr"
            dir="ltr"
            value={handle}
            onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            maxLength={32}
          />
        </div>
        <span className="hint">{handle ? t("room.publicHint") : t("room.privateHint")}</span>
      </div>
    </Modal>
  );
}
