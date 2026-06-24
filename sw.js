const CACHE = 'japan-v6';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './places.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      // Return cached version if found
      if (cached) return cached;
      // Otherwise fetch from network
      return fetch(e.request).then(res => {
        // Cache the new response if it's a GET request to our origin
        if (e.request.method === 'GET' && e.request.url.startsWith(self.location.origin)) {
           const resClone = res.clone();
           caches.open(CACHE).then(c => c.put(e.request, resClone));
        }
        return res;
      });
    })
  );
});