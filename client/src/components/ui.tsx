import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { mediaUrl } from "../api";
import { useLayer } from "../app/nav";
import { initials } from "../format";
import { useApp } from "../store";
import { Icon } from "./Icon";

// Deterministic pastel tile per id with the initials in a deeper shade of the same hue (like the
// reference's teal "TS"). The theme decides lightness so the tiles stay soft in dark mode too.
const hues = [168, 232, 44, 186, 8, 268, 140, 206];
const tint = (id: number) => {
  const h = hues[Math.abs(id) % hues.length];
  return [
    `hsl(${h} var(--avatar-s, 58%) var(--avatar-l, 91%))`,
    `hsl(${h} 38% var(--avatar-ink-l, 36%))`,
  ] as const;
};

export function Avatar({
  id = 0,
  name,
  media,
  size = 44,
  online,
  squircle,
  icon,
}: {
  id?: number;
  name: string;
  media?: string;
  size?: number;
  online?: boolean;
  squircle?: boolean;
  icon?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [a, b] = tint(id);
  const showImg = media && !failed;
  return (
    <div
      className={`avatar${squircle ? " squircle" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      <div className="face" style={showImg ? undefined : { background: a, color: b }}>
        {showImg ? (
          <img src={mediaUrl(media!, true)} alt="" loading="lazy" onError={() => setFailed(true)} />
        ) : icon ? (
          <Icon name={icon} size={size * 0.48} />
        ) : (
          initials(name)
        )}
      </div>
      {online && <span className="dot" />}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  sheet = true,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  sheet?: boolean;
}) {
  const t = useApp((s) => s.lang);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number } | null>(null);
  useLayer(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Drag the sheet down by its header; a quick flick dismisses regardless of distance.
  const onHeadDown = (e: React.PointerEvent) => {
    if (!sheet || !window.matchMedia("(max-width: 760px)").matches) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, t: e.timeStamp };
    sheetRef.current!.style.transition = "none";
  };
  const onHeadMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    // Upward drags meet growing resistance instead of a hard stop.
    const y = dy > 0 ? dy : -Math.sqrt(-dy) * 2;
    sheetRef.current!.style.transform = `translateY(${y}px)`;
  };
  const onHeadUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    const velocity = dy / Math.max(1, e.timeStamp - drag.current.t);
    drag.current = null;
    const el = sheetRef.current!;
    el.style.transition = "transform 360ms cubic-bezier(0.32, 0.72, 0, 1)";
    if (dy > 120 || velocity > 0.5) {
      el.style.transform = "translateY(100%)";
      setTimeout(onClose, 260);
    } else el.style.transform = "translateY(0)";
  };

  return createPortal(
    <div
      className={`overlay${sheet ? " sheet-overlay" : ""}`}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={sheetRef} className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <div
          className="modal-head"
          onPointerDown={onHeadDown}
          onPointerMove={onHeadMove}
          onPointerUp={onHeadUp}
          onPointerCancel={onHeadUp}
        >
          <span className="sheet-grabber" />
          <h2>{title}</h2>
          <button
            className="icon-btn filled"
            onClick={onClose}
            aria-label={t === "fa" ? "بستن" : "Close"}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => onChange(!checked)}
    />
  );
}

export interface MenuItem {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Context menu anchored at a point, flipped to stay on screen. */
export function Menu({
  x,
  y,
  items,
  onClose,
  header,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  /** Shown above the items, e.g. a message's reaction row. */
  header?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, origin: "top left" });
  useLayer(true, onClose);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = x + w > window.innerWidth - 8 ? Math.max(8, x - w) : x;
    const top = y + h > window.innerHeight - 8 ? Math.max(8, y - h) : y;
    setPos({ left, top, origin: `${top < y ? "bottom" : "top"} ${left < x ? "right" : "left"}` });
  }, [x, y]);
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div
      className="overlay menu-overlay"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={ref}
        className="menu"
        style={{ left: pos.left, top: pos.top, transformOrigin: pos.origin }}
        role="menu"
      >
        {header}
        {items
          .filter((i) => !i.hidden)
          .map((i) => (
            <button
              key={i.label}
              role="menuitem"
              className={i.danger ? "danger" : ""}
              onClick={() => {
                onClose();
                i.onClick();
              }}
            >
              <Icon name={i.icon} size={19} />
              {i.label}
            </button>
          ))}
      </div>
    </div>,
    document.body,
  );
}

/** Long-press (touch) + right-click (mouse) in one hook. */
export function usePress(onMenu: (x: number, y: number) => void) {
  const timer = useRef<number>();
  const start = useRef({ x: 0, y: 0 });
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onMenu(e.clientX, e.clientY);
    },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      timer.current = window.setTimeout(() => {
        navigator.vibrate?.(10);
        onMenu(t.clientX, t.clientY);
      }, 480);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - start.current.x) > 10 || Math.abs(t.clientY - start.current.y) > 10)
        window.clearTimeout(timer.current);
    },
    onTouchEnd: () => window.clearTimeout(timer.current),
  };
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={32} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {value && (
        <button className="icon-btn clear" onClick={() => onChange("")} aria-label="clear">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

/** Column header from the reference: a square soft button, the title, then a hairline under both. */
export function ColHead({
  title,
  onBack,
  backIcon = "back",
  backLabel,
  trailing,
}: {
  title: ReactNode;
  onBack?: () => void;
  backIcon?: "back" | "forward";
  backLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="col-head">
      {onBack && (
        <button className="sq-btn" onClick={onBack} aria-label={backLabel}>
          <Icon name={backIcon} size={16} stroke={2} className="flip-rtl" />
        </button>
      )}
      <h1>{title}</h1>
      {trailing}
    </header>
  );
}

export function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function BrandLogo({ size = 76 }: { size?: number }) {
  const config = useApp((s) => s.config);
  return (
    <div className="logo" style={{ width: size, height: size }}>
      <img src={config?.logoMedia ? mediaUrl(config.logoMedia) : "/icon.svg"} alt="" />
    </div>
  );
}

/** Lets a user pick an image and uploads it, returning the media id. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
