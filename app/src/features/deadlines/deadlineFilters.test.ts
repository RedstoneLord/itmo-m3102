import { describe, expect, it } from 'vitest';
import { orderDeadlines } from './deadlineInfo';
import { ALL_SUBJECTS, DEFAULT_DEADLINE_FILTERS, NO_SUBJECT, deadlineSubjects, filterDeadlines, groupDeadlines } from './deadlineFilters';

// 2 октября 2026, 12:00 по местному времени
const NOW = new Date(2026, 9, 2, 12).getTime();
const at = (day: number) => new Date(2026, 9, day, 23, 59).toISOString();

const items = [
  { id: 'dm-hw', name: 'ДМ - ДЗ', deadline: at(11) },
  { id: 'aisd-lab', name: 'АИСД - Лаба', deadline: at(8) },
  { id: 'dm-cards', name: 'ДМ - Карточки', deadline: at(1) },
  { id: 'aisd-lab2', name: 'АИСД - Лаба 2', deadline: at(30) },
  { id: 'misc', name: 'Что-то своё', deadline: at(20) },
];
const done = { 'aisd-lab': true };
const ordered = orderDeadlines(items, done, NOW);
const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('groupDeadlines', () => {
  it('ближайшие, просроченные и выполненные — в порядке orderDeadlines', () => {
    const groups = groupDeadlines(ordered, done, NOW);
    expect(ids(groups.upcoming)).toEqual(['dm-hw', 'misc', 'aisd-lab2']);
    expect(ids(groups.overdue)).toEqual(['dm-cards']);
    expect(ids(groups.finished)).toEqual(['aisd-lab']);
  });

  it('выполненный просроченный срок — в выполненных, а не в просроченных', () => {
    const groups = groupDeadlines(ordered, { 'dm-cards': true }, NOW);
    expect(ids(groups.overdue)).toEqual([]);
    expect(ids(groups.finished)).toEqual(['dm-cards']);
    expect(ids(groups.upcoming)).toContain('aisd-lab');
  });

  it('срок, наступивший ровно сейчас, уже просрочен', () => {
    expect(ids(groupDeadlines([{ id: 'x', name: 'ДМ - ДЗ', deadline: new Date(NOW).toISOString() }], {}, NOW).overdue)).toEqual(['x']);
  });
});

describe('filterDeadlines', () => {
  it('по умолчанию — всё, как есть', () => {
    expect(filterDeadlines(ordered, done, DEFAULT_DEADLINE_FILTERS)).toEqual(ordered);
  });

  it('«Невыполненные» прячут выполненное, порядок сохраняется', () => {
    expect(ids(filterDeadlines(ordered, done, { scope: 'pending', subject: ALL_SUBJECTS }))).toEqual(['dm-hw', 'misc', 'aisd-lab2', 'dm-cards']);
  });

  it('по предмету: сроки только этого предмета', () => {
    expect(ids(filterDeadlines(ordered, done, { scope: 'all', subject: 'dm' }))).toEqual(['dm-hw', 'dm-cards']);
    expect(ids(filterDeadlines(ordered, done, { scope: 'pending', subject: 'aisd' }))).toEqual(['aisd-lab2']);
  });

  it('срок без предмета ловится отдельным значением', () => {
    expect(ids(filterDeadlines(ordered, done, { scope: 'all', subject: NO_SUBJECT }))).toEqual(['misc']);
  });
});

describe('deadlineSubjects', () => {
  it('предметы без повторов в порядке появления, «без предмета» — в конце', () => {
    expect(deadlineSubjects([items[4]!, ...items.slice(0, 4)])).toEqual(['dm', 'aisd', NO_SUBJECT]);
  });

  it('нет сроков без предмета — нет и такого пункта', () => {
    expect(deadlineSubjects(items.slice(0, 4))).toEqual(['dm', 'aisd']);
  });
});
