import { useEffect, useState } from "react";
import { get } from "../api";
import type { User } from "../types";
import { useApp } from "../store";

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatch(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return match;
}

export const useMobile = () => useMedia("(max-width: 760px)");

/** People the user talks to, online first — refreshed on presence changes. */
export function useContacts() {
  const [list, setList] = useState<User[]>([]);
  const chats = useApp((s) => s.chats);
  const directCount = Object.values(chats).filter((c) => c.type === "direct").length;
  useEffect(() => {
    get<User[]>("/api/contacts")
      .then(setList)
      .catch(() => {});
  }, [directCount]);
  // keep presence fresh from chat peers (which receive realtime presence events)
  const peers = new Map<number, User>();
  for (const c of Object.values(chats)) if (c.peer) peers.set(c.peer.id, c.peer);
  return list
    .map((u) => ({ ...u, ...(peers.get(u.id) || {}) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);
}

/** Re-render every `ms` so relative times ("5 minutes ago", call timers) stay current. */
export function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
