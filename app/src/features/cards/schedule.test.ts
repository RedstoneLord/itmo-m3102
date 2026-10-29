import { describe, expect, it } from 'vitest';
import { buildQueue, intervalDays, isMastered, masteryOf, rate, type CardState } from './schedule';

const TODAY = '2026-10-29';

describe('rate', () => {
  it('новая карточка: «хорошо» — завтра, «легко» — через 3 дня, «не помню» — сразу, «трудно» — завтра', () => {
    expect(rate(undefined, 'good', TODAY)).toEqual({ box: 1, due: '2026-10-30', seen: 1, lapses: 0 });
    expect(rate(undefined, 'easy', TODAY)).toMatchObject({ box: 2, due: '2026-11-01' });
    expect(rate(undefined, 'again', TODAY)).toMatchObject({ box: 0, due: TODAY });
    expect(rate(undefined, 'hard', TODAY)).toMatchObject({ box: 1, due: '2026-10-30' });
  });

  it('ступени идут 1, 3, 7, 14, 30 и выше не поднимаются', () => {
    let state: CardState | undefined;
    const days: number[] = [];
    for (let step = 0; step < 7; step++) {
      state = rate(state, 'good', TODAY);
      days.push(intervalDays(state, 'hard'));
    }
    expect(state!.box).toBe(5);
    expect(days.at(-1)).toBe(30);
    expect(rate(state, 'easy', TODAY).box).toBe(5);
  });

  it('забытая после освоения карточка падает на ступень 0 и считает срыв; «трудно» ступень не понижает', () => {
    const learned = { box: 4, due: TODAY, seen: 5, lapses: 0 };
    expect(rate(learned, 'again', TODAY)).toMatchObject({ box: 0, lapses: 1, due: TODAY });
    expect(rate(learned, 'hard', TODAY)).toMatchObject({ box: 4, due: '2026-11-12' });
    expect(rate(undefined, 'again', TODAY).lapses).toBe(0);
  });

  it('освоенной считается с третьей ступени', () => {
    expect(isMastered({ box: 2, due: TODAY, seen: 2, lapses: 0 })).toBe(false);
    expect(isMastered({ box: 3, due: TODAY, seen: 3, lapses: 0 })).toBe(true);
    expect(isMastered(undefined)).toBe(false);
  });
});

describe('очередь и сводка', () => {
  const states: Record<string, CardState> = {
    a: { box: 3, due: '2026-10-20', seen: 4, lapses: 0 },
    b: { box: 1, due: '2026-10-28', seen: 1, lapses: 0 },
    c: { box: 4, due: '2026-11-05', seen: 5, lapses: 0 },
  };
  const ids = ['x', 'a', 'y', 'b', 'c', 'z'];

  it('сначала просроченные (старые первыми), потом новые по порядку, но не больше лимита', () => {
    expect(buildQueue(ids, states, TODAY, 2)).toEqual(['a', 'b', 'x', 'y']);
    expect(buildQueue(ids, states, TODAY, 0)).toEqual(['a', 'b']);
  });

  it('сводка: освоено, новых, пора повторить', () => {
    expect(masteryOf(ids, states, TODAY)).toEqual({ total: 6, mastered: 2, fresh: 3, due: 2 });
  });
});
