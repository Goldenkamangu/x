// LinkHub service worker — caches the app shell so the page still loads
// with no connection, but always prefers the live network version so
// updates to app.js/index.html/style.css show up immediately instead of
// getting stuck on a stale cached copy.

const CACHE_NAME = 'linkhub-shell-v7'; // v7: offline start (own database-connector.js), slow-network fallback
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './database-connector.js',
  './manifest.json',
  './logo.svg',
  './icon-192.png',
  './icon-512.png',
];

// If the network hasn't answered after this long, use the saved copy instead of waiting for a stalled connection.
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // One file failing (for example a missing icon) must not stop everything else from being saved.
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {})))
    )
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

  const isPage = event.request.mode === 'navigate';

  // Network-first: try to get the latest file, but don't wait forever on a bad connection.
  // Falls back to the saved copy when offline or too slow. Pages match even when the address
  // has extra bits such as ?store=... on the end.
  const fromCache = () =>
    caches.match(event.request, { ignoreSearch: true }).then(
      (cached) => cached || (isPage ? caches.match('./index.html') : undefined)
    );

  const network = fetch(event.request).then((response) => {
    if (response && response.status === 200) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(async (cache) => {
        // Keep one saved copy per file, so an old app.js?v=... can't be served ahead of the newest one.
        const saved = await cache.keys();
        await Promise.all(
          saved
            .filter((k) => { const u = new URL(k.url); return u.pathname === url.pathname && u.search !== url.search; })
            .map((k) => cache.delete(k))
        );
        await cache.put(event.request, clone);
      }).catch(() => {});
    }
    return response;
  });

  const slow = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));

  event.respondWith(
    Promise.race([network.catch(() => null), slow])
      .then((response) => response || fromCache())
      .then((response) => response || network) // nothing saved yet: wait for the network after all
  );
});
