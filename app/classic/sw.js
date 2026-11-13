// Assembled classic site's worker. /app/ keeps its own worker and caches.
const SHELL = 'm3102-shell-student-v1',
  CONTENT = 'm3102-content-v1';
const base = new URL(self.registration.scope);
const local = (path) => new URL(path, base).href;
async function stamped(response, revision) {
  const headers = new Headers(response.headers);
  headers.set('X-M3102-At', new Date().toISOString());
  if (revision) headers.set('X-M3102-Revision', revision);
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers });
}
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        const response = await fetch(local('shell-manifest.json'), { cache: 'reload' });
        if (!response.ok) throw new Error('manifest');
        const manifest = await response.clone().json();
        await cache.put(local('shell-manifest.json'), response);
        await Promise.all(
          manifest.files.map(async ({ url, revision }) => {
            try {
              const response = await fetch(new URL(url, base), { cache: 'reload' });
              if (!response.ok) return;
              const headers = new Headers(response.headers);
              headers.set('X-M3102-Revision', revision);
              await cache.put(new URL(url, base), new Response(await response.arrayBuffer(), { headers }));
            } catch {
              /* The download panel reports and retries missing files. */
            }
          }),
        );
      } catch {
        /* Previously cached site remains available. */
      }
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      await Promise.all((await caches.keys()).filter((n) => n.startsWith('m3102-shell-') && n !== SHELL).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  ),
);
async function cachedResponse(cache, request) {
  const hit = await cache.match(request.url, { ignoreVary: true });
  if (!hit) return null;
  const headers = new Headers(hit.headers);
  headers.set('X-M3102-Saved', '1');
  const range = request.headers.get('Range');
  if (range) {
    const data = await hit.arrayBuffer(),
      match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416 });
    const start = match[1] ? Number(match[1]) : Math.max(0, data.byteLength - Number(match[2]));
    const end = Math.min(match[1] && match[2] ? Number(match[2]) : data.byteLength - 1, data.byteLength - 1);
    if (start > end || start >= data.byteLength)
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${data.byteLength}` } });
    headers.set('Content-Range', `bytes ${start}-${end}/${data.byteLength}`);
    headers.set('Content-Length', String(end - start + 1));
    headers.set('Accept-Ranges', 'bytes');
    return new Response(data.slice(start, end + 1), { status: 206, headers });
  }
  return new Response(hit.body, { status: hit.status, headers });
}
async function serve(request, shell, event) {
  const cache = await caches.open(shell ? SHELL : CONTENT);
  if (request.headers.has('Range')) {
    const hit = await cachedResponse(cache, request);
    if (hit) return hit;
    return fetch(request);
  }
  const hit = await cachedResponse(cache, request);
  if (shell && hit && !request.mode.includes('navigate') && !request.url.endsWith('shell-manifest.json')) return hit;
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.status === 200) {
      let revision;
      if (shell) {
        const manifest = await cache.match(local('shell-manifest.json'));
        if (manifest) revision = (await manifest.json()).files.find((entry) => new URL(entry.url, base).href === request.url)?.revision;
      }
      const copy = await stamped(response.clone(), revision);
      await cache.put(request.url, copy).catch(() => {});
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  let timer;
  try {
    const response = hit
      ? await Promise.race([
          network,
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), 4000);
          }),
        ])
      : await network;
    if (response?.ok) return response;
    if (hit) return hit;
    if (response) return response;
  } catch {
    if (hit) return hit;
  } finally {
    clearTimeout(timer);
  }
  if (request.mode === 'navigate' && shell) {
    const page = await cache.match(local('index.html'));
    if (page) return page;
  }
  return new Response('Нет сети. Сохраните этот файл через «Работа без интернета».', { status: 503 });
}
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== 'GET' || request.cache === 'reload' || request.headers.has('Authorization')) return;
  if (url.origin === base.origin) {
    if (!url.pathname.startsWith(base.pathname) || url.pathname.startsWith(`${base.pathname}app/`)) return;
    const path = decodeURIComponent(url.pathname.slice(base.pathname.length));
    return event.respondWith(serve(request, !path.startsWith('data/') && !path.startsWith('Дедлайны/'), event));
  }
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'api.github.com') return event.respondWith(serve(request, false, event));
  if (url.hostname === 'cdnjs.cloudflare.com') return event.respondWith(serve(request, true, event));
});
