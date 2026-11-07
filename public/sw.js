/**
 * HYPERSTRIKE! service worker — offline shell with lazy runtime caching.
 *
 * - First install activates immediately (skipWaiting only when there is no
 *   active worker yet), so the very first successful load already works
 *   offline. Updates WAIT until the next launch — no reload mid-match.
 * - Navigation: network first (fresh HTML so new hashed assets are picked
 *   up on the next launch), falling back to the cached shell.
 * - Same-origin assets: stale-while-revalidate. Music is never precached;
 *   it lands in the runtime cache only if it was actually fetched.
 * - Bump VERSION to invalidate every cache on the following activate.
 */

const VERSION = 'hyperstrike-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const put = async (url) => {
        try {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (res.ok) await store(cache, url, res);
        } catch {
          // offline during install — the runtime cache will fill in later
        }
      };
      await Promise.all(SHELL_URLS.map(put));

      // First-load assets never pass through this worker (it registers on
      // window load), so precache whatever the current HTML references —
      // hashed JS/CSS included; music stays optional and is never precached.
      try {
        const html = await (
          await fetch(new Request('./index.html', { cache: 'reload' }))
        ).text();
        const refs = html.match(/(?:src|href)="\.\/assets\/[^"]+"/g) || [];
        const assets = [...new Set(refs.map((m) => m.slice(m.indexOf('"') + 1, -1)))].filter(
          (u) => !/\.(mp3|ogg|wav|m4a|map)$/.test(u),
        );
        await Promise.all(assets.map(put));
      } catch {
        // best-effort
      }

      // First-ever install: activate now so offline works after first load.
      // Updates keep the old worker until every tab is closed (next launch).
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const MEDIA_RE = /\.(mp3|ogg|wav|m4a)$/i;

/**
 * cache.put() with the body as-is but Content-Encoding/Length stripped:
 * cached bodies are already decoded, and a stale "gzip" header makes the
 * browser fail to decode them on replay.
 */
async function store(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  await cache.put(
    request,
    new Response(response.body, { status: response.status, statusText: response.statusText, headers }),
  );
}

async function navigationResponse(request) {
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      // Keep both keys fresh: the request URL (e.g. './') and './index.html'
      // — the fallback order below must never surface a stale build.
      await Promise.all([
        store(cache, request, res.clone()).catch(() => {}),
        store(cache, './index.html', res.clone()).catch(() => {}),
      ]);
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const fallback =
      (await cache.match(request, { ignoreVary: true })) ||
      (await cache.match('./index.html', { ignoreVary: true }));
    return fallback || Response.error();
  }
}

/** Fetch for caching: media range requests become full-file responses. */
async function fetchForCache(request) {
  if (MEDIA_RE.test(new URL(request.url).pathname) && request.headers.has('range')) {
    const headers = new Headers(request.headers);
    headers.delete('range');
    return fetch(new Request(request, { headers }));
  }
  return fetch(request);
}

async function runtimeResponse(request) {
  const runtime = await caches.open(RUNTIME_CACHE);
  const hit = await runtime.match(request, { ignoreVary: true });
  if (hit) {
    // stale-while-revalidate: new builds arrive via updated HTML instead.
    void (async () => {
      try {
        const res = await fetchForCache(request);
        if (res && res.ok && res.status === 200) await store(runtime, request, res.clone());
      } catch {
        // keep serving the cached copy
      }
    })();
    return hit;
  }

  // Install-time precrawl lives in the shell cache; those URLs only change
  // when a new service worker version installs, so no revalidation needed.
  const shell = await caches.open(SHELL_CACHE);
  const precached = await shell.match(request, { ignoreVary: true });
  if (precached) return precached;

  try {
    const res = await fetchForCache(request);
    if (res && res.ok && res.status === 200) await store(runtime, request, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  const isMedia = MEDIA_RE.test(new URL(request.url).pathname);
  if (request.headers.has('range') && !isMedia) return; // let the HTTP cache answer

  event.respondWith(runtimeResponse(request));
});
