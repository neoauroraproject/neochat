import type { ReactNode } from "react";
import { Icon } from "../components/Icon";

/**
 * The phone's top bar: a large title on the reading side and round actions on the other
 * (a light search circle, a black "+"), like a native iOS list screen. Extra controls such as a
 * segmented filter sit between the title and the actions.
 */
export function MobileHeader({
  title,
  leading,
  middle,
  actions,
}: {
  title: ReactNode;
  leading?: ReactNode;
  middle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="m-head">
      <div className="m-head-title">
        {leading}
        <h1>{title}</h1>
      </div>
      {middle && <div className="m-head-middle">{middle}</div>}
      {actions && <div className="m-head-actions">{actions}</div>}
    </header>
  );
}

/** Round header button: light for secondary actions, solid black for the main one. */
export function RoundButton({
  icon,
  label,
  onClick,
  solid,
  active,
}: {
  icon: string;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  solid?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`m-round${solid ? " solid" : ""}${active ? " active" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={solid ? 22 : 21} stroke={solid ? 2 : 1.7} />
    </button>
  );
}

/** A pill-shaped segmented control (All / Missed, chat folders). */
export function PillSegment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="m-pill" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
