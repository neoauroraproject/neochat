import { create } from "zustand";

/**
 * Personal look of the app, kept on this device: chat bubble theme, accent color, the chat
 * background pattern, text size and motion. Applied as attributes on <html> so plain CSS does
 * the work (styles/appearance.css); the accent is applied with the brand color in App.tsx.
 * Defaults change nothing.
 */
export type BubbleTheme = "default" | "friendly" | "sunset" | "forest" | "lavender";
export type Pattern = "doodle" | "dots" | "grid" | "none";
export type TextSize = "small" | "system" | "large";
export type Motion = "default" | "reduced";

export interface Appearance {
  bubbles: BubbleTheme;
  accent: string; // "" = the server's brand color
  pattern: Pattern;
  text: TextSize;
  motion: Motion;
}

const KEY = "neochat.appearance";
const DEFAULTS: Appearance = {
  bubbles: "default",
  accent: "",
  pattern: "none",
  text: "system",
  motion: "default",
};

function read(): Appearance {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

export const ACCENTS = ["#26262b", "#3478f6", "#00a388", "#f2994a", "#a259ff", "#ec4899"];

export const useAppearance = create<Appearance & { set(p: Partial<Appearance>): void }>(
  (set, get) => ({
    ...read(),
    set(p) {
      set(p);
      const { set: _s, ...rest } = { ...get() };
      void _s;
      try {
        localStorage.setItem(KEY, JSON.stringify(rest));
      } catch {
        /* private mode */
      }
      apply();
    },
  }),
);

export function apply() {
  const a = useAppearance.getState();
  const root = document.documentElement;
  root.dataset.bubbles = a.bubbles;
  root.dataset.pattern = a.pattern;
  root.dataset.text = a.text;
  root.dataset.motion = a.motion;
}

apply();
