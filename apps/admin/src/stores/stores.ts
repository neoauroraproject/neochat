import { create } from "zustand";
import type { UserProfile } from "@neochat/shared";
import { apiFetch, clearTokens, setTokens } from "../lib/api";

interface AuthState {
  user: UserProfile | null;
  bootstrapped: boolean;
  loadProfile: () => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setTokensFromLogin: (tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
  }) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  bootstrapped: false,

  setTokensFromLogin: (tokens) => setTokens(tokens),

  loadProfile: async () => {
    const user = await apiFetch<UserProfile>("/users/me");
    if (user.role !== "admin") throw new Error("Admin access required");
    set({ user });
  },

  logout: async () => {
    const refresh = localStorage.getItem("neochat.admin.refresh");
    if (refresh) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: refresh }),
      }).catch(() => undefined);
    }
    clearTokens();
    set({ user: null });
  },

  bootstrap: async () => {
    const access = localStorage.getItem("neochat.admin.access");
    if (!access) {
      set({ bootstrapped: true });
      return;
    }
    try {
      await get().loadProfile();
    } catch {
      clearTokens();
      set({ user: null });
    } finally {
      set({ bootstrapped: true });
    }
  },
}));

interface UiState {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
}

const THEME_KEY = "neochat.admin.theme";

function readTheme(): "light" | "dark" {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
}));
