import { useState, type PropsWithChildren, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  value?: string;
  onChange?: (id: string) => void;
  className?: string;
}

export function Tabs({ items, defaultTab, value, onChange, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultTab ?? items[0]?.id ?? "");
  const active = value ?? internal;

  function select(id: string) {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  }

  const panel = items.find((t) => t.id === active);

  return (
    <div className={["nc-tabs", className ?? ""].filter(Boolean).join(" ")}>
      <div className="nc-tabs__list" role="tablist">
        {items.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            disabled={tab.disabled}
            className={["nc-tabs__trigger", active === tab.id ? "nc-tabs__trigger--active" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => select(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="nc-tabs__panel" role="tabpanel">
        {panel?.content}
      </div>
    </div>
  );
}

export function TabPanel({ children }: PropsWithChildren) {
  return <div>{children}</div>;
}
