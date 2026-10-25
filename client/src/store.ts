import { create } from "zustand";
import { type ApiError, del, get, patch, post, setToken, upload } from "./api";
import { cacheGet, cacheSetLater } from "./cache";
import type { Ad, Chat, Message, PublicConfig, User } from "./types";

export type Section = "chats" | "calls" | "explore" | "settings";
export type Filter = "all" | "direct" | "groups" | "channels" | "unread" | "archive";
type Typing = Record<number, Record<number, { action: string; until: number }>>;

interface Toast {
  id: number;
  text: string;
  kind?: "error" | "info";
}

interface AppState {
  config: PublicConfig | null;
  me: User | null;
  lang: "fa" | "en";
  theme: "dark" | "light" | "auto";
  connected: boolean;
  chats: Record<number, Chat>;
  chatsLoaded: boolean;
  messages: Record<number, Message[]>;
  hasMore: Record<number, boolean>;
  stale: Record<number, boolean>;
  typing: Typing;
  activeChatId: number | null;
  section: Section;
  filter: Filter;
  infoOpen: boolean;
  ads: Ad[];
  drafts: Record<number, string>;
  toasts: Toast[];
  pendingJoin: string | null;

  setConfig(c: PublicConfig): void;
  setMe(u: User | null): void;
  setLang(l: "fa" | "en"): void;
  setTheme(t: "dark" | "light" | "auto"): void;
  toast(text: string, kind?: "error" | "info"): void;
  logout(): Promise<void>;

  loadChats(): Promise<void>;
  refreshChat(id: number): Promise<Chat | undefined>;
  upsertChat(c: Chat): void;
  removeChat(id: number): void;
  openChat(id: number | null): void;
  openDirect(userId: number): Promise<void>;
  setPrefs(id: number, prefs: Partial<Pick<Chat, "muted" | "archived" | "pinned">>): Promise<void>;

  loadMessages(chatId: number, older?: boolean): Promise<void>;
  sendText(chatId: number, text: string, replyTo?: Message | null): void;
  sendFile(
    chatId: number,
    file: File | Blob,
    opts?: { caption?: string; kind?: string; name?: string; replyTo?: Message | null },
  ): void;
  retry(m: Message): void;
  discard(m: Message): void;
  editMessage(id: number, text: string): Promise<void>;
  deleteMessage(id: number): Promise<void>;
  markRead(chatId: number): void;

  applyMessage(m: Message): void;
  applyEdit(m: Message): void;
  applyDelete(chatId: number, id: number, lastMessageId: number): void;
  applyRead(chatId: number, userId: number, messageId: number): void;
  applyPresence(userId: number, p: Partial<User>): void;
  applyUser(u: User): void;
  applyTyping(chatId: number, userId: number, action: string): void;
  markAllStale(): void;
  loadAds(): Promise<void>;
  setDraft(chatId: number, text: string): void;
}

const readPref = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
};

let tempId = -1;
const clientId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const files = new Map<string, { file: File | Blob; kind?: string; name?: string }>();

/** Merge by id, keep order, keep optimistic (negative id) messages at the end. */
function merge(existing: Message[], incoming: Message[]): Message[] {
  const map = new Map<number, Message>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  const pendingClientIds = new Set(incoming.map((m) => m.clientId).filter(Boolean));
  return [...map.values()]
    .filter((m) => !(m.id < 0 && pendingClientIds.has(m.clientId)))
    .sort((a, b) => {
      if (a.id < 0 && b.id > 0) return 1;
      if (b.id < 0 && a.id > 0) return -1;
      return a.id < 0 ? b.id - a.id : a.id - b.id;
    });
}

export const useApp = create<AppState>((set, getState) => {
  const cacheMessages = (chatId: number) => {
    const me = getState().me;
    const limit = getState().config?.clientCacheMessages ?? 200;
    if (!me || limit <= 0) return;
    cacheSetLater(`msgs:${me.id}:${chatId}`, () =>
      (getState().messages[chatId] || []).filter((m) => m.id > 0).slice(-limit),
    );
  };
  const cacheChats = () => {
    const me = getState().me;
    if (me) cacheSetLater(`chats:${me.id}`, () => Object.values(getState().chats));
  };
  const patchMessages = (chatId: number, fn: (list: Message[]) => Message[]) => {
    set((s) => ({ messages: { ...s.messages, [chatId]: fn(s.messages[chatId] || []) } }));
    cacheMessages(chatId);
  };
  const patchChat = (id: number, fn: (c: Chat) => Partial<Chat>) => {
    const c = getState().chats[id];
    if (!c) return;
    set((s) => ({ chats: { ...s.chats, [id]: { ...c, ...fn(c) } } }));
    cacheChats();
  };

  const doSend = async (chatId: number, pending: Message) => {
    try {
      let mediaId = "";
      const f = pending.clientId ? files.get(pending.clientId) : undefined;
      if (f) {
        const media = await upload(f.file, {
          name: f.name,
          kind: f.kind,
          onProgress: (p) =>
            patchMessages(chatId, (l) =>
              l.map((m) => (m.clientId === pending.clientId ? { ...m, progress: p } : m)),
            ),
        });
        mediaId = media.id;
      }
      const m = await post<Message>(`/api/chats/${chatId}/messages`, {
        text: pending.text,
        mediaId,
        replyTo: pending.replyTo || 0,
        clientId: pending.clientId,
      });
      if (pending.clientId) files.delete(pending.clientId);
      if (pending.localUrl) setTimeout(() => URL.revokeObjectURL(pending.localUrl!), 30_000);
      getState().applyMessage(m);
    } catch (e) {
      patchMessages(chatId, (l) =>
        l.map((m) =>
          m.clientId === pending.clientId ? { ...m, pending: false, failed: true } : m,
        ),
      );
      const err = e as ApiError;
      if (err.code && err.code !== "network") getState().toast(err.message, "error");
    }
  };

  return {
    config: null,
    me: null,
    lang: readPref<"fa" | "en">("neochat.lang", "" as "fa"),
    theme: readPref<"dark" | "light" | "auto">("neochat.theme", "" as "dark"),
    connected: false,
    chats: {},
    chatsLoaded: false,
    messages: {},
    hasMore: {},
    stale: {},
    typing: {},
    activeChatId: null,
    section: "chats",
    filter: "all",
    infoOpen: false,
    ads: (() => {
      try {
        return JSON.parse(localStorage.getItem("neochat.ads") || "[]") as Ad[];
      } catch {
        return [];
      }
    })(),
    drafts: {},
    toasts: [],
    pendingJoin: null,

    setConfig(c) {
      set((s) => ({ config: c, lang: s.lang || c.defaultLang, theme: s.theme || c.defaultTheme }));
    },
    setMe(u) {
      set({ me: u });
      if (u) {
        cacheGet<Chat[]>(`chats:${u.id}`).then((list) => {
          if (list && !getState().chatsLoaded) {
            const chats: Record<number, Chat> = {};
            for (const c of list) chats[c.id] = c;
            set({ chats });
          }
        });
      }
    },
    setLang(l) {
      writePref("neochat.lang", l);
      set({ lang: l });
    },
    setTheme(t) {
      writePref("neochat.theme", t);
      set({ theme: t });
    },
    toast(text, kind = "info") {
      const id = Date.now() + Math.random();
      set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
    },
    async logout() {
      try {
        await post("/api/auth/logout");
      } catch {
        /* already invalid */
      }
      setToken("");
      set({
        me: null,
        chats: {},
        messages: {},
        chatsLoaded: false,
        activeChatId: null,
        section: "chats",
      });
    },

    async loadChats() {
      const list = await get<Chat[]>("/api/chats");
      const chats: Record<number, Chat> = {};
      for (const c of list) chats[c.id] = c;
      set({ chats, chatsLoaded: true });
      cacheChats();
    },
    async refreshChat(id) {
      try {
        const c = await get<Chat>(`/api/chats/${id}`);
        getState().upsertChat(c);
        return c;
      } catch (e) {
        if ((e as ApiError).status === 404) getState().removeChat(id);
        return undefined;
      }
    },
    upsertChat(c) {
      set((s) => ({ chats: { ...s.chats, [c.id]: c } }));
      cacheChats();
    },
    removeChat(id) {
      set((s) => {
        const chats = { ...s.chats };
        delete chats[id];
        return { chats, activeChatId: s.activeChatId === id ? null : s.activeChatId };
      });
      cacheChats();
    },
    openChat(id) {
      set({ activeChatId: id, section: id ? "chats" : getState().section });
      if (id) {
        const s = getState();
        if (!s.messages[id] || s.stale[id]) {
          const me = s.me;
          if (me && !s.messages[id]) {
            cacheGet<Message[]>(`msgs:${me.id}:${id}`).then((cached) => {
              if (cached?.length && !getState().messages[id])
                set((st) => ({ messages: { ...st.messages, [id]: cached } }));
            });
          }
          s.loadMessages(id);
        }
      }
    },
    async openDirect(userId) {
      const c = await post<Chat>("/api/chats/direct", { userId });
      getState().upsertChat(c);
      getState().openChat(c.id);
    },
    async setPrefs(id, prefs) {
      patchChat(id, () => prefs);
      try {
        const c = await patch<Chat>(`/api/chats/${id}/prefs`, prefs);
        getState().upsertChat(c);
      } catch {
        getState().refreshChat(id);
      }
    },

    async loadMessages(chatId, older = false) {
      const list = getState().messages[chatId] || [];
      const firstId = list.find((m) => m.id > 0)?.id;
      const q = older && firstId ? `?before=${firstId}&limit=50` : "?limit=50";
      const res = await get<{ messages: Message[]; hasMore: boolean }>(
        `/api/chats/${chatId}/messages${q}`,
      );
      set((s) => {
        const existing = s.messages[chatId] || [];
        let base = existing;
        let hasMore = res.hasMore;
        if (!older) {
          // Cached history (from IndexedDB or before a disconnect) is only kept if it connects to the fresh page;
          // otherwise there could be a silent gap in the middle of the conversation.
          const oldestFetched = res.messages[0]?.id ?? 0;
          const connects = !res.hasMore || existing.some((m) => m.id > 0 && m.id >= oldestFetched);
          if (connects && existing.some((m) => m.id > 0)) hasMore = s.hasMore[chatId] ?? true;
          else base = existing.filter((m) => m.id < 0);
          if (!res.hasMore && !existing.some((m) => m.id > 0 && m.id < oldestFetched))
            hasMore = false;
        }
        return {
          messages: { ...s.messages, [chatId]: merge(base, res.messages) },
          hasMore: { ...s.hasMore, [chatId]: hasMore },
          stale: { ...s.stale, [chatId]: false },
        };
      });
      cacheMessages(chatId);
    },

    sendText(chatId, text, replyTo) {
      const me = getState().me!;
      const m: Message = {
        id: tempId--,
        chatId,
        senderId: me.id,
        sender: {
          id: me.id,
          username: me.username,
          displayName: me.displayName,
          avatar: me.avatar,
        },
        kind: "text",
        text,
        replyTo: replyTo?.id,
        reply: replyTo
          ? {
              id: replyTo.id,
              kind: replyTo.kind,
              text: replyTo.text,
              senderName: replyTo.sender.displayName,
            }
          : undefined,
        createdAt: Date.now(),
        clientId: clientId(),
        pending: true,
      };
      patchMessages(chatId, (l) => [...l, m]);
      doSend(chatId, m);
    },
    sendFile(chatId, file, opts = {}) {
      const me = getState().me!;
      const cid = clientId();
      const type = file.type || "";
      const kind: Message["kind"] =
        opts.kind === "voice"
          ? "voice"
          : type.startsWith("image/") && !type.includes("svg")
            ? "image"
            : type.startsWith("video/")
              ? "video"
              : type.startsWith("audio/")
                ? "audio"
                : "file";
      const localUrl =
        kind === "image" || kind === "video" || kind === "voice"
          ? URL.createObjectURL(file)
          : undefined;
      const name = opts.name || (file instanceof File ? file.name : "file");
      files.set(cid, { file, kind: opts.kind, name });
      const m: Message = {
        id: tempId--,
        chatId,
        senderId: me.id,
        sender: {
          id: me.id,
          username: me.username,
          displayName: me.displayName,
          avatar: me.avatar,
        },
        kind,
        text: opts.caption || "",
        media: { id: "", kind: kind as "file", mime: type, name, size: file.size },
        replyTo: opts.replyTo?.id,
        createdAt: Date.now(),
        clientId: cid,
        pending: true,
        progress: 0,
        localUrl,
      };
      patchMessages(chatId, (l) => [...l, m]);
      doSend(chatId, m);
    },
    retry(m) {
      patchMessages(m.chatId, (l) =>
        l.map((x) => (x.clientId === m.clientId ? { ...x, failed: false, pending: true } : x)),
      );
      doSend(m.chatId, { ...m, failed: false, pending: true });
    },
    discard(m) {
      if (m.clientId) files.delete(m.clientId);
      patchMessages(m.chatId, (l) => l.filter((x) => x.clientId !== m.clientId || x.id > 0));
    },
    async editMessage(id, text) {
      const m = await patch<Message>(`/api/messages/${id}`, { text });
      getState().applyEdit(m);
    },
    async deleteMessage(id) {
      await del(`/api/messages/${id}`);
    },
    markRead(chatId) {
      const s = getState();
      const c = s.chats[chatId];
      const list = s.messages[chatId];
      if (!c || !list?.length) return;
      const last = [...list].reverse().find((m) => m.id > 0);
      if (!last || last.id <= c.lastReadId) {
        if (c.unread) patchChat(chatId, () => ({ unread: 0 }));
        return;
      }
      patchChat(chatId, () => ({ lastReadId: last.id, unread: 0 }));
      post(`/api/chats/${chatId}/read`, { messageId: last.id }).catch(() => {});
    },

    applyMessage(m) {
      const s = getState();
      const loaded = !!s.messages[m.chatId];
      if (loaded) patchMessages(m.chatId, (l) => merge(l, [m]));
      const c = s.chats[m.chatId];
      if (!c) {
        s.refreshChat(m.chatId);
        return;
      }
      const mine = m.senderId === s.me?.id;
      const viewing = s.activeChatId === m.chatId && document.visibilityState === "visible";
      patchChat(m.chatId, (c) => ({
        lastMessage: m,
        lastMessageAt: m.createdAt,
        unread: mine || viewing ? c.unread : c.unread + 1,
        lastReadId: mine ? m.id : c.lastReadId,
        archived: m.kind !== "system" && !c.muted ? false : c.archived,
      }));
      // typing ends when the message arrives
      if (s.typing[m.chatId]?.[m.senderId]) {
        set((st) => {
          const t = { ...(st.typing[m.chatId] || {}) };
          delete t[m.senderId];
          return { typing: { ...st.typing, [m.chatId]: t } };
        });
      }
    },
    applyEdit(m) {
      if (getState().messages[m.chatId])
        patchMessages(m.chatId, (l) =>
          l.map((x) => (x.id === m.id ? { ...m, clientId: x.clientId } : x)),
        );
      patchChat(m.chatId, (c) => (c.lastMessage?.id === m.id ? { lastMessage: m } : {}));
    },
    applyDelete(chatId, id, lastMessageId) {
      if (getState().messages[chatId]) patchMessages(chatId, (l) => l.filter((x) => x.id !== id));
      const c = getState().chats[chatId];
      if (c && c.lastMessage?.id === id) {
        const prev = (getState().messages[chatId] || [])
          .filter((x) => x.id > 0 && x.id <= lastMessageId)
          .pop();
        if (prev) patchChat(chatId, () => ({ lastMessage: prev }));
        else getState().refreshChat(chatId);
      }
    },
    applyRead(chatId, userId, messageId) {
      const me = getState().me;
      if (userId === me?.id)
        patchChat(chatId, (c) => ({ lastReadId: Math.max(c.lastReadId, messageId), unread: 0 }));
      else patchChat(chatId, (c) => ({ othersReadId: Math.max(c.othersReadId, messageId) }));
    },
    applyPresence(userId, p) {
      set((s) => {
        let changed = false;
        const chats = { ...s.chats };
        for (const c of Object.values(chats)) {
          if (c.peer?.id === userId) {
            chats[c.id] = { ...c, peer: { ...c.peer, ...p } };
            changed = true;
          }
        }
        return changed ? { chats } : {};
      });
    },
    applyUser(u) {
      if (u.id === getState().me?.id) set((s) => ({ me: { ...s.me!, ...u } }));
      getState().applyPresence(u.id, u);
    },
    applyTyping(chatId, userId, action) {
      const until = Date.now() + 5000;
      set((s) => ({
        typing: {
          ...s.typing,
          [chatId]: { ...(s.typing[chatId] || {}), [userId]: { action, until } },
        },
      }));
      setTimeout(() => {
        const cur = getState().typing[chatId]?.[userId];
        if (cur && cur.until <= Date.now()) {
          set((s) => {
            const t = { ...(s.typing[chatId] || {}) };
            delete t[userId];
            return { typing: { ...s.typing, [chatId]: t } };
          });
        }
      }, 5100);
    },
    markAllStale() {
      set((s) => {
        const stale: Record<number, boolean> = {};
        for (const id of Object.keys(s.messages)) stale[Number(id)] = true;
        return { stale };
      });
    },
    async loadAds() {
      try {
        const ads = await get<Ad[]>("/api/ads");
        set({ ads });
        writePref("neochat.ads", JSON.stringify(ads));
      } catch {
        // Server unreachable: keep showing the last ads we received.
      }
    },
    setDraft(chatId, text) {
      set((s) => ({ drafts: { ...s.drafts, [chatId]: text } }));
    },
  };
});

export const sortedChats = (chats: Record<number, Chat>) =>
  Object.values(chats).sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.lastMessageAt - a.lastMessageAt || b.id - a.id,
  );
