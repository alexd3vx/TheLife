// TheLife service worker: keeps the game's own files on the device so it opens fast and starts offline. Playing still needs the internet
// (your life lives on the server). Nothing about the player is stored here, only the app's files.
const SHELL = "thelife-shell-v2";
const FILES = "thelife-files-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, fonts and the game server go straight to the network
  if (url.pathname === "/version.json" || url.pathname.startsWith("/server/") || url.pathname.startsWith("/deploy/") || url.pathname === "/sw.js") return;

  // Opening the app: the network first (so a new version shows up), the saved page when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  // The list of game files changes with every release (new animations, models): the network first, the saved copy only when offline.
  if (url.pathname === "/assets/manifest.json") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(FILES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || Response.error())),
    );
    return;
  }

  // The game's scripts, styles, models and pictures: the saved copy first, filled in from the network the first time.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".webmanifest"))) {
            const copy = res.clone();
            caches.open(FILES).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
