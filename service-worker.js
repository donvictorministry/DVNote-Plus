const CACHE_NAME = 'dv-note-plus-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './bible.js',
  './kjv.json',
  './manifest.webmanifest',
  './icon16.png',
  './icon48.png',
  './icon128.png',
  './icon192.png',
  './icon512.png',
  './og-image.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // One missing file can no longer break the whole install
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // ignoreSearch keeps the app working offline when opened with API URL parameters
    caches.match(e.request, { ignoreSearch: true }).then((cached) =>
      cached || fetch(e.request).catch(() =>
        e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
      )
    )
  );
});