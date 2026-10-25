import type { ReactNode } from "react";

export function Spinner({ large }: { large?: boolean }) {
  return (
    <span
      className={["nc-spinner", large ? "nc-spinner--lg" : ""].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="nc-loading">
      <Spinner large />
      <p className="nc-text nc-text--muted">{message}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="nc-empty">
      {icon ? (
        <span className="nc-empty__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <h3 className="nc-heading nc-heading--4">{title}</h3>
      {description ? <p className="nc-text nc-text--muted">{description}</p> : null}
      {action}
    </div>
  );
}
