import { create } from "zustand";
import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { useDragDismiss } from "./dragDismiss";
import { useLayer } from "../app/nav";
import { useT } from "../i18n";

export interface SheetAction {
  label: string;
  danger?: boolean;
  run: () => void | Promise<unknown>;
}

interface SheetState {
  open: boolean;
  title?: string;
  message?: string;
  actions: SheetAction[];
  ask(cfg: { title?: string; message?: string; actions: SheetAction[] }): void;
  close(): void;
}

export const useSheet = create<SheetState>((set) => ({
  open: false,
  actions: [],
  ask: (cfg) => set({ open: true, ...cfg }),
  close: () => set({ open: false }),
}));

/** iOS-style confirmation: a titled group of actions plus a separate Cancel, replacing window.confirm. */
export function confirmAction(cfg: {
  title: string;
  message?: string;
  label: string;
  danger?: boolean;
  run: () => void | Promise<unknown>;
}) {
  useSheet.getState().ask({
    title: cfg.title,
    message: cfg.message,
    actions: [{ label: cfg.label, danger: cfg.danger ?? true, run: cfg.run }],
  });
}

export function ActionSheet() {
  const t = useT();
  const { open, title, message, actions, close } = useSheet();
  useLayer(open, close);
  const sheetEl = useRef<HTMLDivElement>(null);
  const drag = useDragDismiss({ target: () => sheetEl.current, onClose: close });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  if (!open) return null;
  return createPortal(
    <div
      className="overlay sheet-overlay action-overlay"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="action-sheet" role="alertdialog" aria-label={title} ref={sheetEl} {...drag}>
        <div className="as-group">
          {(title || message) && (
            <div className="as-head">
              {title && <b>{title}</b>}
              {message && <span>{message}</span>}
            </div>
          )}
          {actions.map((a) => (
            <button
              key={a.label}
              className={a.danger ? "danger" : ""}
              onClick={() => {
                close();
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button className="as-cancel" onClick={close}>
          {t("common.cancel")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
