// Bump VERSION (and the ?v= on style.css/app.js in index.html) when app shell files change.
const VERSION = 'v5';
const SHELL = [
  './', 'index.html', 'style.css?v=5', 'app.js?v=5', 'vendor/pinyin-pro.js',
  'manifest.webmanifest', 'icons/icon-192.png?v=4', 'icons/icon-512.png?v=4', 'icons/apple-touch-icon.png?v=4',
];
const DATA = ['data/books.json', 'data/series.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([...SHELL, ...DATA])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Data: network first so family always sees the newest catalog; fall back to cache offline.
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request)),
    );
    return;
  }

  // App shell: stale-while-revalidate.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
