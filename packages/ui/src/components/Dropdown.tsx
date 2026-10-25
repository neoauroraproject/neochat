import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";

export interface DropdownItem {
  id: string;
  label: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  className?: string;
}

export function Dropdown({ trigger, items, align = "start", className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={["nc-dropdown", className ?? ""].filter(Boolean).join(" ")} ref={rootRef}>
      <div
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        role="button"
        tabIndex={0}
      >
        {trigger}
      </div>
      {open ? (
        <div
          className="nc-dropdown__menu"
          style={align === "end" ? { insetInlineStart: "auto", insetInlineEnd: 0 } : undefined}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={["nc-dropdown__item", item.danger ? "nc-dropdown__item--danger" : ""]
                .filter(Boolean)
                .join(" ")}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface SidebarLinkProps extends PropsWithChildren {
  active?: boolean;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
}

export function Sidebar({
  children,
  collapsed,
  className,
}: PropsWithChildren<{ collapsed?: boolean; className?: string }>) {
  return (
    <aside
      className={["nc-sidebar", collapsed ? "nc-sidebar--collapsed" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children }: PropsWithChildren) {
  return <div className="nc-sidebar__header">{children}</div>;
}

export function SidebarNav({ children }: PropsWithChildren) {
  return <nav className="nc-sidebar__nav">{children}</nav>;
}

export function SidebarFooter({ children }: PropsWithChildren) {
  return <div className="nc-sidebar__footer">{children}</div>;
}

export function SidebarLink({ active, href, onClick, icon, children }: SidebarLinkProps) {
  const className = ["nc-sidebar__link", active ? "nc-sidebar__link--active" : ""]
    .filter(Boolean)
    .join(" ");
  if (href) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
