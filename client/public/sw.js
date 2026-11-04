// NeoChat service worker: the app shell and every code chunk offline, a media cache that keeps
// what was used most recently within a size budget, video seeking from that cache, and updates
// that wait for the user instead of swapping the app mid-conversation.
//
// The build replaces the two placeholders below (see vite.config.ts): the build id, so every
// release is a new worker, and the list of files to keep offline.
const BUILD = "__BUILD__";
const PRECACHE = []; /*__PRECACHE__*/

const SHELL = "neochat-shell-v1";
const ASSETS = "neochat-assets-v1";
const MEDIA = "neochat-media-v1";
const META_URL = "/__neochat/media-meta";

// Media cache budget: settable from Settings → Storage & data; a share of the free space by default.
let maxBytes = 0;
let maxAgeDays = 0; // 0 = keep until the budget needs room

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.addAll(["/", "/icon.svg"]).catch(() => {});
      // Every chunk of this build, so screens that load later open offline too.
      const assets = await caches.open(ASSETS);
      await Promise.all(PRECACHE.map((u) => assets.add(u).catch(() => {})));
      // The very first install takes over at once; later ones wait for "reload" in the app.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  const keep = [SHELL, ASSETS, MEDIA];
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
      // Chunks of older builds are dropped; the current ones stay.
      if (PRECACHE.length) {
        const assets = await caches.open(ASSETS);
        const wanted = new Set(PRECACHE.map((u) => new URL(u, self.location.origin).href));
        for (const req of await assets.keys()) if (!wanted.has(req.url)) await assets.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "skip-waiting") self.skipWaiting();
  if (d.type === "media-settings") {
    maxAgeDays = Number(d.maxAgeDays) || 0;
    if (d.maxBytes) maxBytes = Number(d.maxBytes);
    e.waitUntil(trimMedia());
  }
  if (d.type === "build" && e.source) e.source.postMessage({ type: "build", build: BUILD });
  // Settings → Storage & data: sizes per kind, and clearing one kind.
  if (d.type === "media-stats" && e.ports[0])
    e.waitUntil(mediaStats().then((r) => e.ports[0].postMessage(r)));
  if (d.type === "media-clear" && e.ports[0])
    e.waitUntil(
      clearKind(d.kind)
        .then(() => mediaStats())
        .then((r) => e.ports[0].postMessage(r)),
    );
});

async function mediaStats() {
  const m = await loadMeta();
  const out = {
    image: 0,
    video: 0,
    audio: 0,
    file: 0,
    count: 0,
    budget: await budget(),
    maxAgeDays,
  };
  for (const v of Object.values(m)) {
    out[v.type] = (out[v.type] || 0) + (v.size || 0);
    out.count++;
  }
  return out;
}

async function clearKind(kind) {
  const m = await loadMeta();
  const c = await caches.open(MEDIA);
  for (const [url, v] of Object.entries(m)) {
    if (kind === "all" || v.type === kind) {
      await c.delete(url);
      delete m[url];
    }
  }
  saveMetaLater();
}

// --- media metadata: size, type and last use of every cached file -------------------------------

let meta = null; // { [url]: { size, type, at } }
let metaDirty = false;

async function loadMeta() {
  if (meta) return meta;
  try {
    const c = await caches.open(MEDIA);
    const hit = await c.match(META_URL);
    meta = hit ? await hit.json() : {};
  } catch {
    meta = {};
  }
  return meta;
}

function saveMetaLater() {
  if (metaDirty) return;
  metaDirty = true;
  setTimeout(async () => {
    metaDirty = false;
    try {
      const c = await caches.open(MEDIA);
      await c.put(
        META_URL,
        new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }),
      );
    } catch {
      /* the next write tries again */
    }
  }, 2000);
}

async function budget() {
  if (maxBytes) return maxBytes;
  try {
    const est = await navigator.storage.estimate();
    // Up to a third of what the browser grants, between 200 MB and 4 GB.
    return Math.min(4 << 30, Math.max(200 << 20, (est.quota || 0) / 3));
  } catch {
    return 500 << 20;
  }
}

/** Least recently used files go first when the cache is over its size budget or too old. */
async function trimMedia() {
  const m = await loadMeta();
  const c = await caches.open(MEDIA);
  const limit = await budget();
  const entries = Object.entries(m).sort((a, b) => a[1].at - b[1].at);
  let total = entries.reduce((n, [, v]) => n + (v.size || 0), 0);
  const tooOld = maxAgeDays ? Date.now() - maxAgeDays * 86400000 : 0;
  for (const [url, v] of entries) {
    if (total <= limit && v.at >= tooOld) break;
    await c.delete(url);
    delete m[url];
    total -= v.size || 0;
  }
  saveMetaLater();
}

function kindOf(type) {
  if (!type) return "file";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

async function touch(url, res) {
  const m = await loadMeta();
  const size = Number(res.headers.get("content-length")) || (m[url] && m[url].size) || 0;
  m[url] = { size, type: kindOf(res.headers.get("content-type") || ""), at: Date.now() };
  saveMetaLater();
}

async function mediaFirst(req) {
  const c = await caches.open(MEDIA);
  const key = new URL(req.url);
  key.search = "";
  const hit = await c.match(key.href);
  if (hit) {
    touch(key.href, hit);
    return hit;
  }
  const res = await fetch(req);
  if (res.ok && res.status === 200) {
    await c.put(key.href, res.clone());
    await touch(key.href, res);
    trimMedia();
  }
  return res;
}

/** Answers a Range request (video seeking) from a fully cached file, so videos play offline. */
async function rangeFromCache(req) {
  const c = await caches.open(MEDIA);
  const key = new URL(req.url);
  key.search = "";
  const hit = await c.match(key.href);
  if (!hit) return fetch(req);
  touch(key.href, hit);
  const blob = await hit.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  const size = blob.size;
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  if (start >= size || end < start) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": hit.headers.get("content-type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone());
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
    // Downloads to disk (?dl=1) and view-once media (?once=1) never enter the cache.
    if (url.searchParams.has("dl") || url.searchParams.has("once")) return;
    if (req.headers.has("range")) {
      e.respondWith(rangeFromCache(req));
      return;
    }
    e.respondWith(mediaFirst(req));
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
        // An incoming call stays on screen and buzzes like a ringtone until it is handled.
        requireInteraction: !!d.ring,
        vibrate: d.ring ? [400, 200, 400, 200, 400, 200, 400] : undefined,
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
