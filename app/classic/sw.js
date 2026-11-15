// Assembled classic site's worker. /app/ keeps its own worker and caches.
const RELEASE = '__CLASSIC_RELEASE__';
const SHELL = 'm3102-shell-release-' + RELEASE,
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
// Каждый install пишет только свой выпуск; незавершённый кеш не становится активным.
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        const response = await fetch(local('shell-manifest.json'), { cache: 'reload' });
        if (!response.ok) throw new Error('manifest');
        const manifest = await response.clone().json();
        if (manifest.release !== RELEASE) throw new Error('release changed during install');
        const required = manifest.files.filter((e) => !/^https?:/.test(e.url));
        // Ограниченная очередь, все критичные файлы и их SHA проверены до завершения install.
        for (let i = 0; i < required.length; i += 8) {
          await Promise.all(
            required.slice(i, i + 8).map(async ({ url, revision }) => {
              const response = await fetch(new URL(url, base), { cache: 'reload' });
              if (!response.ok) throw new Error(url);
              const bytes = await response.arrayBuffer();
              const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) => n.toString(16).padStart(2, '0')).join('');
              if (revision !== hash) throw new Error('revision: ' + url);
              const headers = new Headers(response.headers);
              headers.set('X-M3102-Revision', revision);
              await cache.put(new URL(url, base), new Response(bytes, { headers }));
            }),
          );
        }
        // Существующие CDN не блокируют обновление оболочки при недоступности сети.
        await Promise.all(
          manifest.files
            .filter((e) => /^https?:/.test(e.url))
            .map(async ({ url }) => {
              try {
                const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (r.ok) await cache.put(url, r);
              } catch {}
            }),
        );
        await cache.put(local('shell-manifest.json'), response);
        await cache.put(local('__complete__'), new Response(RELEASE));
      } catch (error) {
        await caches.delete(SHELL);
        throw error;
      }
      // Открытые вкладки продолжают пользоваться целым прежним выпуском.
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const clients = (await self.clients.matchAll({ type: 'window' })).filter((client) => {
        const url = new URL(client.url);
        return url.origin === base.origin && url.pathname.startsWith(base.pathname) && !url.pathname.startsWith(base.pathname + 'app/');
      });
      const releases = await Promise.all(
        clients.map(
          (client) =>
            new Promise((resolve) => {
              const channel = new MessageChannel();
              const timeout = setTimeout(() => resolve(null), 1000);
              channel.port1.onmessage = (e) => {
                clearTimeout(timeout);
                channel.port1.close();
                resolve(e.data);
              };
              client.postMessage({ type: 'CLASSIC_RELEASE_QUERY' }, [channel.port2]);
            }),
        ),
      );
      // Неизвестная старая вкладка: лучше сохранить кеш, чем оборвать её ленивые импорты.
      if (releases.includes(null)) return;
      const complete = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('m3102-shell-release-')) continue;
        if (await (await caches.open(name)).match(local('__complete__'))) complete.push(name);
      }
      const keep = new Set([SHELL, ...complete.slice(-2), ...releases.map((id) => 'm3102-shell-release-' + id)]);
      await Promise.all(complete.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
    })(),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_CLASSIC') event.waitUntil(self.skipWaiting());
});
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
  let hit = await cachedResponse(cache, request);
  if (shell) {
    if (request.mode === 'navigate') return (await cache.match(local('index.html'))) || fetch(request);
    if (hit) return hit;
    // Ленивый импорт из старой вкладки остаётся доступен после явного обновления.
    if (new URL(request.url).pathname.includes('/releases/') || new URL(request.url).hostname === 'cdnjs.cloudflare.com') {
      for (const name of await caches.keys()) {
        if (!name.startsWith('m3102-shell-')) continue;
        hit = await cachedResponse(await caches.open(name), request);
        if (hit) return hit;
      }
    }
    return fetch(request);
  }
  if (request.headers.has('Range')) return hit || fetch(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.status === 200) {
      await cache.put(request.url, await stamped(response.clone())).catch(() => {});
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
  return new Response('Нет сети. Сохраните этот файл через «Работа без интернета».', { status: 503 });
}
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('Authorization')) return;
  if (url.origin === base.origin) {
    if (!url.pathname.startsWith(base.pathname) || url.pathname.startsWith(`${base.pathname}app/`)) return;
    const path = decodeURIComponent(url.pathname.slice(base.pathname.length));
    return event.respondWith(serve(request, path !== 'm3102.ics' && !path.startsWith('data/') && !path.startsWith('Дедлайны/'), event));
  }
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'api.github.com') return event.respondWith(serve(request, false, event));
  if (url.hostname === 'cdnjs.cloudflare.com') return event.respondWith(serve(request, true, event));
});
