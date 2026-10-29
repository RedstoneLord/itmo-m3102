import { addDays } from '../../lib/dates';
import type { ISODate } from '../../types/models';

/** Оценка при просмотре карточки: «не помню», «трудно», «хорошо», «легко» */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export const RATINGS: { value: Rating; label: string }[] = [
  { value: 'again', label: 'Не помню' },
  { value: 'hard', label: 'Трудно' },
  { value: 'good', label: 'Хорошо' },
  { value: 'easy', label: 'Легко' },
];

/** Ступени (коробки Лейтнера): через сколько дней карточка вернётся, когда дошла до ступени. Ступень 0 — не выучена, вернётся в этом же занятии */
export const BOX_DAYS = [0, 1, 3, 7, 14, 30] as const;
const TOP = BOX_DAYS.length - 1;

/** С этой ступени (повторы через 7 дней и реже) карточка считается освоенной */
export const MASTERED_BOX = 3;

export interface CardState {
  box: number;
  due: ISODate;
  /** Сколько раз оценена */
  seen: number;
  /** Сколько раз забыта после того, как уже вспоминалась */
  lapses: number;
}

/**
 * Состояние после оценки. «Не помню» — на ступень 0 (вернётся сразу), «трудно» — ступень та же, но не ниже первой, «хорошо» — на ступень выше,
 * «легко» — на две. Чем выше ступень, тем реже карточка: 1, 3, 7, 14, 30 дней.
 */
export function rate(state: CardState | undefined, rating: Rating, today: ISODate): CardState {
  const box = state?.box ?? 0;
  const seen = (state?.seen ?? 0) + 1;
  const lapses = (state?.lapses ?? 0) + (rating === 'again' && box > 0 ? 1 : 0);
  const next = rating === 'again' ? 0 : rating === 'hard' ? Math.max(1, box) : Math.min(TOP, box + (rating === 'good' ? 1 : 2));
  return { box: next, due: addDays(today, BOX_DAYS[next]!), seen, lapses };
}

/** Через сколько дней вернётся карточка при такой оценке — подпись на кнопке («завтра», «3 дн.»); 0 — в этом же занятии */
export function intervalDays(state: CardState | undefined, rating: Rating): number {
  return BOX_DAYS[rate(state, rating, '2000-01-01').box]!;
}

export const isMastered = (state: CardState | undefined) => (state?.box ?? 0) >= MASTERED_BOX;

export interface Mastery {
  total: number;
  /** Ступень 3 и выше */
  mastered: number;
  /** Ещё ни разу не оценены */
  fresh: number;
  /** Пора повторить (срок пришёл) */
  due: number;
}

/** Сводка по набору карточек: сколько освоено, новых и пора повторить */
export function masteryOf(ids: string[], states: Record<string, CardState>, today: ISODate): Mastery {
  const result: Mastery = { total: ids.length, mastered: 0, fresh: 0, due: 0 };
  for (const id of ids) {
    const state = states[id];
    if (!state) result.fresh++;
    else {
      if (isMastered(state)) result.mastered++;
      if (state.due <= today) result.due++;
    }
  }
  return result;
}

/**
 * Очередь занятия: сначала те, у кого срок пришёл (самые просроченные первыми), потом новые в том порядке, как лежат в файле, но не больше
 * `newLimit`. Остальное не показывается — завтра подойдёт его очередь.
 */
export function buildQueue(ids: string[], states: Record<string, CardState>, today: ISODate, newLimit: number): string[] {
  const due = ids.filter((id) => states[id] && states[id]!.due <= today).sort((a, b) => states[a]!.due.localeCompare(states[b]!.due));
  const fresh = ids.filter((id) => !states[id]).slice(0, newLimit);
  return [...due, ...fresh];
}
