import { post } from "./api";
import type { Ad } from "./types";

export const COPYRIGHT = "© 2026 NeoAurora. All rights reserved.";

/** Click URL: counted by our server, which also reports network ad clicks to NeoAurora (queued when offline). */
export function adHref(ad: Ad): string | undefined {
  if (!ad.link) return undefined;
  return typeof ad.id === "string"
    ? `/go/net/${encodeURIComponent(ad.id.replace(/^net:/, ""))}`
    : `/go/ad/${ad.id}`;
}

export const adTarget = (ad: Ad) => (ad.link.startsWith("/") ? undefined : "_blank");

const seen = new Set<Ad["id"]>();
export function trackImpression(ad: Ad) {
  if (seen.has(ad.id) || typeof ad.id !== "number") return;
  seen.add(ad.id);
  post(`/api/ads/${ad.id}/impression`).catch(() => {});
}

type Placement = "chatlist" | "channel" | "sidebar" | "chattop" | "admin";

/** Ads for a spot; "all" ads fill the main spots but not the small desktop/admin cards. */
export const adsFor = (ads: Ad[], placement: Placement) =>
  ads.filter(
    (a) =>
      a.placement === placement ||
      (a.placement === "all" && placement !== "sidebar" && placement !== "admin"),
  );

const CHATTOP_KEY = "neochat.chattop";
const CHATTOP_GAP = 30 * 60_000; // at most one banner every 30 minutes
const CHATTOP_SNOOZE = 3 * 3600_000; // closing it hides banners for 3 hours

function readTop(): { shownAt: number; closedAt: number; idx: number } {
  try {
    return {
      shownAt: 0,
      closedAt: 0,
      idx: 0,
      ...JSON.parse(localStorage.getItem(CHATTOP_KEY) || "{}"),
    };
  } catch {
    return { shownAt: 0, closedAt: 0, idx: 0 };
  }
}
function writeTop(v: ReturnType<typeof readTop>) {
  try {
    localStorage.setItem(CHATTOP_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Picks the next in-chat banner if the frequency cap allows it, Telegram-style: occasional, never pushy. */
export function nextChatTopAd(ads: Ad[]): Ad | null {
  const pool = adsFor(ads, "chattop");
  if (!pool.length) return null;
  const st = readTop();
  const now = Date.now();
  if (now - st.closedAt < CHATTOP_SNOOZE || now - st.shownAt < CHATTOP_GAP) return null;
  const ad = pool[st.idx % pool.length];
  writeTop({ ...st, shownAt: now, idx: st.idx + 1 });
  return ad;
}

export function closeChatTopAd() {
  writeTop({ ...readTop(), closedAt: Date.now() });
}
