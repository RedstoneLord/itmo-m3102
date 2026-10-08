import { expect, it } from 'vitest';
import { findSection, MOBILE_TABS, MORE_PAGE_SECTIONS, SCHEDULE_MONTH_PATH, SECTIONS, SIDEBAR_PRIMARY, SIDEBAR_SECONDARY } from './navigation';

const labels = (sections: { label: string }[]) => sections.map((section) => section.label);

it('нижняя панель телефона: Главная, Расписание, Материалы, Дедлайны (плюс «Ещё»)', () => {
  expect(labels(MOBILE_TABS)).toEqual(['Главная', 'Расписание', 'Материалы', 'Дедлайны']);
});

it('в «Ещё» нет того, что уже есть в панели', () => {
  for (const tab of MOBILE_TABS) expect(MORE_PAGE_SECTIONS).not.toContain(tab);
});

it('«Календарь» и «Домашнее задание» — не пункты меню: это режим расписания и вкладка дедлайнов', () => {
  const menu = labels([...SIDEBAR_PRIMARY, ...SIDEBAR_SECONDARY, ...MORE_PAGE_SECTIONS, ...MOBILE_TABS]);
  expect(menu).not.toContain('Календарь');
  expect(menu).not.toContain('Домашнее задание');
  expect(SCHEDULE_MONTH_PATH).toBe('/schedule?view=month');
  expect(SECTIONS.homework.path).toBe('/deadlines?tab=homework');
});

it('вложенные адреса относятся к своему разделу', () => {
  expect(findSection('/materials/notes/gh:Конспекты/ДМ/Лекция_1/Графы.md')).toBe(SECTIONS.materials);
  expect(findSection('/files/Материалы/ДМ')).toBe(SECTIONS.materials);
  expect(findSection('/links')).toBe(SECTIONS.materials);
  expect(findSection('/deadlines')).toBe(SECTIONS.deadlines);
  expect(findSection('/subjects/dm/exam')).toBe(SECTIONS.subjects);
});
