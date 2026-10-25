import type { PropsWithChildren, ReactNode } from "react";

export type IconSize = "sm" | "md" | "lg";

export interface IconProps extends PropsWithChildren {
  size?: IconSize;
  label?: string;
  className?: string;
}

export function Icon({ children, size = "md", label, className }: IconProps) {
  return (
    <span
      className={["nc-icon", `nc-icon--${size}`, className ?? ""].filter(Boolean).join(" ")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </span>
  );
}

export interface IconButtonProps {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function IconButton({ label, onClick, children, className }: IconButtonProps) {
  return (
    <button
      type="button"
      className={["nc-btn", "nc-btn--ghost", "nc-btn--sm", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size="sm">{children}</Icon>
    </button>
  );
}
