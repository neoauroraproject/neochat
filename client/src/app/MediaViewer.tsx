import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { mediaUrl, post } from "../api";
import { useDragDismiss } from "../components/dragDismiss";
import { Icon } from "../components/Icon";
import { cancelDownload, startDownload, useDownload } from "../downloads";
import { timeOf } from "../format";
import { useApp } from "../store";
import { useT } from "../i18n";
import { useLayer } from "./nav";
import type { Message } from "../types";

export function MediaViewer({
  message: m,
  onClose: close,
}: {
  message: Message;
  onClose: () => void;
}) {
  const lang = useApp((s) => s.lang);
  const meId = useApp((s) => s.me?.id);
  const t = useT();
  // View-once: no download, never cached (?once=1), and closing it removes it for good.
  const once = m.once === 1 && m.senderId !== meId;
  const onClose = () => {
    close();
    if (once)
      post<Message>(`/api/messages/${m.id}/opened`)
        .then((x) => useApp.getState().applyEdit(x))
        .catch(() => {});
  };
  useLayer(true, onClose); // back closes the photo, not the chat behind it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const src = m.localUrl || (m.media?.id ? mediaUrl(m.media.id) + (once ? "?once=1" : "") : "");
  const dl = useDownload(m.media?.id);
  const bg = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLDivElement>(null);
  // Drag the photo down to close; the backdrop fades with the finger.
  const drag = useDragDismiss({
    target: () => media.current,
    backdrop: () => bg.current,
    onClose,
    scale: true,
    canStart: (e) => !(e.target as HTMLElement).closest("button, .bar, video"),
  });
  return createPortal(
    <div className="viewer" onClick={(e) => e.target === e.currentTarget && onClose()} {...drag}>
      <div className="viewer-bg" ref={bg} />
      <div className="bar">
        <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
          <b>{m.sender.displayName}</b>
          <span style={{ opacity: 0.7, fontSize: 12.5 }}>{timeOf(m.createdAt, lang)}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {m.media?.id && !once && (
            <button
              className="icon-btn filled viewer-dl"
              onClick={() =>
                dl?.state === "loading" ? cancelDownload(m.media!.id) : startDownload(m.media!)
              }
              aria-label="download"
              style={{ color: "#fff" }}
            >
              {dl?.state === "loading" ? (
                <span className="ring" style={{ ["--p" as string]: dl.progress }} />
              ) : (
                <Icon name={dl?.state === "done" ? "check" : "download"} size={20} />
              )}
            </button>
          )}
          <button
            className="icon-btn filled"
            onClick={onClose}
            aria-label="close"
            style={{ color: "#fff" }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      </div>
      <div className="viewer-media" ref={media}>
        {m.kind === "video" ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            // Watched to the end: keep the whole file so it plays (and seeks) offline next time.
            onEnded={() => !m.localUrl && !m.once && fetch(src).catch(() => {})}
          />
        ) : (
          <img src={src} alt={m.media?.name || ""} onClick={onClose} />
        )}
      </div>
      {once && <div className="once-note">{t("once.noScreenshot")}</div>}
      {m.text && !once && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
            insetInline: 20,
            textAlign: "center",
            color: "#fff",
            whiteSpace: "pre-wrap",
          }}
        >
          {m.text}
        </div>
      )}
    </div>,
    document.body,
  );
}
