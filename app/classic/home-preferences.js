// Стабильный реестр: скрытие блока не меняет данные его раздела.
export const HOME_BLOCKS = [
  ['student-next-panel', 'Следующая пара', 'Время, аудитория и переход к занятию', true],
  ['schedule-panel', 'Сегодня', 'Занятия на текущий день', true],
  ['materials-panel', 'Материалы', 'Быстрый вход в библиотеку группы', true],
  ['notes-panel', 'Недавние конспекты', 'Новые и обновлённые MD и PDF', true],
  ['student-queues-panel', 'Мои очереди', 'Ваши места на сдачу', false],
  ['deadline-panel', 'Скоро сдавать', 'Ближайшие сроки и оставшиеся долги', false],
  ['homework-panel', 'Домашнее задание', 'Актуальные задания группы', false],
  ['plan-panel', 'Мой учебный план', 'Личные задачи и отметки', false],
].map(([id, title, description, enabled]) => ({ id, title, description, enabled }));
export const SETUP_KEY = 'm3102-setup-v1';
export const LAYOUT_KEY = 'm3102-home-layout-v1';
export const IDENTITY_KEY = 'm3102-student-v1';
export function normalizeLayout(value) {
  const ids = HOME_BLOCKS.map((b) => b.id);
  const order = [...new Set((Array.isArray(value?.order) ? value.order : []).filter((id) => ids.includes(id)))];
  const visible = Array.isArray(value?.visible) ? value.visible : HOME_BLOCKS.filter((b) => b.enabled).map((b) => b.id);
  return { version: 2, order: [...order, ...ids.filter((id) => !order.includes(id))], visible: ids.filter((id) => visible.includes(id)) };
}
export function migrateSetup(setup, identity) {
  // Версия схемы сама по себе не повод снова прерывать посетителя.
  if (setup?.completed === true) return { version: 1, completed: true };
  if (identity && typeof identity.login === 'string') return { version: 1, completed: true };
  return { version: 1, completed: false };
}
export function campusNow(now = new Date()) {
  // Календарная дата кампуса отдельно от абсолютного момента времени.
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
export function duration(minutes) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ''}` : `${minutes} мин`;
}
export function normalizeRecent(entries, tree) {
  const existing = new Set(tree.filter((e) => e.type === 'blob').map((e) => e.path));
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => {
      if (
        !e ||
        typeof e.path !== 'string' ||
        !/^Конспекты\/.+\.(md|pdf)$/i.test(e.path) ||
        e.path.split('/').some((p) => p.startsWith('.') || p === 'output') ||
        !existing.has(e.path) ||
        seen.has(e.path)
      )
        return false;
      seen.add(e.path);
      return true;
    })
    .map((e) => ({ path: e.path, date: Number.isFinite(Date.parse(e.date)) ? e.date : null, change: e.change === 'added' ? 'added' : 'updated' }))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || a.path.localeCompare(b.path, 'ru'));
}
