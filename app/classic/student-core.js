// Shared, side-effect-free rules for the assembled classic site.
export const enc = (path) => path.split('/').map(encodeURIComponent).join('/');
export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const rawUrl = (path) => `https://raw.githubusercontent.com/RedstoneLord/itmo-m3102/master/${enc(path)}`;
export const fileHref = (path) => `#/${/\.pdf$/i.test(path) ? 'view' : /\.md$/i.test(path) ? 'note' : 'audio'}/${enc(path)}`;
export const read = (key, fallback = {}) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
export function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function save(key, value) {
  try {
    write(key, value);
    return true;
  } catch {
    return false;
  }
}
export const nice = (path) =>
  String(path)
    .split('/')
    .pop()
    .replace(/_/g, ' ')
    .replace(/\.[^.]+$/, '');
export const bytes = (value) => (value < 1048576 ? `${Math.ceil(value / 1024)} КБ` : `${(value / 1048576).toFixed(1)} МБ`);
export const stamp = (value) => (value ? new Date(value).toLocaleString('ru-RU') : 'ещё не обновлялись');
export const CONTENT = 'm3102-content-v1';
export const SHELL = 'm3102-shell-student-v1';
export function validTree(data) {
  if (
    !data ||
    data.truncated ||
    !Array.isArray(data.tree) ||
    !data.tree.every((e) => e && typeof e.path === 'string' && !e.path.split('/').some((p) => p === '..') && ['blob', 'tree'].includes(e.type))
  )
    throw new Error('Список файлов неполный или повреждён. Повторите обновление.');
  return data.tree;
}
export function listing(tree, path) {
  return tree
    .filter((e) => (e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) === path : !path))
    .map((e) => ({ ...e, name: e.path.split('/').pop(), type: e.type === 'tree' ? 'dir' : 'file' }));
}
export const groupArchived = (item) =>
  item.archived === true || item.completed === true || ['archived', 'completed', 'done', 'closed'].includes(item.status);
export function deadlineGroups(items, done = {}, now = Date.now()) {
  const groups = { upcoming: [], debts: [], archive: [] };
  for (const item of items) {
    const time = Date.parse(item.deadline);
    if (!item.id || !Number.isFinite(time)) continue;
    groups[groupArchived(item) || done[`deadline:${item.id}`] ? 'archive' : time < now ? 'debts' : 'upcoming'].push(item);
  }
  groups.upcoming.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  groups.debts.sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline));
  return groups;
}
// Explicit personal keys: tokens, response caches and downloaded materials never enter a backup.
export const PERSONAL_KEYS = [
  'm3102-study-plan-v1',
  'm3102-hw-done-v1',
  'm3102-draft-homework-v1',
  'm3102-pending-homework-v1',
  'm3102-draft-schedule-v1',
  'm3102-pending-schedule-v1',
  'm3102-settings-v1',
  'm3102-student-v1',
  'm3102-bookmarks-v1',
  'm3102-reading-v1',
  'm3102-audio-v1',
  'm3102-review-v1',
  'm3102-home-layout-v1',
  'hh_save_v1',
  'm3102-slots-v1',
  'm3102-slots-snap-v1',
  'm3102:mahjong',
  'm3102-rewards-v1',
];
export function exportPersonal(storage) {
  const data = {};
  for (const key of PERSONAL_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return { app: 'm3102-classic-personal', version: 1, exportedAt: new Date().toISOString(), data };
}
export function parsePersonal(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Не удалось прочитать JSON резервной копии.');
  }
  if (
    value?.app !== 'm3102-classic-personal' ||
    value.version !== 1 ||
    !value.data ||
    Array.isArray(value.data) ||
    typeof value.data !== 'object' ||
    !Object.keys(value.data).length
  )
    throw new Error('Нужна резервная копия личного прогресса классического сайта, версия 1.');
  for (const [key, item] of Object.entries(value.data)) {
    if (!PERSONAL_KEYS.includes(key) || typeof item !== 'string') throw new Error('В копии обнаружены посторонние данные.');
    let parsed;
    try {
      parsed = JSON.parse(item);
    } catch {
      throw new Error(`Повреждены данные: ${key}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Неверный формат: ${key}`);
    if (
      key === 'm3102-study-plan-v1' &&
      (!Array.isArray(parsed.tasks) ||
        !parsed.tasks.every((t) => t && typeof t.id === 'string' && typeof t.name === 'string') ||
        !parsed.done ||
        typeof parsed.done !== 'object' ||
        Array.isArray(parsed.done))
    )
      throw new Error('Повреждён учебный план.');
    if (/^m3102-(draft|pending)-homework/.test(key) && !Array.isArray(parsed.items)) throw new Error('Повреждена копия домашних заданий.');
    if (
      /^m3102-(draft|pending)-schedule/.test(key) &&
      (!Array.isArray(parsed.cycle) ||
        parsed.cycle.length !== 14 ||
        !parsed.cycle.every((day) => Array.isArray(day) && day.every((l) => l && typeof l.subject === 'string')) ||
        typeof parsed.anchorMonday !== 'string')
    )
      throw new Error('Повреждена копия расписания.');
    if (
      key === 'm3102-bookmarks-v1' &&
      !Object.values(parsed).every(
        (e) =>
          e &&
          typeof e.path === 'string' &&
          (e.quote === undefined || typeof e.quote === 'string') &&
          (e.note === undefined || typeof e.note === 'string'),
      )
    )
      throw new Error('Повреждены закладки.');
    if (
      key === 'm3102-audio-v1' &&
      !Object.values(parsed).every(
        (e) =>
          e &&
          Number.isFinite(e.position) &&
          Array.isArray(e.times) &&
          e.times.every((t) => t && Number.isFinite(t.at) && typeof t.title === 'string'),
      )
    )
      throw new Error('Повреждены позиции аудиозаписей.');
  }
  return value;
}
export function restorePersonal(storage, backup) {
  const before = new Map(PERSONAL_KEYS.map((key) => [key, storage.getItem(key)]));
  try {
    for (const [key, value] of Object.entries(backup.data)) storage.setItem(key, value);
    for (const key of PERSONAL_KEYS) if (!(key in backup.data)) storage.removeItem(key);
  } catch {
    // Free the space consumed by partial writes before putting the old values back.
    for (const key of Object.keys(backup.data)) {
      try {
        storage.removeItem(key);
      } catch {}
    }
    for (const [key, value] of before) {
      try {
        value === null ? storage.removeItem(key) : storage.setItem(key, value);
      } catch {
        /* Best possible rollback after quota errors. */
      }
    }
    throw new Error('Не хватило места для восстановления. Прежние данные сохранены.');
  }
}
export function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function download(text, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type })),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
