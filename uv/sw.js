// UV service worker. Raise VERSION when files change.
// Own files: network first (updates land at once), cached copy offline. Fonts: cache first.
// Forecast and place lookups are not cached here; the app keeps its own last forecast.
const VERSION = "uv-v3";
const SHELL = ["./", "./index.html", "./app.js", "./ui.js", "./forecast.js", "./exposure.js", "./solar.js", "./store.js", "./charts.js", "./tokens.css", "./app.css", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("uv-") && k !== VERSION && k !== "uv-fonts").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open("uv-fonts").then(async (c) => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }));
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.includes("/uv/")) return;
  const key = req.mode === "navigate" ? "./index.html" : req;
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); } return res; })
    .catch(() => caches.match(key, { ignoreSearch: true })));
});
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow("./")))); });
