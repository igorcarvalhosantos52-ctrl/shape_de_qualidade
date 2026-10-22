const C = "sq-v38", ASSETS = ["/", "/index.html", "/shim.js", "/voz.js", "/app.js", "/glue.js", "/baixar.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/audio/clips.js", "/audio/silence.mp3", "/audio/teste.mp3", "/teste-voz"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
// rede primeiro (sempre a versão nova); cache só quando estiver offline. A API nunca é cacheada, inclusive /api/cards, /api/tutoriais e /api/ebook. Os mp4 de exercício ficam fora do pré-cache e também deste fetch, para o iPhone pedir o arquivo direto ao servidor.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/admin") || u.pathname.startsWith("/videos/")) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r && r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)).catch(() => {}); }
      return r;
    } catch (err) {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      if (e.request.mode === "navigate" || u.pathname === "/") {
        const home = await caches.match("/") || await caches.match("/index.html");
        if (home) return home;
      }
      return new Response("", { status: 504, statusText: "offline" });
    }
  })());
});
