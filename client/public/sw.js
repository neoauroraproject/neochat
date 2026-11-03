// NeoChat service worker: offline app shell + long-lived media cache.
const SHELL = "neochat-shell-v1";
const ASSETS = "neochat-assets-v1";
const MEDIA = "neochat-media-v1";
const MAX_MEDIA = 600;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  const keep = [SHELL, ASSETS, MEDIA];
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) {
    cache.put(req, res.clone());
    if (cacheName === MEDIA) trim(MEDIA, MAX_MEDIA);
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/api/") || p.startsWith("/go/") || p === "/sw.js") return;

  if (p.startsWith("/media/")) {
    // Range requests (video seeking) go straight to the network.
    if (req.headers.has("range")) return;
    e.respondWith(cacheFirst(req, MEDIA));
    return;
  }
  if (p.startsWith("/assets/")) {
    e.respondWith(cacheFirst(req, ASSETS));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});

// Web Push: the server sends {title, body, chatId, tag}, encrypted for this device.
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Chrome and Firefox let us skip the banner while the app is on screen. Safari drops
      // subscriptions whose pushes show nothing, so there it always appears.
      const ua = navigator.userAgent;
      const safari = /Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua);
      if (!safari && wins.some((w) => w.focused && w.visibilityState === "visible")) return;
      await self.registration.showNotification(d.title || "NeoChat", {
        body: d.body || "",
        tag: d.tag,
        renotify: !!d.tag,
        icon: "/icon.svg",
        data: { chatId: d.chatId },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const chatId = e.notification.data && e.notification.data.chatId;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.length) {
        const win = wins.find((w) => w.focused) || wins[0];
        await win.focus();
        win.postMessage({ type: "open-chat", chatId });
        return;
      }
      await self.clients.openWindow(chatId ? `/?chat=${chatId}` : "/");
    })(),
  );
});
