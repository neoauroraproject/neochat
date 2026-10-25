import type { Chat } from "@neochat/shared";
import { useUiStore } from "../../stores/stores";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function RightInfoPanel({ chat }: { chat: Chat | null }) {
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const width = useUiStore((s) => s.rightPanelWidth);

  if (!chat) return null;

  const title = chat.title ?? chat.type;

  return (
    <aside className="tg-right" style={{ width }} aria-label="Chat info">
      <header className="tg-right-header">
        <h2>Info</h2>
        <button
          type="button"
          className="tg-icon-btn"
          aria-label="Close"
          onClick={() => setRightPanelOpen(false)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </header>

      <div className="tg-right-body tg-scroll">
        <div className="tg-right-profile">
          <div className="tg-avatar" style={{ width: 88, height: 88, fontSize: 32 }} aria-hidden>
            {initials(title)}
          </div>
          <h3>{title}</h3>
          <p className="tg-right-meta">{chat.type}</p>
          {chat.description ? <p className="tg-right-desc">{chat.description}</p> : null}
        </div>

        <section className="tg-right-section">
          <h4>Shared media</h4>
          <p className="tg-right-empty">Photos and videos will appear here.</p>
        </section>

        <section className="tg-right-section">
          <h4>Files</h4>
          <p className="tg-right-empty">Shared files will appear here.</p>
        </section>

        <section className="tg-right-section">
          <h4>Links</h4>
          <p className="tg-right-empty">Shared links will appear here.</p>
        </section>

        {(chat.type === "group" || chat.type === "channel") && (
          <section className="tg-right-section">
            <h4>Members</h4>
            <p className="tg-right-empty">Member list loads from chat membership.</p>
          </section>
        )}

        <section className="tg-right-section">
          <h4>Pinned messages</h4>
          <p className="tg-right-empty">Pinned messages will appear here.</p>
        </section>
      </div>
    </aside>
  );
}
