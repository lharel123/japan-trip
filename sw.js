const CACHE = 'japan-v12';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './places.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting(); // activate immediately without waiting for old tabs to close
});

self.addEventListener('activate', e => {
  // take control of all open pages immediately
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (e.request.method === 'GET' && e.request.url.startsWith(self.location.origin)) {
           const resClone = res.clone();
           caches.open(CACHE).then(c => c.put(e.request, resClone));
        }
        return res;
      });
    })
  );
});
