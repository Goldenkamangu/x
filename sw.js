// LinkHub service worker — caches the app shell while always preferring
// the live network version. It also injects the small compatibility layer
// after app.js so the live /x site gets the store/image fixes without
// replacing the main application file.

const CACHE_NAME = 'linkhub-shell-v7';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './linkhub-fixes.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
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

function isAppHtml(request, url) {
  return request.method === 'GET' &&
    url.origin === self.location.origin &&
    (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/x/') || url.pathname.endsWith('/x'));
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

async function fetchHtmlWithFix(request) {
  try {
    const response = await fetch(request);
    if (!response || response.status !== 200) return response;

    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    const html = await response.text();
    if (html.includes('linkhub-fixes.js')) {
      return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
    }

    const injected = html.replace(
      '</body>',
      '<script type="module" src="./linkhub-fixes.js?v=20260906"></script></body>'
    );

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'text/html; charset=UTF-8');

    const finalResponse = new Response(injected, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

    caches.open(CACHE_NAME).then((cache) => cache.put(request, finalResponse.clone())).catch(() => {});
    return finalResponse;
  } catch {
    const cached = await caches.match(request);
    if (!cached) return fetch(request);

    const type = cached.headers.get('content-type') || '';
    if (!type.includes('text/html')) return cached;

    const html = await cached.text();
    const injected = html.includes('linkhub-fixes.js')
      ? html
      : html.replace('</body>', '<script type="module" src="./linkhub-fixes.js?v=20260906"></script></body>');
    const headers = new Headers(cached.headers);
    headers.delete('content-length');
    headers.set('content-type', 'text/html; charset=UTF-8');
    return new Response(injected, { status: cached.status, statusText: cached.statusText, headers });
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Supabase or Groq requests: listings, stores, AI search,
  // and image URLs must remain live.
  if (url.hostname.includes('supabase.co') || url.hostname.includes('groq.com')) return;

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (isAppHtml(event.request, url)) {
    event.respondWith(fetchHtmlWithFix(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});
