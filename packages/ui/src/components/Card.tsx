import type { PropsWithChildren, ReactNode } from "react";

export interface CardProps extends PropsWithChildren {
  title?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Card({ children, title, footer, className }: CardProps) {
  return (
    <section className={["nc-card", className ?? ""].filter(Boolean).join(" ")}>
      {title ? <header className="nc-card__title">{title}</header> : null}
      <div className="nc-card__body">{children}</div>
      {footer ? <footer className="nc-card__footer">{footer}</footer> : null}
    </section>
  );
}
