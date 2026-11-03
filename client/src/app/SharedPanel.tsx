import { useEffect, useState } from "react";
import { adHref, adsFor, adTarget, trackImpression } from "../ads";
import { get, mediaUrl } from "../api";
import { Icon } from "../components/Icon";
import { Avatar, ColHead, Empty, Menu, type MenuItem } from "../components/ui";
import { chatTitle, fileSize, listStamp, num, presenceText } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, Message } from "../types";
import { MediaViewer } from "./MediaViewer";

type Kind = "documents" | "photos" | "movies" | "other";

interface Totals {
  count: number;
  size: number;
}

interface Summary {
  files: Totals;
  links: number;
  types: Record<Kind, Totals>;
}

interface SharedLink {
  messageId: number;
  url: string;
  createdAt: number;
}

const TYPES: { id: Kind; icon: string; key: `shared.${Kind}` }[] = [
  { id: "documents", icon: "doc", key: "shared.documents" },
  { id: "photos", icon: "photo", key: "shared.photos" },
  { id: "movies", icon: "film", key: "shared.movies" },
  { id: "other", icon: "files", key: "shared.other" },
];

/** Admin and network ads for the "sidebar" placement, at the foot of the shared files and the welcome screen. */
export function SidebarAd() {
  const ad = useApp((s) => adsFor(s.ads, "sidebar")[0]);
  const t = useT();
  useEffect(() => {
    if (ad) trackImpression(ad);
  }, [ad]);
  if (!ad) return null;
  return (
    <a className="side-ad" href={adHref(ad)} target={adTarget(ad)} rel="noopener noreferrer">
      <span className="t">{ad.title}</span>
      {ad.body && <span className="b">{ad.body}</span>}
      <span className="tag">{ad.badge || t("chat.sponsored")}</span>
    </a>
  );
}

/** The reference's right column: the chat, its file and link totals, and files grouped by type. */
export function SharedPanel({ chat, onHide }: { chat: Chat; onHide: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [sum, setSum] = useState<Summary | null>(null);
  const [open, setOpen] = useState<Kind | "links" | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const lastId = chat.lastMessage?.id;
  const title = chatTitle(chat, lang);

  useEffect(() => setOpen(null), [chat.id]);
  useEffect(() => {
    let live = true;
    get<Summary>(`/api/chats/${chat.id}/shared`)
      .then((r) => live && setSum(r))
      .catch(() => live && setSum(null));
    return () => {
      live = false;
    };
  }, [chat.id, lastId]);

  if (open) return <SharedList chat={chat} kind={open} onBack={() => setOpen(null)} />;

  const sub =
    chat.type === "direct"
      ? chat.saved
        ? ""
        : presenceText(chat.peer, lang)
      : t(chat.type === "channel" ? "presence.subscribers" : "presence.members", {
          n: num(chat.memberCount, lang),
        });
  const info = () => useApp.setState({ infoOpen: true });
  const items: MenuItem[] = [
    { icon: "info", label: t("shared.details"), onClick: info },
    {
      icon: chat.muted ? "bell" : "bell-off",
      label: chat.muted ? t("list.unmute") : t("list.mute"),
      onClick: () => useApp.getState().setPrefs(chat.id, { muted: !chat.muted }),
    },
  ];

  return (
    <div className="shared">
      <ColHead
        title={t("shared.title")}
        onBack={onHide}
        backIcon="forward"
        backLabel={t("shared.hide")}
      />
      <div className="shared-scroll">
        <button className="shared-hero" onClick={info}>
          <Avatar
            id={chat.saved ? -1 : (chat.peer?.id ?? chat.id)}
            name={title}
            media={chat.saved ? undefined : (chat.peer?.avatar ?? chat.avatar)}
            size={104}
            icon={chat.saved ? "bookmark" : undefined}
          />
          <span className="t">{title}</span>
          {sub && <span className="s">{sub}</span>}
        </button>

        <div className="tiles">
          <div className="tile files">
            <span className="lbl">{t("shared.allFiles")}</span>
            <span className="val">
              <Icon name="folder" size={27} filled />
              {num(sum?.files.count ?? 0, lang)}
            </span>
            <i className="pip" />
          </div>
          <button className="tile links" onClick={() => setOpen("links")}>
            <span className="lbl">{t("shared.allLinks")}</span>
            <span className="val">
              <Icon name="folder-link" size={27} filled />
              {num(sum?.links ?? 0, lang)}
            </span>
          </button>
        </div>

        <div className="ft-head">
          <span>{t("shared.fileType")}</span>
          <button
            className="kebab"
            aria-label={t("shared.details")}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.right, y: r.bottom + 4 });
            }}
          >
            <Icon name="more-v" size={18} stroke={2.4} />
          </button>
        </div>
        <div className="ft-list">
          {TYPES.map((ty) => {
            const c = sum?.types[ty.id] ?? { count: 0, size: 0 };
            return (
              <button
                key={ty.id}
                className="ft-row"
                data-kind={ty.id}
                onClick={() => setOpen(ty.id)}
              >
                <span className="ft-ic">
                  <Icon name={ty.icon} size={20} filled />
                </span>
                <span className="ft-txt">
                  <b>{t(ty.key)}</b>
                  <span>
                    {c.count === 1
                      ? t("shared.summaryOne", { size: fileSize(c.size, lang) })
                      : t("shared.summary", {
                          n: num(c.count, lang),
                          size: fileSize(c.size, lang),
                        })}
                  </span>
                </span>
                <Icon name="forward" size={16} stroke={2} className="chev flip-rtl" />
              </button>
            );
          })}
        </div>

        <div className="shared-foot">
          <SidebarAd />
          <span className="copy">{t("common.copyright")}</span>
        </div>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** One file type (or the links) opened from the panel: a photo grid, or rows for files and links. */
function SharedList({
  chat,
  kind,
  onBack,
}: {
  chat: Chat;
  kind: Kind | "links";
  onBack: () => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [items, setItems] = useState<Message[] | null>(null);
  const [links, setLinks] = useState<SharedLink[] | null>(null);
  const [viewer, setViewer] = useState<Message | null>(null);

  useEffect(() => {
    let live = true;
    get<{ items?: Message[]; links?: SharedLink[] }>(`/api/chats/${chat.id}/shared?type=${kind}`)
      .then((r) => {
        if (!live) return;
        setItems(r.items || []);
        setLinks(r.links || []);
      })
      .catch(() => {
        if (!live) return;
        setItems([]);
        setLinks([]);
      });
    return () => {
      live = false;
    };
  }, [chat.id, kind]);

  const title = kind === "links" ? t("shared.allLinks") : t(`shared.${kind}`);
  const type = TYPES.find((x) => x.id === kind);
  const empty =
    (kind === "links" ? links : items) !== null &&
    (kind === "links" ? links!.length : items!.length) === 0;

  return (
    <div className="shared">
      <ColHead title={title} onBack={onBack} backLabel={t("common.back")} />
      <div className="shared-scroll">
        {items === null && (
          <div className="empty">
            <span className="spinner" />
          </div>
        )}
        {empty && <Empty icon={type ? "folder" : "link"} title={t("shared.nothing")} />}

        {(kind === "photos" || kind === "movies") && items && items.length > 0 && (
          <div className="shared-grid">
            {items.map((m) => (
              <button key={m.id} onClick={() => setViewer(m)}>
                {m.kind === "image" ? (
                  <img src={mediaUrl(m.media!.id, !!m.media!.hasThumb)} alt="" loading="lazy" />
                ) : (
                  <>
                    <video src={mediaUrl(m.media!.id) + "#t=0.1"} preload="metadata" muted />
                    <span className="play">
                      <Icon name="play" size={16} filled />
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {(kind === "documents" || kind === "other") &&
          items?.map((m) => (
            <a
              key={m.id}
              className="ft-row"
              data-kind={kind}
              href={mediaUrl(m.media!.id)}
              download={m.media!.name}
            >
              <span className="ft-ic">
                <Icon name={type!.icon} size={20} filled />
              </span>
              <span className="ft-txt">
                <b className="ltr">{m.media!.name || t("chat.file")}</b>
                <span>
                  {fileSize(m.media!.size, lang)} · {listStamp(m.createdAt, lang)}
                </span>
              </span>
              <Icon name="download" size={16} className="chev" />
            </a>
          ))}

        {kind === "links" &&
          links?.map((l, i) => (
            <a
              key={`${l.messageId}-${i}`}
              className="ft-row"
              data-kind="links"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ft-ic">
                <Icon name="link" size={19} stroke={2} />
              </span>
              <span className="ft-txt">
                <b className="ltr">{l.url.replace(/^https?:\/\//, "")}</b>
                <span>{listStamp(l.createdAt, lang)}</span>
              </span>
              <Icon name="external" size={15} className="chev" />
            </a>
          ))}
      </div>
      {viewer && <MediaViewer message={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
