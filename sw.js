// LinkHub service worker — caches the app shell so the page still loads
// with no connection, but always prefers the live network version so
// updates to app.js/index.html/style.css show up immediately instead of
// getting stuck on a stale cached copy.

const CACHE_NAME = 'linkhub-shell-v3'; // bumped to purge the old (stale) cache
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache Supabase or Groq calls — listings/search must always be live.
  if (url.hostname.includes('supabase.co') || url.hostname.includes('groq.com')) {
    return;
  }

  // Only handle same-origin GET requests for the app shell.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Network-first: always try to get the latest file. Only fall back to the
  // cached copy if the network request fails entirely (e.g. offline).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
