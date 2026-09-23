// Musazo sin conexión: primero la red y, si no hay, lo último que se guardó.
// Así el contador funciona en la calle aunque no haya cobertura.
const CACHE = 'musazo-v2';
// Rutas relativas a este archivo: sirve igual en la raíz que en /Musazo/ (GitHub Pages)
const HOME = new URL('./', self.location).href;
const SHELL = ['./', 'felt.jpg', 'logo-light.png', 'logo-dark.png', 'favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'].map(
  (p) => new URL(p, self.location).href,
);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match(HOME) : Response.error())),
      ),
  );
});
