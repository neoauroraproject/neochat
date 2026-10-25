import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface NeoChatDb extends DBSchema {
  identity: {
    key: string;
    value: string;
  };
  ratchetSessions: {
    key: string;
    value: string;
  };
  senderKeys: {
    key: string;
    value: string;
  };
  senderKeyReceivers: {
    key: string;
    value: string;
  };
  decryptedMessages: {
    key: string;
    value: { messageId: string; chatId: string; plaintext: string; updatedAt: string };
  };
  outbox: {
    key: string;
    value: {
      id: string;
      chatId: string;
      payload: string;
      createdAt: string;
      retries: number;
    };
    indexes: { byChat: string };
  };
  drafts: {
    key: string;
    value: { chatId: string; ciphertext: string; updatedAt: string };
  };
}

const DB_NAME = "neochat-web";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NeoChatDb>> | null = null;

export function getDb(): Promise<IDBPDatabase<NeoChatDb>> {
  dbPromise ??= openDB<NeoChatDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("identity");
      db.createObjectStore("ratchetSessions");
      db.createObjectStore("senderKeys");
      db.createObjectStore("senderKeyReceivers");
      db.createObjectStore("decryptedMessages");
      const outbox = db.createObjectStore("outbox", { keyPath: "id" });
      outbox.createIndex("byChat", "chatId");
      db.createObjectStore("drafts", { keyPath: "chatId" });
    },
  });
  return dbPromise;
}

type StoreName =
  | "identity"
  | "ratchetSessions"
  | "senderKeys"
  | "senderKeyReceivers"
  | "decryptedMessages"
  | "outbox"
  | "drafts";

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get(store, key)) as T | undefined;
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put(store, value as never, key);
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await getDb();
  await db.delete(store, key);
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDb();
  return (await db.getAll(store)) as T[];
}
