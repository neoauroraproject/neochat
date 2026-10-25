import { create } from "zustand";
import type { AuthSession, UserProfile } from "@neochat/shared";
import { apiFetch, clearTokens, getTokens, setTokens } from "../lib/api";
import { syncSdkToken } from "../lib/sdk";

interface AuthState {
  session: AuthSession | null;
  user: UserProfile | null;
  bootstrapped: boolean;
  setSession: (session: AuthSession) => void;
  loadProfile: () => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  bootstrapped: false,

  setSession: (session) => {
    setTokens(session.tokens);
    syncSdkToken(session.tokens.accessToken);
    set({ session });
  },

  loadProfile: async () => {
    const user = await apiFetch<UserProfile>("/users/me");
    set({ user });
  },

  logout: async () => {
    const refresh = localStorage.getItem("neochat.refresh");
    if (refresh) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: refresh }),
      }).catch(() => undefined);
    }
    clearTokens();
    syncSdkToken(null);
    set({ session: null, user: null });
  },

  bootstrap: async () => {
    const { access } = getTokens();
    syncSdkToken(access);
    if (!access) {
      set({ bootstrapped: true });
      return;
    }
    try {
      await get().loadProfile();
    } catch {
      clearTokens();
      syncSdkToken(null);
      set({ session: null, user: null });
    } finally {
      set({ bootstrapped: true });
    }
  },
}));

interface UiState {
  themePreference: "light" | "dark" | "system";
  theme: "light" | "dark";
  navCollapsed: boolean;
  chatListWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  folder: "all" | "unread" | "groups" | "channels" | "archived";
  setThemePreference: (pref: "light" | "dark" | "system") => void;
  setTheme: (theme: "light" | "dark") => void;
  applyResolvedTheme: () => void;
  toggleTheme: () => void;
  setNavCollapsed: (collapsed: boolean) => void;
  setChatListWidth: (width: number) => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  setFolder: (folder: UiState["folder"]) => void;
}

const THEME_PREF_KEY = "neochat.themePreference";
const CHAT_LIST_WIDTH_KEY = "neochat.chatListWidth";
const RIGHT_PANEL_WIDTH_KEY = "neochat.rightPanelWidth";

function resolveTheme(pref: "light" | "dark" | "system"): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function readThemePreference(): "light" | "dark" | "system" {
  const stored = localStorage.getItem(THEME_PREF_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  const legacy = localStorage.getItem("neochat.theme");
  if (legacy === "light" || legacy === "dark") return legacy;
  return "system";
}

function readWidth(key: string, fallback: number, min: number, max: number): number {
  const n = Number(localStorage.getItem(key));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const useUiStore = create<UiState>((set, get) => {
  const themePreference = readThemePreference();
  return {
    themePreference,
    theme: resolveTheme(themePreference),
    navCollapsed: false,
    chatListWidth: readWidth(CHAT_LIST_WIDTH_KEY, 340, 260, 480),
    rightPanelOpen: false,
    rightPanelWidth: readWidth(RIGHT_PANEL_WIDTH_KEY, 320, 260, 420),
    folder: "all",

    setThemePreference: (pref) => {
      localStorage.setItem(THEME_PREF_KEY, pref);
      const theme = resolveTheme(pref);
      document.documentElement.dataset.theme = theme;
      set({ themePreference: pref, theme });
    },

    /** Alias used by App bootstrap / Settings */
    setTheme: (theme: "light" | "dark") => {
      get().setThemePreference(theme);
    },

    applyResolvedTheme: () => {
      const theme = resolveTheme(get().themePreference);
      document.documentElement.dataset.theme = theme;
      set({ theme });
    },

    toggleTheme: () => {
      const next = get().theme === "dark" ? "light" : "dark";
      get().setThemePreference(next);
    },

    setNavCollapsed: (collapsed) => set({ navCollapsed: collapsed }),

    setChatListWidth: (width) => {
      const w = Math.min(480, Math.max(260, width));
      localStorage.setItem(CHAT_LIST_WIDTH_KEY, String(w));
      set({ chatListWidth: w });
    },

    setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
    toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

    setRightPanelWidth: (width) => {
      const w = Math.min(420, Math.max(260, width));
      localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(w));
      set({ rightPanelWidth: w });
    },

    setFolder: (folder) => set({ folder }),
  };
});
