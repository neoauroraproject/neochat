import { useRef } from "react";

/**
 * Drag down to close, like Photos and Telegram: the layer follows the finger, the backdrop fades
 * with it, and a long enough drag or a quick flick closes it. Upward drags meet resistance.
 * Returns pointer handlers for the element that starts the drag.
 */
export function useDragDismiss(opts: {
  target: () => HTMLElement | null;
  backdrop?: () => HTMLElement | null;
  onClose: () => void;
  /** Return false to ignore a drag that starts here (buttons, a scrolled list, video controls). */
  canStart?: (e: React.PointerEvent) => boolean;
  /** Shrink while dragging (viewer) instead of only sliding (sheets). */
  scale?: boolean;
}) {
  const st = useRef<{ id: number; y: number; t: number; dragging: boolean } | null>(null);
  const paint = (dy: number, animate: boolean) => {
    const el = opts.target();
    const bg = opts.backdrop?.();
    const tr = animate ? "transform 300ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms" : "none";
    const y = dy > 0 ? dy : -Math.sqrt(-dy) * 2;
    if (el) {
      el.style.transition = tr;
      el.style.transform = opts.scale
        ? `translateY(${y}px) scale(${1 - Math.min(0.25, Math.max(0, dy) / 1600)})`
        : `translateY(${y}px)`;
    }
    if (bg) {
      bg.style.transition = tr;
      bg.style.opacity = String(1 - Math.min(0.85, Math.max(0, dy) / 500));
    }
  };
  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 || (opts.canStart && !opts.canStart(e))) return;
      st.current = { id: e.pointerId, y: e.clientY, t: e.timeStamp, dragging: false };
    },
    onPointerMove(e: React.PointerEvent) {
      const s = st.current;
      if (!s || s.id !== e.pointerId) return;
      const dy = e.clientY - s.y;
      if (!s.dragging) {
        if (Math.abs(dy) < 8) return;
        if (dy < 0) {
          st.current = null; // an upward start is a scroll, not a dismiss
          return;
        }
        s.dragging = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      paint(dy, false);
    },
    onPointerUp(e: React.PointerEvent) {
      const s = st.current;
      st.current = null;
      if (!s?.dragging || s.id !== e.pointerId) return;
      // The click that ends a drag must not count as a tap on what is under the finger.
      const stop = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", stop, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 350);
      const dy = e.clientY - s.y;
      const v = dy / Math.max(1, e.timeStamp - s.t);
      if (dy > 130 || (dy > 40 && v > 0.55)) {
        paint(window.innerHeight, true);
        window.setTimeout(opts.onClose, 220);
      } else paint(0, true);
    },
    onPointerCancel(e: React.PointerEvent) {
      if (st.current?.dragging) paint(0, true);
      st.current = null;
      void e;
    },
  };
}
