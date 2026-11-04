import {
  ACCENTS,
  useAppearance,
  type BubbleTheme,
  type Motion,
  type Pattern,
  type TextSize,
} from "../appearance";
import { Icon } from "../components/Icon";
import { Modal, Toggle } from "../components/ui";
import { useT } from "../i18n";
import { useApp } from "../store";

const THEMES: {
  id: BubbleTheme;
  key: "look.default" | "look.friendly" | "look.sunset" | "look.forest" | "look.lavender";
}[] = [
  { id: "default", key: "look.default" },
  { id: "friendly", key: "look.friendly" },
  { id: "sunset", key: "look.sunset" },
  { id: "forest", key: "look.forest" },
  { id: "lavender", key: "look.lavender" },
];

/** Settings → Chat appearance: bubble theme cards, color, pattern, dark mode, text size, motion. */
export function ChatAppearance({ onClose }: { onClose: () => void }) {
  const t = useT();
  const a = useAppearance();
  const theme = useApp((s) => s.theme);
  const row = (label: string, control: React.ReactNode) => (
    <div className="look-row">
      <span>{label}</span>
      {control}
    </div>
  );
  const seg = <T extends string>(value: T, opts: [T, string][], on: (v: T) => void) => (
    <div className="segmented small">
      {opts.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => on(v)}>
          {l}
        </button>
      ))}
    </div>
  );
  return (
    <Modal title={t("look.title")} onClose={onClose}>
      <div className="look-themes">
        {THEMES.map((x) => (
          <button
            key={x.id}
            className={`look-card${a.bubbles === x.id ? " on" : ""}`}
            data-look={x.id}
            onClick={() => a.set({ bubbles: x.id })}
          >
            <i className="b-in" />
            <i className="b-out" />
            <span>{t(x.key)}</span>
          </button>
        ))}
      </div>
      <div className="look-list">
        {row(
          t("look.color"),
          <div className="look-dots">
            <button
              className={`look-dot brand${!a.accent ? " on" : ""}`}
              onClick={() => a.set({ accent: "" })}
              aria-label={t("look.brand")}
              title={t("look.brand")}
            >
              <Icon name="check" size={12} stroke={3} />
            </button>
            {ACCENTS.map((c) => (
              <button
                key={c}
                className={`look-dot${a.accent === c ? " on" : ""}`}
                style={{ background: c }}
                onClick={() => a.set({ accent: c })}
                aria-label={c}
              />
            ))}
          </div>,
        )}
        {row(
          t("look.pattern"),
          seg<Pattern>(
            a.pattern,
            [
              ["none", t("look.none")],
              ["dots", t("look.dots")],
              ["grid", t("look.grid")],
              ["doodle", t("look.doodle")],
            ],
            (v) => a.set({ pattern: v }),
          ),
        )}
        {row(
          t("look.autoDark"),
          <Toggle
            checked={theme === "auto"}
            onChange={(v) => useApp.getState().setTheme(v ? "auto" : "light")}
            label={t("look.autoDark")}
          />,
        )}
        {row(
          t("look.text"),
          seg<TextSize>(
            a.text,
            [
              ["small", t("look.small")],
              ["system", t("look.system")],
              ["large", t("look.large")],
            ],
            (v) => a.set({ text: v }),
          ),
        )}
        {row(
          t("look.motion"),
          seg<Motion>(
            a.motion,
            [
              ["default", t("look.default")],
              ["reduced", t("look.reduced")],
            ],
            (v) => a.set({ motion: v }),
          ),
        )}
      </div>
    </Modal>
  );
}
