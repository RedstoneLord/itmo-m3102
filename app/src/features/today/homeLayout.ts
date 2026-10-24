/** Блоки главной — в порядке по умолчанию. feature — крупные: идут сеткой во всю ширину, остальные — плитками в две колонки */
export const HOME_BLOCKS = [
  { id: 'next', label: 'Сейчас и следующая пара', feature: true },
  { id: 'deadlines', label: 'Ближайшие дедлайны', feature: true },
  { id: 'review', label: 'Повторение ошибок', feature: true },
  { id: 'schedule', label: 'Пары на сегодня', feature: false },
  { id: 'homework', label: 'Домашнее задание', feature: false },
  { id: 'queues', label: 'Мои очереди', feature: false },
  { id: 'notes', label: 'Недавние конспекты', feature: false },
  { id: 'materials', label: 'Материалы', feature: false },
  { id: 'plan', label: 'Мой учебный план', feature: false },
  { id: 'subjects', label: 'Предметы', feature: false },
  { id: 'bookmarks', label: 'Закладки', feature: false },
] as const;

export type HomeBlockId = (typeof HOME_BLOCKS)[number]['id'];

const KNOWN = new Set<string>(HOME_BLOCKS.map((block) => block.id));
const FEATURE = new Set<string>(HOME_BLOCKS.filter((block) => block.feature).map((block) => block.id));

/**
 * Порядок блоков с учётом сохранённого: сначала сохранённые (неизвестные — выброшены), затем блоки, которых
 * в сохранённом нет (появились в новой версии сайта) — на своих местах по умолчанию, в конце.
 */
export function arrangeBlocks(saved: readonly string[]): HomeBlockId[] {
  const kept = saved.filter((id, index) => KNOWN.has(id) && saved.indexOf(id) === index) as HomeBlockId[];
  const missing = HOME_BLOCKS.map((block) => block.id).filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

/**
 * Подряд идущие блоки одного вида — одна группа: крупные кладутся сеткой (до двух в ряд), плитки — колонками.
 * Порядок из настроек сохраняется: перенесённый крупный блок остаётся там, куда его поставили.
 */
export function groupBlocks(order: readonly HomeBlockId[]): { feature: boolean; ids: HomeBlockId[] }[] {
  const groups: { feature: boolean; ids: HomeBlockId[] }[] = [];
  for (const id of order) {
    const feature = FEATURE.has(id);
    const last = groups.at(-1);
    if (last?.feature === feature) last.ids.push(id);
    else groups.push({ feature, ids: [id] });
  }
  return groups;
}

/** Сдвинуть блок на шаг вверх (-1) или вниз (+1) */
export function moveBlock(order: readonly HomeBlockId[], id: HomeBlockId, step: -1 | 1): HomeBlockId[] {
  const next = [...order];
  const at = next.indexOf(id);
  const to = at + step;
  if (at === -1 || to < 0 || to >= next.length) return next;
  [next[at], next[to]] = [next[to]!, next[at]!];
  return next;
}

/** Куда можно попасть при запуске сайта */
export const START_PAGES = [
  { value: '/today', label: 'Главная' },
  { value: '/schedule', label: 'Расписание' },
  { value: '/deadlines', label: 'Дедлайны' },
  { value: '/deadlines?tab=homework', label: 'Домашнее задание' },
  { value: '/materials', label: 'Материалы' },
  { value: '/schedule?view=month', label: 'Календарь (месяц)' },
  { value: '/review', label: 'Повторение' },
] as const;
