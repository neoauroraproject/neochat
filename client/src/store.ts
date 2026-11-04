import { create } from "zustand";
import { type ApiError, del, get, patch, post, setToken, upload } from "./api";
import { cacheGet, cacheSetLater } from "./cache";
import { errorText } from "./i18n";
import { compressImage } from "./imagecompress";
import {
  deleteMessages,
  getMessages,
  outboxAll,
  outboxDelete,
  outboxPut,
  putMessages,
  trimChat,
} from "./localdb";
import type { Ad, Chat, Message, PublicConfig, Reaction, User } from "./types";

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
  /** Pinned messages per chat, newest first (loaded when the chat opens). */
  pins: Record<number, Message[]>;
  /** A message to scroll to once its chat is open (search result, pinned bar). */
  jumpTo: { chatId: number; messageId: number } | null;
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
    opts?: {
      caption?: string;
      kind?: string;
      name?: string;
      replyTo?: Message | null;
      /** A photo or video that can be opened once (private chats). */
      once?: boolean;
      /** Send a photo untouched, as a document (the preview's "without compression"). */
      original?: boolean;
    },
  ): void;
  retry(m: Message): void;
  discard(m: Message): void;
  editMessage(id: number, text: string): Promise<void>;
  deleteMessage(id: number): Promise<void>;
  markRead(chatId: number): void;

  applyMessage(m: Message): void;
  applyEdit(m: Message): void;
  applyDelete(chatId: number, id: number, lastMessageId: number): void;
  /** A file left the server (deleted from "My storage"): its messages show it as expired. */
  markMediaExpired(mediaId: string): void;
  applyRead(chatId: number, userId: number, messageId: number): void;
  applyPresence(userId: number, p: Partial<User>): void;
  applyUser(u: User): void;
  applyTyping(chatId: number, userId: number, action: string): void;
  markAllStale(): void;
  loadAds(): Promise<void>;
  setDraft(chatId: number, text: string): void;
  /** Catches up after being offline: missed messages and changes in one request. */
  syncNow(): Promise<void>;
  /** Sends what was written while offline, in order. */
  flushOutbox(): Promise<void>;
  /** Loads the latest messages of the recent chats so they open without the network. */
  prefetchRecent(): Promise<void>;
  applyReactions(chatId: number, messageId: number, reactions: Reaction[]): void;
  applyTTL(chatId: number, items: { id: number; destroyAt: number }[]): void;
  loadPins(chatId: number): Promise<void>;
  sendLocked(chatId: number, envelope: string, file?: Blob, replyTo?: Message | null): void;
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
const files = new Map<
  string,
  { file: File | Blob; kind?: string; name?: string; compress?: boolean }
>();
/** Extra fields of a pending send (locked envelope, view-once) by client id. */
const sendExtras = new Map<string, { kind?: string; once?: boolean }>();
let syncing = false;
let flushing = false;
const SYNC_KEY = (uid: number) => `neochat.sync.${uid}`;
const readCursor = (uid: number): { msg: number; ev: number } | null => {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY(uid)) || "null");
  } catch {
    return null;
  }
};
const writeCursor = (uid: number, c: { msg: number; ev: number }) => {
  try {
    localStorage.setItem(SYNC_KEY(uid), JSON.stringify(c));
  } catch {
    /* private mode */
  }
};

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
  // The phone keeps a longer history than the admin's per-chat setting asks for at minimum.
  const keepPerChat = () => {
    const limit = getState().config?.clientCacheMessages ?? 200;
    return limit <= 0 ? 0 : Math.max(limit, 1000);
  };
  const saveTimers = new Map<number, number>();
  const cacheMessages = (chatId: number) => {
    const me = getState().me;
    const keep = keepPerChat();
    if (!me || keep <= 0) return;
    window.clearTimeout(saveTimers.get(chatId));
    saveTimers.set(
      chatId,
      window.setTimeout(() => {
        saveTimers.delete(chatId);
        const list = (getState().messages[chatId] || []).filter((m) => m.id > 0).slice(-keep);
        putMessages(me.id, list).then(() => trimChat(me.id, chatId, keep));
      }, 800),
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

  // Files upload side by side, but each one is posted only after the files sent before it in the
  // same chat, so a small photo never overtakes a big one and the caption stays under the last.
  const fileQueue = new Map<number, Promise<void>>();

  const doSend = async (chatId: number, pending: Message) => {
    const f = pending.clientId ? files.get(pending.clientId) : undefined;
    let release = () => {};
    const before = f ? fileQueue.get(chatId) : undefined;
    if (f) fileQueue.set(chatId, new Promise<void>((r) => (release = r)));
    try {
      let mediaId = "";
      if (f) {
        if (f.compress && f.file instanceof File) {
          // Once per file: a retry uploads the already compressed copy.
          f.file = await compressImage(f.file);
          f.name = f.file instanceof File ? f.file.name : f.name;
          f.compress = false;
          const size = f.file.size;
          patchMessages(chatId, (l) =>
            l.map((m) =>
              m.clientId === pending.clientId && m.media
                ? { ...m, media: { ...m.media, size } }
                : m,
            ),
          );
        }
        const media = await upload(f.file, {
          name: f.name,
          kind: f.kind,
          onProgress: (p) =>
            patchMessages(chatId, (l) =>
              l.map((m) => (m.clientId === pending.clientId ? { ...m, progress: p } : m)),
            ),
        });
        mediaId = media.id;
        await before;
      }
      const extra = pending.clientId ? sendExtras.get(pending.clientId) : undefined;
      const m = await post<Message>(`/api/chats/${chatId}/messages`, {
        text: pending.text,
        mediaId,
        replyTo: pending.replyTo || 0,
        clientId: pending.clientId,
        kind: extra?.kind,
        once: extra?.once,
      });
      if (pending.clientId) {
        files.delete(pending.clientId);
        sendExtras.delete(pending.clientId);
        const me = getState().me;
        if (me) outboxDelete(me.id, pending.clientId);
      }
      if (pending.localUrl) setTimeout(() => URL.revokeObjectURL(pending.localUrl!), 30_000);
      getState().applyMessage(m);
    } catch (e) {
      const err = e as ApiError;
      // No connection (or the server is restarting): the message waits in the outbox with its
      // clock and goes by itself once we are back. Only a real refusal is shown as failed.
      const offline = !err.status || err.status >= 500 || err.code === "network";
      if (offline) {
        patchMessages(chatId, (l) =>
          l.map((m) =>
            m.clientId === pending.clientId ? { ...m, pending: true, progress: 0 } : m,
          ),
        );
      } else {
        patchMessages(chatId, (l) =>
          l.map((m) =>
            m.clientId === pending.clientId ? { ...m, pending: false, failed: true } : m,
          ),
        );
        const me = getState().me;
        if (me && pending.clientId) outboxDelete(me.id, pending.clientId);
        if (err.code) getState().toast(errorText(getState().lang, err), "error");
      }
    } finally {
      release();
    }
  };

  /** Writes a pending send to the outbox so it survives the app being closed. */
  const remember = (m: Message) => {
    const me = getState().me;
    if (!me || !m.clientId) return;
    const f = files.get(m.clientId);
    const extra = sendExtras.get(m.clientId);
    outboxPut(me.id, {
      clientId: m.clientId,
      chatId: m.chatId,
      createdAt: m.createdAt,
      text: m.text,
      replyTo: m.replyTo,
      kind: extra?.kind,
      once: extra?.once,
      file: f?.file,
      fileName: f?.name,
      fileKind: f?.kind,
      compress: f?.compress,
      message: { ...m, localUrl: undefined, progress: undefined },
    });
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
    pins: {},
    jumpTo: null,
    toasts: [],
    pendingJoin: null,

    setConfig(c) {
      set((s) => ({ config: c, lang: s.lang || c.defaultLang, theme: s.theme || c.defaultTheme }));
    },
    setMe(u) {
      const first = !getState().me && !!u;
      set({ me: u });
      if (u && first) {
        // Messages written while offline come back with their clock, even after a restart.
        outboxAll(u.id).then((items) => {
          for (const it of items) {
            if (files.has(it.clientId) || sendExtras.has(it.clientId)) continue;
            if (it.file)
              files.set(it.clientId, {
                file: it.file,
                kind: it.fileKind,
                name: it.fileName,
                compress: it.compress,
              });
            if (it.kind || it.once) sendExtras.set(it.clientId, { kind: it.kind, once: it.once });
            const localUrl =
              it.file && /^(image|video)/.test(it.file.type)
                ? URL.createObjectURL(it.file)
                : undefined;
            const m = { ...it.message, pending: true, failed: false, localUrl };
            set((st) => {
              const l = st.messages[it.chatId];
              if (l?.some((x) => x.clientId === it.clientId)) return {};
              return { messages: { ...st.messages, [it.chatId]: [...(l || []), m] } };
            });
          }
          if (getState().connected) getState().flushOutbox();
        });
        cacheGet<Record<number, string>>(`drafts:${u.id}`).then((d) => {
          if (d) set((st) => ({ drafts: { ...d, ...st.drafts } }));
        });
      }
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
            getMessages(me.id, id, keepPerChat() || 200).then((cached) => {
              if (cached.length && !getState().messages[id])
                set((st) => ({ messages: { ...st.messages, [id]: cached } }));
            });
          }
          s.loadMessages(id).catch(() => {
            /* offline: the local copy is shown */
          });
        }
        s.loadPins(id);
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
      remember(m);
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
          : opts.original
            ? "file"
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
      files.set(cid, {
        file,
        kind: opts.original ? "file" : opts.kind,
        name,
        compress: kind === "image",
      });
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
      if (opts.once) sendExtras.set(cid, { once: true });
      patchMessages(chatId, (l) => [...l, m]);
      remember(m);
      doSend(chatId, m);
    },
    sendLocked(chatId, envelope, file, replyTo) {
      const me = getState().me!;
      const cid = clientId();
      sendExtras.set(cid, { kind: "locked" });
      if (file) files.set(cid, { file, kind: "file", name: "locked.bin" });
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
        kind: "locked",
        text: envelope,
        media: file
          ? {
              id: "",
              kind: "file",
              mime: "application/octet-stream",
              name: "locked.bin",
              size: file.size,
            }
          : undefined,
        replyTo: replyTo?.id,
        createdAt: Date.now(),
        clientId: cid,
        pending: true,
        progress: file ? 0 : undefined,
      };
      patchMessages(chatId, (l) => [...l, m]);
      remember(m);
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
    markMediaExpired(mediaId) {
      for (const [cid, list] of Object.entries(getState().messages)) {
        if (list.some((m) => m.media?.id === mediaId))
          patchMessages(Number(cid), (l) =>
            l.map((m) =>
              m.media?.id === mediaId ? { ...m, media: { ...m.media, expired: true } } : m,
            ),
          );
      }
    },
    applyDelete(chatId, id, lastMessageId) {
      const me = getState().me;
      if (me) deleteMessages(me.id, [id]);
      if (getState().messages[chatId]) patchMessages(chatId, (l) => l.filter((x) => x.id !== id));
      if (getState().pins[chatId]?.some((p) => p.id === id))
        set((st) => ({
          pins: { ...st.pins, [chatId]: st.pins[chatId].filter((p) => p.id !== id) },
        }));
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
      const me = getState().me;
      if (me) cacheSetLater(`drafts:${me.id}`, () => getState().drafts, 600);
    },

    async syncNow() {
      const me = getState().me;
      if (!me || syncing) return;
      syncing = true;
      try {
        let cursor = readCursor(me.id);
        for (let round = 0; round < 10; round++) {
          const q = cursor ? `?msg=${cursor.msg}&ev=${cursor.ev}` : "";
          const res = await get<{
            messages: Message[];
            events: {
              id: number;
              chatId: number;
              kind: string;
              messageId?: number;
              userId?: number;
              message?: Message;
              data?: unknown;
            }[];
            cursor: { msg: number; ev: number };
            more?: boolean;
            reset?: boolean;
          }>(`/api/sync${q}`);
          if (res.reset) getState().markAllStale();
          const s = getState();
          for (const m of res.messages) s.applyMessage(m);
          for (const e of res.events) {
            if (e.kind === "edit" && e.message) s.applyEdit(e.message);
            else if (e.kind === "delete" && e.messageId) s.applyDelete(e.chatId, e.messageId, 0);
            else if (e.kind === "read" && e.userId && e.messageId)
              s.applyRead(e.chatId, e.userId, e.messageId);
            else if (e.kind === "reaction" && e.messageId)
              s.applyReactions(e.chatId, e.messageId, (e.data as Reaction[]) || []);
            else if (e.kind === "ttl")
              s.applyTTL(e.chatId, (e.data as { id: number; destroyAt: number }[]) || []);
            else if (e.kind === "pin" && s.activeChatId === e.chatId) s.loadPins(e.chatId);
          }
          cursor = res.cursor;
          writeCursor(me.id, cursor);
          if (!res.more) break;
        }
      } catch {
        // Fall back to reloading what is on screen.
        getState().markAllStale();
      } finally {
        syncing = false;
      }
    },

    async flushOutbox() {
      const me = getState().me;
      if (!me || flushing) return;
      flushing = true;
      try {
        const items = await outboxAll(me.id);
        for (const it of items) {
          const m = (getState().messages[it.chatId] || []).find((x) => x.clientId === it.clientId);
          if (!m || !getState().connected) continue;
          await doSend(it.chatId, { ...m, pending: true, failed: false });
        }
      } finally {
        flushing = false;
      }
    },

    async prefetchRecent() {
      const s = getState();
      const me = s.me;
      if (!me || keepPerChat() <= 0) return;
      const recent = Object.values(s.chats)
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        .slice(0, 30);
      const thumbs = new Set<string>();
      for (const c of recent) {
        if (c.avatar) thumbs.add(c.avatar);
        if (c.peer?.avatar) thumbs.add(c.peer.avatar);
      }
      for (const c of recent) {
        if (!getState().connected) return;
        const loaded = getState().messages[c.id];
        if (!loaded || getState().stale[c.id]) {
          try {
            const res = await get<{ messages: Message[] }>(`/api/chats/${c.id}/messages?limit=50`);
            await putMessages(me.id, res.messages);
            for (const m of res.messages) {
              if (m.media?.hasThumb && !m.once) thumbs.add(m.media.id);
              if (m.sender.avatar) thumbs.add(m.sender.avatar);
            }
          } catch {
            return;
          }
        }
      }
      // Warm the media cache (through the service worker) with small previews and photos.
      for (const id of thumbs) {
        if (!getState().connected) return;
        await fetch(`/media/${id}/thumb`).catch(() => {});
      }
    },

    applyReactions(chatId, messageId, reactions) {
      if (getState().messages[chatId])
        patchMessages(chatId, (l) => l.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    },

    applyTTL(chatId, items) {
      const at = new Map(items.map((i) => [i.id, i.destroyAt]));
      if (getState().messages[chatId])
        patchMessages(chatId, (l) =>
          l.map((m) => (at.has(m.id) ? { ...m, destroyAt: at.get(m.id) } : m)),
        );
    },

    async loadPins(chatId) {
      try {
        const list = await get<Message[]>(`/api/chats/${chatId}/pins`);
        set((st) => ({ pins: { ...st.pins, [chatId]: list } }));
      } catch {
        /* offline: keep what we had */
      }
    },
  };
});

export const sortedChats = (chats: Record<number, Chat>) =>
  Object.values(chats).sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.lastMessageAt - a.lastMessageAt || b.id - a.id,
  );
