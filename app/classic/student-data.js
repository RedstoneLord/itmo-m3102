import { CONTENT, esc, validTree, listing, stamp, read, save } from './student-core.js';

const freshness = new Map(Object.entries({ Расписание: {}, ДЗ: {}, Очереди: {}, ...read('m3102-data-freshness-v1', {}) }));
const responseInfo = new Map();
export async function studentFetch(url, options = {}) {
  const label = String(url).includes('schedule.json') ? 'Расписание' : String(url).includes('homework.json') ? 'ДЗ' : 'Дедлайны';
  const cache = 'caches' in globalThis ? await caches.open(CONTENT) : null,
    key = new URL(url, location.href).href;
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const at = response.headers.get('X-M3102-At') || new Date().toISOString();
    markFresh(label, at, response.headers.has('X-M3102-Saved'));
    const headers = new Headers(response.headers);
    headers.set('X-M3102-At', at);
    try {
      await cache?.put(key, new Response(await response.clone().arrayBuffer(), { headers }));
    } catch {}
    return response;
  } catch (error) {
    const hit = await cache?.match(key);
    if (!hit) throw error;
    const headers = new Headers(hit.headers);
    headers.set('X-M3102-Saved', '1');
    markFresh(label, headers.get('X-M3102-At'), true);
    return new Response(hit.body, { headers });
  }
}
export function markFresh(key, at, saved) {
  freshness.set(key, { at: at || freshness.get(key)?.at, saved });
  save('m3102-data-freshness-v1', Object.fromEntries(freshness));
  document.dispatchEvent(new CustomEvent('student:freshness'));
}
export function freshnessMarkup() {
  return [...freshness]
    .map(
      ([key, value]) =>
        `<span>${esc(key)}: ${value.saved || (!navigator.onLine && value.at) ? '<strong>сохранённые данные</strong> · ' : ''}${esc(stamp(value.at))}</span>`,
    )
    .join('');
}
export async function json(url, label = '') {
  const key = new URL(url, location.href).href;
  const cache = 'caches' in globalThis ? await caches.open(CONTENT) : null;
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.clone().json();
    const at = response.headers.get('X-M3102-At') || new Date().toISOString();
    responseInfo.set(key, { at, saved: response.headers.has('X-M3102-Saved') });
    if (label) markFresh(label, at, response.headers.has('X-M3102-Saved'));
    const headers = new Headers(response.headers);
    headers.set('X-M3102-At', at);
    try {
      await cache?.put(key, new Response(JSON.stringify(data), { headers }));
    } catch {
      /* Readable even if storage is full. */
    }
    return data;
  } catch (error) {
    const hit = await cache?.match(key);
    if (!hit) throw error;
    responseInfo.set(key, { at: hit.headers.get('X-M3102-At'), saved: true });
    if (label) markFresh(label, hit.headers.get('X-M3102-At'), true);
    return hit.json();
  }
}
let treePromise;
export function loadTree({ fresh = false } = {}) {
  if (fresh) treePromise = null;
  treePromise ||= json('./data/tree.json', 'Материалы')
    .then(validTree)
    .catch((error) => {
      treePromise = null;
      throw error;
    });
  return treePromise;
}
export async function directoryResponse(path) {
  const tree = await loadTree();
  return new Response(JSON.stringify(listing(tree, path)), { headers: { 'Content-Type': 'application/json' } });
}
export const QUEUE_URL =
  'https://api.github.com/repos/RedstoneLord/itmo-m3102/issues?labels=queue-signup&state=open&sort=created&direction=asc&per_page=100';
export async function queues(students, { matches: matchStudents, resolve } = {}) {
  const all = [];
  const snapshots = [];
  // GitHub paginates large queues. A failed page must not turn the rest into an empty queue.
  try {
    for (let page = 1; page <= 20; page++) {
      const url = `${QUEUE_URL}&page=${page}`,
        batch = await json(url);
      if (!Array.isArray(batch)) throw new Error('Не удалось прочитать очереди GitHub.');
      snapshots.push(responseInfo.get(url));
      all.push(...batch);
      if (batch.length < 100) break;
      if (page === 20) throw new Error('Список очередей слишком велик. Повторите позже.');
    }
  } catch (error) {
    markFresh('Очереди', freshness.get('Очереди')?.at, true);
    throw error;
  }
  const oldest = snapshots
    .map((s) => s?.at)
    .filter(Boolean)
    .sort()[0];
  markFresh(
    'Очереди',
    oldest,
    snapshots.some((s) => s?.saved),
  );
  const norm = (value) =>
    value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]+/g, ' ')
      .trim();
  const result = {};
  for (const issue of all) {
    const match = /^\[([^\]]+)\]\s*(.*)$/.exec(issue.title || '');
    if (!match || issue.pull_request) continue;
    const typed = norm(match[2]),
      author = students.find((s) => s.nick.toLowerCase() === issue.user?.login?.toLowerCase());
    const matches = typed
      ? matchStudents
        ? matchStudents(match[2])
        : students.filter((s) => {
            const words = norm(s.name).split(' ');
            return typed.split(' ').every((t) => words.some((w) => w === t || (t.length === 1 && w.startsWith(t))));
          })
      : [];
    const who = typed ? (matches.length === 1 ? matches[0] : matches.includes(author) ? author : null) : author;
    (result[match[1]] ||= []).push({
      label: who?.name || match[2] || author?.name || issue.user?.login || 'Без имени',
      ...(resolve ? resolve(issue.user?.login, match[2]) : {}),
      login: who?.nick || '',
      url: issue.html_url,
    });
  }
  return result;
}
