// bump this on EVERY shell-asset change - cache-first means returning
// visitors only pick up new css/js when the cache name changes
const CACHE = 'clipstitch-v3';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './fonts/BigShouldersDisplay-800-latin.woff2',
  './fonts/BigShouldersDisplay-800-latin-ext.woff2',
  './fonts/Inter-400-600-latin.woff2',
  './fonts/Inter-400-600-latin-ext.woff2',
  './fonts/DMMono-400-latin.woff2',
  './fonts/DMMono-400-latin-ext.woff2',
  './fonts/DMMono-500-latin.woff2',
  './fonts/DMMono-500-latin-ext.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).catch(() => {
        // only ever hand HTML back for a page navigation, never for assets
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
    )
  );
});
