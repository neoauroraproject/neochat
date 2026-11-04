import { useEffect, useState } from "react";
import { get, mediaUrl } from "../api";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { Menu, type MenuItem } from "../components/ui";
import { fileSize, initials, listStamp } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, Message } from "../types";
import { MediaViewer } from "./MediaViewer";

// Same hues as the avatar tiles, so a profile without a photo still feels like that person.
const hues = [168, 232, 44, 186, 8, 268, 140, 206];

/**
 * The phone's profile header: the photo fills the top of the screen with a soft fade, the name
 * and presence sit on it, and four round actions (call, video, mute, more) follow.
 */
export function ProfileHero({
  chat,
  title,
  status,
  online,
  onBack,
  onEdit,
  more,
}: {
  chat: Chat;
  title: string;
  status: string;
  online?: boolean;
  onBack: () => void;
  onEdit?: () => void;
  more: MenuItem[];
}) {
  const t = useT();
  const config = useApp((s) => s.config);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const photo = chat.saved ? "" : (chat.peer?.avatar ?? chat.avatar);
  const id = chat.saved ? -1 : (chat.peer?.id ?? chat.id);
  const hue = hues[Math.abs(id) % hues.length];
  const canCall = chat.type === "direct" && !chat.saved && !!config?.callsEnabled && !!chat.peer;
  const act = (
    icon: string,
    label: string,
    onClick: (e: React.MouseEvent) => void,
    off = false,
  ) => (
    <button className="pf-act" onClick={onClick} disabled={off}>
      <span>
        <Icon name={icon} size={21} stroke={1.7} />
      </span>
      {label}
    </button>
  );
  return (
    <div className={`pf-hero${photo ? " has-photo" : ""}`} style={{ ["--pf-h" as string]: hue }}>
      {photo ? (
        <img className="pf-photo" src={mediaUrl(photo)} alt="" />
      ) : (
        <div className="pf-initials" aria-hidden="true">
          {chat.saved ? <Icon name="bookmark" size={72} stroke={1.4} /> : initials(title)}
        </div>
      )}
      <div className="pf-shade" />
      <div className="pf-top">
        <button className="pf-glass" onClick={onBack} aria-label={t("common.back")}>
          <Icon name="back" size={20} className="flip-rtl" stroke={1.8} />
        </button>
        {onEdit && (
          <button className="pf-glass pill" onClick={onEdit}>
            {t("common.edit")}
          </button>
        )}
      </div>
      <div className="pf-bottom">
        <h2>{title}</h2>
        {status && (
          <div className={`pf-status${online ? " on" : ""}`}>
            {online && <i />}
            {status}
          </div>
        )}
        <div className="pf-actions">
          {canCall &&
            act("phone", t("profile.call"), () => useCall.getState().start(chat.peer!, false))}
          {canCall &&
            config?.videoCallsEnabled &&
            act("video", t("profile.video"), () => useCall.getState().start(chat.peer!, true))}
          {act(
            chat.muted ? "bell" : "bell-off",
            t(chat.muted ? "list.unmute" : "profile.mute"),
            () => useApp.getState().setPrefs(chat.id, { muted: !chat.muted }),
          )}
          {act("more", t("profile.more"), (e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 6 });
          })}
        </div>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={more} onClose={() => setMenu(null)} />}
    </div>
  );
}

type Tab = "media" | "files" | "links";

/** Media / Files / Links of the chat, from the server's shared index (the whole history). */
export function ProfileMedia({ chat }: { chat: Chat }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [tab, setTab] = useState<Tab>("media");
  const [items, setItems] = useState<Message[] | null>(null);
  const [links, setLinks] = useState<{ messageId: number; url: string; createdAt: number }[]>([]);
  const [viewer, setViewer] = useState<Message | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    const load = async () => {
      try {
        if (tab === "links") {
          const r = await get<{ links: typeof links }>(`/api/chats/${chat.id}/shared?type=links`);
          if (live) {
            setLinks(r.links || []);
            setItems([]);
          }
          return;
        }
        const kinds = tab === "media" ? ["photos", "movies"] : ["documents", "other"];
        const parts = await Promise.all(
          kinds.map((k) =>
            get<{ items?: Message[] }>(`/api/chats/${chat.id}/shared?type=${k}`).then(
              (r) => r.items || [],
            ),
          ),
        );
        if (live) setItems(parts.flat().sort((a, b) => b.id - a.id));
      } catch {
        if (live) setItems([]);
      }
    };
    load();
    return () => {
      live = false;
    };
  }, [chat.id, tab]);

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "media", icon: "image", label: t("profile.media") },
    { id: "files", icon: "file", label: t("profile.files") },
    { id: "links", icon: "link", label: t("profile.links") },
  ];
  const empty = items !== null && (tab === "links" ? links.length === 0 : items.length === 0);

  return (
    <div className="pf-media">
      <div className="pf-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
            <Icon name={x.icon} size={17} stroke={1.7} />
            {x.label}
          </button>
        ))}
      </div>
      {items === null && (
        <div className="pf-empty">
          <span className="spinner" />
        </div>
      )}
      {empty && <div className="pf-empty">{t("profile.nothing")}</div>}
      {tab === "media" && items && items.length > 0 && (
        <div className="pf-grid">
          {items.map((m) => (
            <button key={m.id} onClick={() => setViewer(m)}>
              {m.kind === "video" ? (
                <>
                  <video
                    src={mediaUrl(m.media!.id) + "#t=0.1"}
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="pf-play">
                    <Icon name="play" size={14} filled />
                  </span>
                </>
              ) : (
                <img src={mediaUrl(m.media!.id, !!m.media!.hasThumb)} alt="" loading="lazy" />
              )}
            </button>
          ))}
        </div>
      )}
      {tab === "files" &&
        items?.map((m) => (
          <button
            key={m.id}
            className="pf-row"
            onClick={() =>
              useApp.setState({ infoOpen: false, jumpTo: { chatId: chat.id, messageId: m.id } })
            }
          >
            <span className="pf-row-ic">
              <Icon
                name={m.kind === "voice" || m.kind === "audio" ? "mic" : "file"}
                size={18}
                stroke={1.7}
              />
            </span>
            <span className="grow">
              <b className="ltr">{m.media?.name || t("chat.file")}</b>
              <span>
                {fileSize(m.media?.size || 0, lang)} · {listStamp(m.createdAt, lang)}
              </span>
            </span>
          </button>
        ))}
      {tab === "links" &&
        links.map((l, i) => (
          <a
            key={`${l.messageId}-${i}`}
            className="pf-row"
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="pf-row-ic">
              <Icon name="link" size={18} stroke={1.7} />
            </span>
            <span className="grow">
              <b className="ltr">{l.url.replace(/^https?:\/\//, "")}</b>
              <span>{listStamp(l.createdAt, lang)}</span>
            </span>
          </a>
        ))}
      {viewer && <MediaViewer message={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
