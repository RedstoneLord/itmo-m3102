import type { GroupDeadline } from '../group/groupStore';
import { deadlineSubjectId } from '../subjects/subjectStats';

/** «Невыполненные» прячут сделанное, «Все» оставляют его свёрнутым блоком внизу */
export type DeadlineScope = 'pending' | 'all';

export interface DeadlineFilters {
  scope: DeadlineScope;
  /** 'all', id предмета или NO_SUBJECT (срок, название которого не сопоставилось с предметом) */
  subject: string;
}

export const ALL_SUBJECTS = 'all';
export const NO_SUBJECT = 'other';

export const DEFAULT_DEADLINE_FILTERS: DeadlineFilters = { scope: 'all', subject: ALL_SUBJECTS };

const subjectOf = (item: GroupDeadline) => deadlineSubjectId(item.name) ?? NO_SUBJECT;

/** Предметы, по которым есть сроки, в порядке первого появления; «без предмета» — последним */
export function deadlineSubjects(items: GroupDeadline[]): string[] {
  const ids = [...new Set(items.map(subjectOf))];
  return [...ids.filter((id) => id !== NO_SUBJECT), ...ids.filter((id) => id === NO_SUBJECT)];
}

/** Порядок сохраняется: сначала упорядочить через `orderDeadlines`, потом фильтровать */
export function filterDeadlines(items: GroupDeadline[], done: Record<string, boolean>, filters: DeadlineFilters): GroupDeadline[] {
  return items.filter(
    (item) => (filters.scope === 'all' || !done[item.id]) && (filters.subject === ALL_SUBJECTS || subjectOf(item) === filters.subject),
  );
}

/**
 * Три группы страницы из уже упорядоченного списка (`orderDeadlines`): ближайшие, просроченные, выполненные.
 * Граница «просрочен» — та же, что в `orderDeadlines`: срок наступил (`<= now`).
 */
export function groupDeadlines(items: GroupDeadline[], done: Record<string, boolean>, now = Date.now()) {
  const upcoming: GroupDeadline[] = [];
  const overdue: GroupDeadline[] = [];
  const finished: GroupDeadline[] = [];
  for (const item of items) {
    if (done[item.id]) finished.push(item);
    else if (new Date(item.deadline).getTime() <= now) overdue.push(item);
    else upcoming.push(item);
  }
  return { upcoming, overdue, finished };
}
