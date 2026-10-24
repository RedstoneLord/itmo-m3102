// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { expect, it } from 'vitest';
import { useLectureNotesStore } from '../materials/lectureNotesStore';
import { SearchDialog } from './SearchDialog';

function Where() {
  return <p data-testid="where">{decodeURIComponent(useLocation().pathname)}</p>;
}

it('поиск: находит конспект по тексту внутри, Enter открывает его', async () => {
  const now = new Date().toISOString();
  useLectureNotesStore.setState({
    lectureNotes: [
      {
        id: 'gh:Конспекты/АиСД/master.md',
        subjectId: 'aisd',
        lectureNumber: 'Практика 3',
        title: 'Мастер-теорема',
        contentType: 'markdown',
        content: '# Мастер-теорема\n\nРекуррента T(n) = aT(n/b) + f(n) решается сравнением f(n) с n^log_b(a).',
        source: 'github',
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  render(
    <MemoryRouter>
      <SearchDialog open onClose={() => {}} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

  await userEvent.type(screen.getByRole('textbox', { name: 'Поиск' }), 'рекуррента');
  expect(await screen.findByText('Практика 3. Мастер-теорема')).toBeTruthy();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByTestId('where').textContent).toBe('/materials/notes/gh:Конспекты/АиСД/master.md');
});

it('поиск: найденное в тексте — с разделом и выделенным словом, стрелки идут по разделам', async () => {
  const now = new Date().toISOString();
  useLectureNotesStore.setState({
    lectureNotes: [
      {
        id: 'gh:Конспекты/ДМ/graphs.md',
        subjectId: 'dm',
        lectureNumber: 'Лекция 1',
        title: 'Графы',
        contentType: 'markdown',
        content: '## Определение\n\nГраф — пара множеств. Слово-маячок: зюзюка.\n\n## Степени\n\nЗюзюка встречается и здесь.',
        source: 'github',
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  render(
    <MemoryRouter>
      <SearchDialog open onClose={() => {}} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

  await userEvent.type(screen.getByRole('textbox', { name: 'Поиск' }), 'зюзюка');
  const options = await screen.findAllByRole('option');
  expect(options).toHaveLength(2);
  expect(options[0]?.textContent).toContain('Определение');
  expect(options[1]?.textContent).toContain('Степени');
  expect([...document.querySelectorAll('mark')].map((mark) => mark.textContent?.toLowerCase())).toEqual(['зюзюка', 'зюзюка']);
  expect(options[0]?.getAttribute('aria-selected')).toBe('true');

  await userEvent.keyboard('{ArrowDown}');
  expect(options[1]?.getAttribute('aria-selected')).toBe('true');
  await userEvent.keyboard('{Enter}');
  expect(screen.getByTestId('where').textContent).toBe('/materials/notes/gh:Конспекты/ДМ/graphs.md');
});

it('поиск: пока текст PDF недоступен, говорит об этом, а не только «ничего не найдено»', async () => {
  useLectureNotesStore.setState({ lectureNotes: [] });
  render(
    <MemoryRouter>
      <SearchDialog open onClose={() => {}} />
    </MemoryRouter>,
  );

  await userEvent.type(screen.getByRole('textbox', { name: 'Поиск' }), 'несуществующееслово');
  expect(await screen.findByText(/Текст PDF-конспектов недоступен/)).toBeTruthy();
});
