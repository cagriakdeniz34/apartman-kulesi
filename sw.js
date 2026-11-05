// Service worker: precaches the whole game so it runs offline after the first visit.
// IMPORTANT: bump CACHE_VERSION whenever any file below changes, otherwise
// installed players keep getting the old cached copy.
const CACHE_VERSION = 'v4';
const CACHE_NAME = `apartman-kulesi-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/config.js',
  './src/utils.js',
  './src/audio.js',
  './src/render.js',
  './src/crane.js',
  './src/tower.js',
  './src/city.js',
  './src/share.js',
  './src/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('apartman-kulesi-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first: everything the game needs is precached; anything else goes to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        // Offline and not cached: page navigations fall back to the game itself.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
