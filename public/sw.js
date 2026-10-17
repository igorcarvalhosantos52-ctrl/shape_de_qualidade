const C = "sq-v22", ASSETS = ["/", "/index.html", "/shim.js", "/app.js", "/glue.js", "/baixar.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/audio/clips.js", "/audio/silence.mp3", "/audio/teste.mp3", "/teste-voz"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
// rede primeiro (sempre a versão nova); cache só quando estiver offline. A API nunca é cacheada, inclusive /api/cards, /api/tutoriais e /api/ebook.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/") || u.pathname.startsWith("/admin")) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); if (r.ok) caches.open(C).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("/index.html"))));
});
