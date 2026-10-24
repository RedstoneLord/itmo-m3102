import { describe, expect, it } from 'vitest';
import { deadlineSubjectId, getNextDeadline, getOverdueCount } from './subjectStats';

describe('subjectStats', () => {
  it('предмет дедлайна по префиксу названия', () => {
    expect(deadlineSubjectId('ДМ - Карточки')).toBe('dm');
    expect(deadlineSubjectId('ИСРПО — Документация')).toBe('isrpo');
    expect(deadlineSubjectId('АИСД - Лаба')).toBe('aisd');
    expect(deadlineSubjectId('Без предмета')).toBeUndefined();
  });

  it('ближайший срок — с дедлайнами группы, без прошедших и выполненных', () => {
    const deadlines = [
      { id: 'a', name: 'ДМ - Карточки', deadline: '2026-09-30T23:59:00+03:00' },
      { id: 'b', name: 'ДМ - ДЗ', deadline: '2026-10-11T23:59:00+03:00' },
      { id: 'c', name: 'ДМ - Тест', deadline: '2026-10-05T23:59:00+03:00' },
    ];
    expect(getNextDeadline([], 'dm', '2026-10-01', { deadlines, done: { c: true } })).toBe('2026-10-11');
    expect(getNextDeadline([], 'op', '2026-10-01', { deadlines, done: {} })).toBeUndefined();
  });

  it('просроченные незавершённые считаются отдельно: будущих сроков нет, а долги есть', () => {
    const deadlines = [
      { id: 'a', name: 'ИСРПО — Документация', deadline: '2026-10-02T23:59:00+03:00' },
      { id: 'b', name: 'ИСРПО - Плагин', deadline: '2026-10-23T23:59:00+03:00' },
      { id: 'c', name: 'ИСРПО - Тест', deadline: '2026-10-01T23:59:00+03:00' },
    ];
    const group = { deadlines, done: { c: true } };
    expect(getNextDeadline([], 'isrpo', '2026-10-24', group)).toBeUndefined();
    expect(getOverdueCount([], 'isrpo', '2026-10-24', group)).toBe(2);
    expect(getOverdueCount([], 'isrpo', '2026-10-23', group)).toBe(1);
    expect(getOverdueCount([], 'dm', '2026-10-24', group)).toBe(0);
  });
});
