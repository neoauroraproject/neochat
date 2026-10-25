import type { PropsWithChildren } from "react";

export type BadgeTone = "default" | "success" | "danger" | "warning" | "brand";

export function Badge({ children, tone = "default" }: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={`nc-badge nc-badge--${tone}`}>{children}</span>;
}
