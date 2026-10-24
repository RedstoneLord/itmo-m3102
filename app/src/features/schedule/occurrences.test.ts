import { describe, expect, it } from 'vitest';
import { nowMarkerIndex, type ClassOccurrence } from './occurrences';

const at = (startTime: string, endTime: string, status = 'regular') =>
  ({ key: startTime, date: '2026-10-01', status, details: { startTime, endTime } }) as unknown as ClassOccurrence;

describe('линия «сейчас» в списке дня', () => {
  const day = [at('09:50', '11:20'), at('11:30', '13:00')];

  it('перед первой парой, между парами и после последней', () => {
    expect(nowMarkerIndex(day, '08:00')).toBe(0);
    expect(nowMarkerIndex(day, '11:25')).toBe(1);
    expect(nowMarkerIndex(day, '14:00')).toBe(2);
  });

  it('пока пара идёт, линии нет: её показывает сама строка; конец пары — уже перемена', () => {
    expect(nowMarkerIndex(day, '10:30')).toBeUndefined();
    expect(nowMarkerIndex(day, '11:30')).toBeUndefined();
    expect(nowMarkerIndex(day, '11:20')).toBe(1);
  });

  it('отменённая пара не считается идущей', () => {
    expect(nowMarkerIndex([at('09:50', '11:20', 'cancelled'), at('11:30', '13:00')], '10:30')).toBe(1);
  });
});
