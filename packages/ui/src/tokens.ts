/** Design tokens shared across web + admin. Mirrors src/tokens.css variables. */
export const tokens = {
  color: {
    brand: "#0d9488",
    brandDark: "#0f766e",
    brandLight: "#14b8a6",
    bgLight: "#f8fafc",
    bgDark: "#0f172a",
    surfaceLight: "#ffffff",
    surfaceDark: "#1e293b",
    textLight: "#0f172a",
    textDark: "#f1f5f9",
    mutedLight: "#64748b",
    mutedDark: "#94a3b8",
    danger: "#dc2626",
    success: "#059669",
    warning: "#d97706",
    border: "#e2e8f0",
  },
  space: {
    0: "0",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
  },
  radius: { sm: "6px", md: "10px", lg: "14px", xl: "20px", full: "9999px" },
  shadow: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.06)",
    md: "0 4px 12px rgba(15, 23, 42, 0.08)",
    lg: "0 12px 32px rgba(15, 23, 42, 0.12)",
    xl: "0 24px 48px rgba(15, 23, 42, 0.16)",
  },
  animation: {
    fast: "120ms",
    normal: "200ms",
    slow: "320ms",
    ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  font: {
    sans: "'Inter', 'Vazirmatn', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    mono: "ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace",
  },
} as const;

export type Theme = "light" | "dark";

export function applyTheme(theme: Theme, el: HTMLElement = document.documentElement): void {
  el.dataset.theme = theme;
}
