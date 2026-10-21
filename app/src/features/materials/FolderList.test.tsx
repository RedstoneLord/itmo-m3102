// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { expect, it, vi } from 'vitest';
import type { LectureNote } from '../../types/models';
import { FolderList } from './LectureNotesTab';

const note = (id: string, lectureNumber: string, title: string) => ({ id, lectureNumber, title }) as LectureNote;

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function setup(onSelect = vi.fn()) {
  const notes = [
    note('gh:a/p6.md', 'Практика 6', 'Определители'),
    note('gh:a/l1.md', 'Лекция 1', 'Матрицы'),
    note('gh:a/l1b.md', 'Лекция 1', 'Ранг'),
  ];
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<FolderList notes={notes} onSelect={onSelect} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onSelect;
}

it('в папке один конспект — нажатие открывает его сразу', () => {
  const onSelect = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Практика 6' }));
  expect(screen.getByTestId('where').textContent).toBe('/materials/notes/gh:a/p6.md');
  expect(onSelect).not.toHaveBeenCalled();
});

it('в папке несколько конспектов — открывается список папки', () => {
  const onSelect = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Лекция 1' }));
  expect(onSelect).toHaveBeenCalledWith('Лекция 1');
});
