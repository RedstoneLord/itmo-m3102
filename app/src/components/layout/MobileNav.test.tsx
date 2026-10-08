// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { MobileNav } from './MobileNav';

/** Какая вкладка нижней панели подсвечена на данном адресе */
function activeTab(path: string): string | null {
  const { unmount } = render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNav />
    </MemoryRouter>,
  );
  const active = screen.getAllByRole('link').find((link) => link.getAttribute('aria-current') === 'page');
  const label = active?.getAttribute('aria-label') ?? active?.textContent ?? null;
  unmount();
  return label;
}

it('вложенные адреса подсвечивают свою вкладку', () => {
  expect(activeTab('/materials/notes/gh:Конспекты/ДМ/Лекция_1/Графы.md')).toBe('Материалы');
  expect(activeTab('/files/Материалы/ДМ')).toBe('Материалы');
  expect(activeTab('/links')).toBe('Материалы');
  expect(activeTab('/schedule')).toBe('Расписание');
  expect(activeTab('/deadlines')).toBe('Дедлайны');
  expect(activeTab('/deadlines?tab=homework')).toBe('Дедлайны');
});

it('разделы вне панели подсвечивают «Ещё» с названием этого раздела', () => {
  expect(activeTab('/today')).toBe('Ещё — сейчас: Главная');
  expect(activeTab('/subjects/dm')).toBe('Ещё — сейчас: Предметы');
  expect(activeTab('/more')).toBe('Ещё');
});

it('в панели четыре вкладки в нужном порядке', () => {
  render(
    <MemoryRouter initialEntries={['/deadlines']}>
      <MobileNav />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Материалы', 'Расписание', 'Дедлайны', 'Ещё']);
});
