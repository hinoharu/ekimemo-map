// Service worker: lets the page open without a network (e.g. on a plane, where GPS still works) and keeps
// the GSI base-map tiles the user has looked at. Built into dist/sw.js by scripts/build.py (the BUILD placeholder is
// replaced with a hash of the build, so a new build replaces the old page cache).
//   page itself, lines.json, manifest, icons : network first, the cached copy when offline
//   Leaflet (cdnjs), fonts  : cache first (versioned URLs)
//   GSI tiles (地理院タイル) : cache first, only tiles that were viewed; at most GSI_MAX, renewed after GSI_DAYS
//   OpenStreetMap / OpenRailwayMap tiles: not touched (their policies ask not to keep tiles for offline use;
//   the browser's normal HTTP cache still applies)
const BUILD = "/*BUILD*/";
const SHELL = "shell-" + BUILD, LIB = "lib-v1", GSI = "gsi-tiles-v1";
const GSI_MAX = 3000, GSI_DAYS = 30;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["./", "lines.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"])).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") return e.respondWith(networkFirst(req, "./"));
    if (url.pathname.endsWith("/lines.json")) return e.respondWith(networkFirst(req, "lines.json"));
    if (url.pathname.endsWith(".webmanifest") || url.pathname.includes("/icons/")) return e.respondWith(networkFirst(req, req.url));
    return;
  }
  if (url.hostname === "cdnjs.cloudflare.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com")
    return e.respondWith(cacheFirst(req));
  if (url.hostname === "cyberjapandata.gsi.go.jp" && url.pathname.startsWith("/xyz/")) return e.respondWith(gsiTile(req));
});

// Revalidated with the server every time (cache: "no-cache"; an unchanged file costs a 304): GitHub Pages lets
// browsers keep the page for about 10 minutes, and on iOS a reload right after an update could get that old copy
// from the HTTP cache, so the "new version" bar came up a second time. (A navigation request cannot be re-created
// with other options, so it is fetched by its URL.)
async function networkFirst(req, key) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req.mode === "navigate" ? req.url : req, { cache: "no-cache" });
    if (res.ok) c.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(LIB), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") c.put(req, res.clone());
  return res;
}

// GSI tiles are fetched in CORS mode, so the cache stores real (not opaque, quota-padded) responses.
// If CORS were refused, fall back to the page's own request without caching.
async function gsiTile(req) {
  const c = await caches.open(GSI), hit = await c.match(req.url);
  const fresh = hit && Date.now() - Number(hit.headers.get("x-sw-time") || 0) < GSI_DAYS * 864e5;
  if (fresh) return hit;
  try {
    const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return hit || res;
    const body = await res.blob(), headers = new Headers(res.headers);
    headers.set("x-sw-time", String(Date.now()));
    await c.put(req.url, new Response(body, { status: 200, headers }));
    trim(c);
    return new Response(body, { status: 200, headers });
  } catch (err) {
    if (hit) return hit; // offline: an old tile is better than none
    try { return await fetch(req); } catch (e2) { throw err; }
  }
}

let trimming = false;
async function trim(c) { // keep the newest GSI_MAX tiles (Cache keys are in insertion order)
  if (trimming) return;
  trimming = true;
  try {
    const keys = await c.keys();
    for (let i = 0; i < keys.length - GSI_MAX; i++) await c.delete(keys[i]);
  } finally { trimming = false; }
}

