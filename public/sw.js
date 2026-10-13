/* Service worker: funciona sin conexión para consulta (páginas visitadas) y encola fotos para subirlas al volver la señal. */
const CACHE = 'mf-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static') || url.pathname === '/icon.svg') {
    e.respondWith(caches.open(CACHE).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); c.put(req, res.clone()); return res; }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(async () => (await caches.match(req)) || new Response('<meta charset=utf-8><body style="font-family:system-ui;padding:2rem"><h2>Sin conexión</h2><p>Esta página aún no se ha visitado. Las fotos tomadas se guardan y se suben solas al volver la señal.</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } })));
  }
});
