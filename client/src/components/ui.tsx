import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { mediaUrl } from "../api";
import { initials } from "../format";
import { useApp } from "../store";
import { Icon } from "./Icon";

// Deterministic warm/cool gradient per id so avatars without photos are still recognizable.
const palettes = [
  ["#ff9f0a", "#ff6b3d"],
  ["#5ac8fa", "#0a84ff"],
  ["#30d158", "#0fae8f"],
  ["#bf5af2", "#7d4cff"],
  ["#ff375f", "#ff6b8b"],
  ["#64d2ff", "#5e5ce6"],
  ["#ffd60a", "#ff9f0a"],
  ["#ac8e68", "#7a5c3c"],
];

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
  const [a, b] = palettes[Math.abs(id) % palettes.length];
  const showImg = media && !failed;
  return (
    <div
      className={`avatar${squircle ? " squircle" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      <div
        className="face"
        style={showImg ? undefined : { background: `linear-gradient(135deg, ${a}, ${b})` }}
      >
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className={`overlay${sheet ? " sheet-overlay" : ""}`}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`modal glass-float${wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
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
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, origin: "top left" });
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
      className="overlay"
      style={{ background: "transparent", animation: "none" }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={ref}
        className="menu glass-float"
        style={{ left: pos.left, top: pos.top, transformOrigin: pos.origin }}
        role="menu"
      >
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
        <div key={t.id} className={`toast glass-float ${t.kind || ""}`}>
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
