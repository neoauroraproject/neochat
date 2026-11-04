import type { Message } from "./types";

/**
 * The phone's own copy of the conversations (IndexedDB, one database per account):
 *  - messages: one record per message, indexed by chat and id, so a chat opens without the
 *    network, history can be long, and text can be searched offline;
 *  - outbox: messages written while offline (with their files) until the server has them.
 * The first open moves the per-chat arrays of the old key-value cache over.
 */
export interface OutboxItem {
  clientId: string;
  chatId: number;
  createdAt: number;
  text: string;
  replyTo?: number;
  kind?: string; // "locked"
  once?: boolean;
  file?: Blob;
  fileName?: string;
  fileKind?: string; // upload kind: voice | file
  compress?: boolean;
  /** The optimistic message as shown in the chat, restored after the app restarts. */
  message: Message;
}

let current: { uid: number; db: Promise<IDBDatabase | null> } | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function openFor(uid: number): Promise<IDBDatabase | null> {
  if (current?.uid === uid) return current.db;
  const db = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const r = indexedDB.open(`neochat-u${uid}`, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        const m = d.createObjectStore("messages", { keyPath: "id" });
        m.createIndex("chat", ["chatId", "id"]);
        d.createObjectStore("outbox", { keyPath: "clientId" });
      };
      r.onsuccess = () => {
        resolve(r.result);
        migrateOld(uid, r.result);
      };
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  current = { uid, db };
  return db;
}

/** Moves `msgs:<uid>:<chat>` arrays of the old key-value cache into the message store. */
async function migrateOld(uid: number, db: IDBDatabase) {
  try {
    const kv = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("neochat", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const prefix = `msgs:${uid}:`;
    const keys = (await req(kv.transaction("kv").objectStore("kv").getAllKeys())) as string[];
    const old = keys.filter((k) => typeof k === "string" && k.startsWith(prefix));
    for (const k of old) {
      const list = (await req(kv.transaction("kv").objectStore("kv").get(k))) as
        Message[] | undefined;
      if (list?.length) await putMessages(uid, list, db);
      const t = kv.transaction("kv", "readwrite");
      t.objectStore("kv").delete(k);
      await done(t);
    }
    kv.close();
  } catch {
    /* nothing to move */
  }
}

/** Saves messages (only real ones, with a server id). */
export async function putMessages(uid: number, list: Message[], dbIn?: IDBDatabase | null) {
  const db = dbIn ?? (await openFor(uid));
  if (!db || !list.length) return;
  try {
    const t = db.transaction("messages", "readwrite");
    const st = t.objectStore("messages");
    for (const m of list) {
      if (m.id > 0) {
        // Client-only fields (blob URLs, upload progress) are not stored.
        const { localUrl: _u, pending: _p, progress: _g, failed: _f, ...rest } = m;
        void _u;
        void _p;
        void _g;
        void _f;
        st.put(rest);
      }
    }
    await done(t);
  } catch {
    /* quota or private mode: the network still works */
  }
}

export async function deleteMessages(uid: number, ids: number[]) {
  const db = await openFor(uid);
  if (!db || !ids.length) return;
  try {
    const t = db.transaction("messages", "readwrite");
    for (const id of ids) t.objectStore("messages").delete(id);
    await done(t);
  } catch {
    /* ignore */
  }
}

/** The newest `limit` messages of a chat, oldest first. */
export async function getMessages(uid: number, chatId: number, limit: number): Promise<Message[]> {
  const db = await openFor(uid);
  if (!db) return [];
  try {
    const idx = db.transaction("messages").objectStore("messages").index("chat");
    const range = IDBKeyRange.bound([chatId, 0], [chatId, Number.MAX_SAFE_INTEGER]);
    const out: Message[] = [];
    await new Promise<void>((resolve, reject) => {
      const c = idx.openCursor(range, "prev");
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur || out.length >= limit) return resolve();
        out.push(cur.value as Message);
        cur.continue();
      };
      c.onerror = () => reject(c.error);
    });
    return out.reverse();
  } catch {
    return [];
  }
}

/** Keeps at most `keep` messages per chat so the phone's copy cannot grow without bound. */
export async function trimChat(uid: number, chatId: number, keep: number) {
  const db = await openFor(uid);
  if (!db || keep <= 0) return;
  try {
    const t = db.transaction("messages", "readwrite");
    const idx = t.objectStore("messages").index("chat");
    const range = IDBKeyRange.bound([chatId, 0], [chatId, Number.MAX_SAFE_INTEGER]);
    let n = 0;
    const c = idx.openCursor(range, "prev");
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      if (++n > keep) cur.delete();
      cur.continue();
    };
    await done(t);
  } catch {
    /* ignore */
  }
}

/** Offline search in message text, newest first. */
export async function searchMessages(uid: number, q: string, limit = 40): Promise<Message[]> {
  const db = await openFor(uid);
  const needle = q.trim().toLowerCase();
  if (!db || needle.length < 2) return [];
  const out: Message[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const c = db.transaction("messages").objectStore("messages").openCursor(null, "prev");
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur || out.length >= limit) return resolve();
        const m = cur.value as Message;
        if (
          m.kind !== "locked" &&
          m.kind !== "call" &&
          m.kind !== "system" &&
          m.text?.toLowerCase().includes(needle)
        )
          out.push(m);
        cur.continue();
      };
      c.onerror = () => reject(c.error);
    });
  } catch {
    /* ignore */
  }
  return out;
}

// --- outbox ---------------------------------------------------------------------------------

export async function outboxPut(uid: number, item: OutboxItem) {
  const db = await openFor(uid);
  if (!db) return;
  try {
    const t = db.transaction("outbox", "readwrite");
    t.objectStore("outbox").put(item);
    await done(t);
  } catch {
    // Some browsers cannot store files in IndexedDB; keep the text part at least.
    if (item.file) outboxPut(uid, { ...item, file: undefined });
  }
}

export async function outboxDelete(uid: number, clientId: string) {
  const db = await openFor(uid);
  if (!db) return;
  try {
    const t = db.transaction("outbox", "readwrite");
    t.objectStore("outbox").delete(clientId);
    await done(t);
  } catch {
    /* ignore */
  }
}

export async function outboxAll(uid: number): Promise<OutboxItem[]> {
  const db = await openFor(uid);
  if (!db) return [];
  try {
    const all = (await req(
      db.transaction("outbox").objectStore("outbox").getAll(),
    )) as OutboxItem[];
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** Removes this account's local copy (sign-out, "clear local data"). */
export async function dropLocal(uid: number) {
  if (current?.uid === uid) {
    (await current.db)?.close();
    current = null;
  }
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(`neochat-u${uid}`);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
