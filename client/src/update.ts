import { create } from "zustand";

/**
 * Service worker life cycle seen from the app. A new version installs in the background and
 * waits; the app shows "A new version is ready · Reload" instead of changing under the user
 * mid-conversation. Also passes the media cache settings to the worker and asks the browser to
 * keep our data when the phone runs low on space.
 */
export const useUpdate = create<{ ready: boolean }>(() => ({ ready: false }));

let waiting: ServiceWorker | null = null;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  const sw = navigator.serviceWorker;
  window.addEventListener("load", async () => {
    let reg: ServiceWorkerRegistration;
    try {
      reg = await sw.register("/sw.js");
    } catch {
      return;
    }
    const offer = (w: ServiceWorker | null) => {
      if (!w || !sw.controller) return; // first install: nothing to replace
      waiting = w;
      useUpdate.setState({ ready: true });
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => w.state === "installed" && offer(w));
    });
    // Look for a new version when the app comes back to the screen, and every half hour.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
    window.setInterval(() => reg.update().catch(() => {}), 30 * 60_000);
    sendMediaSettings();
  });
  let reloading = false;
  sw.addEventListener("controllerchange", () => {
    if (!waiting || reloading) return;
    reloading = true;
    location.reload();
  });
}

export function applyUpdate() {
  if (waiting) waiting.postMessage({ type: "skip-waiting" });
  else location.reload();
}

// --- media cache settings ------------------------------------------------------------------

const KEY = "neochat.mediaKeepDays";

export function mediaKeepDays(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setMediaKeepDays(days: number) {
  try {
    localStorage.setItem(KEY, String(days));
  } catch {
    /* private mode */
  }
  sendMediaSettings();
}

function sendMediaSettings() {
  navigator.serviceWorker?.ready
    .then((r) => r.active?.postMessage({ type: "media-settings", maxAgeDays: mediaKeepDays() }))
    .catch(() => {});
}

export interface MediaStats {
  image: number;
  video: number;
  audio: number;
  file: number;
  count: number;
  budget: number;
  maxAgeDays: number;
}

function ask<T>(msg: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    const ctl = navigator.serviceWorker?.controller;
    if (!ctl) return resolve(null);
    const ch = new MessageChannel();
    const t = window.setTimeout(() => resolve(null), 4000);
    ch.port1.onmessage = (e) => {
      window.clearTimeout(t);
      resolve(e.data as T);
    };
    ctl.postMessage(msg, [ch.port2]);
  });
}

export const mediaStats = () => ask<MediaStats>({ type: "media-stats" });
export const clearMedia = (kind: "image" | "video" | "audio" | "file" | "all") =>
  ask<MediaStats>({ type: "media-clear", kind });

/** Asks the browser not to evict our data under storage pressure (shown in Settings). */
export async function persistStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
