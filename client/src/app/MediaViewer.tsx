import { useEffect } from "react";
import { createPortal } from "react-dom";
import { mediaUrl } from "../api";
import { Icon } from "../components/Icon";
import { timeOf } from "../format";
import { useApp } from "../store";
import type { Message } from "../types";

export function MediaViewer({ message: m, onClose }: { message: Message; onClose: () => void }) {
  const lang = useApp((s) => s.lang);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const src = m.localUrl || (m.media?.id ? mediaUrl(m.media.id) : "");
  return createPortal(
    <div className="viewer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bar">
        <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}>
          <b>{m.sender.displayName}</b>
          <span style={{ opacity: 0.7, fontSize: 12.5 }}>{timeOf(m.createdAt, lang)}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {m.media?.id && (
            <a
              className="icon-btn filled"
              href={src}
              download={m.media.name}
              aria-label="download"
              style={{ color: "#fff" }}
            >
              <Icon name="download" size={20} />
            </a>
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
      {m.kind === "video" ? (
        <video src={src} controls autoPlay playsInline />
      ) : (
        <img src={src} alt={m.media?.name || ""} onClick={onClose} />
      )}
      {m.text && (
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
