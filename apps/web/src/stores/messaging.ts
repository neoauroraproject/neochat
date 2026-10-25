import type { Chat, UserPresence } from "@neochat/shared";
import { create } from "zustand";

interface TypingState {
  [chatId: string]: Set<string>;
}

interface ChatState {
  activeChatId: string | null;
  chats: Chat[];
  typing: TypingState;
  presence: Record<string, UserPresence>;
  searchQuery: string;
  selectionMode: boolean;
  selectedMessageIds: Set<string>;
  setActiveChat: (chatId: string | null) => void;
  setChats: (chats: Chat[]) => void;
  upsertChat: (chat: Chat) => void;
  setSearchQuery: (q: string) => void;
  setTyping: (chatId: string, userId: string, active: boolean) => void;
  setPresence: (userId: string, presence: UserPresence) => void;
  setSelectionMode: (on: boolean) => void;
  toggleMessageSelection: (messageId: string) => void;
  clearSelection: () => void;
  incrementUnread: (chatId: string) => void;
  clearUnread: (chatId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeChatId: null,
  chats: [],
  typing: {},
  presence: {},
  searchQuery: "",
  selectionMode: false,
  selectedMessageIds: new Set(),

  setActiveChat: (chatId) => set({ activeChatId: chatId }),

  setChats: (chats) => set({ chats }),

  upsertChat: (chat) =>
    set((s) => {
      const idx = s.chats.findIndex((c) => c.id === chat.id);
      if (idx >= 0) {
        const next = [...s.chats];
        next[idx] = chat;
        return { chats: next };
      }
      return { chats: [chat, ...s.chats] };
    }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setTyping: (chatId, userId, active) =>
    set((s) => {
      const next = { ...s.typing };
      const set = new Set(next[chatId] ?? []);
      if (active) set.add(userId);
      else set.delete(userId);
      next[chatId] = set;
      return { typing: next };
    }),

  setPresence: (userId, presence) =>
    set((s) => ({ presence: { ...s.presence, [userId]: presence } })),

  setSelectionMode: (on) => set({ selectionMode: on, selectedMessageIds: new Set() }),

  toggleMessageSelection: (messageId) =>
    set((s) => {
      const next = new Set(s.selectedMessageIds);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return { selectedMessageIds: next, selectionMode: next.size > 0 || s.selectionMode };
    }),

  clearSelection: () => set({ selectionMode: false, selectedMessageIds: new Set() }),

  incrementUnread: (chatId) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c,
      ),
    })),

  clearUnread: (chatId) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
    })),
}));

interface DecryptedMessage {
  messageId: string;
  chatId: string;
  text: string;
  failed: boolean;
}

interface MessageCacheState {
  cache: Record<string, DecryptedMessage>;
  setDecrypted: (msg: DecryptedMessage) => void;
  getDecrypted: (messageId: string) => DecryptedMessage | undefined;
  removeDecrypted: (messageId: string) => void;
}

export const useMessageCache = create<MessageCacheState>((set, get) => ({
  cache: {},

  setDecrypted: (msg) => set((s) => ({ cache: { ...s.cache, [msg.messageId]: msg } })),

  getDecrypted: (messageId) => get().cache[messageId],

  removeDecrypted: (messageId) =>
    set((s) => {
      const next = { ...s.cache };
      delete next[messageId];
      return { cache: next };
    }),
}));

interface PrefsState {
  soundEnabled: boolean;
  browserNotifications: boolean;
  autoDownloadMedia: boolean;
  setSoundEnabled: (v: boolean) => void;
  setBrowserNotifications: (v: boolean) => void;
  setAutoDownloadMedia: (v: boolean) => void;
}

const PREFS_KEY = "neochat.prefs";

function readPrefs(): Pick<
  PrefsState,
  "soundEnabled" | "browserNotifications" | "autoDownloadMedia"
> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { soundEnabled: true, browserNotifications: false, autoDownloadMedia: true };
}

function savePrefs(
  prefs: Pick<PrefsState, "soundEnabled" | "browserNotifications" | "autoDownloadMedia">,
) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

const initialPrefs = readPrefs();

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ...initialPrefs,

  setSoundEnabled: (v) => {
    savePrefs({ ...get(), soundEnabled: v });
    set({ soundEnabled: v });
  },

  setBrowserNotifications: (v) => {
    savePrefs({ ...get(), browserNotifications: v });
    set({ browserNotifications: v });
  },

  setAutoDownloadMedia: (v) => {
    savePrefs({ ...get(), autoDownloadMedia: v });
    set({ autoDownloadMedia: v });
  },
}));

interface ComposeDraftState {
  drafts: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  getDraft: (chatId: string) => string;
  clearDraft: (chatId: string) => void;
}

export const useComposeStore = create<ComposeDraftState>((set, get) => ({
  drafts: {},

  setDraft: (chatId, text) => set((s) => ({ drafts: { ...s.drafts, [chatId]: text } })),

  getDraft: (chatId) => get().drafts[chatId] ?? "",

  clearDraft: (chatId) =>
    set((s) => {
      const next = { ...s.drafts };
      delete next[chatId];
      return { drafts: next };
    }),
}));
