// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { useGroupStore } from '../group/groupStore';
import { useHomeworkStore } from '../homework/homeworkStore';
import { ClassicImport } from './ClassicImport';

const BUTTON = 'Перенести отметки из классической версии';

beforeEach(() => {
  localStorage.clear();
  useHomeworkStore.setState({ done: {} });
  useGroupStore.setState({ deadlinesDone: {} });
});

it('классических ключей нет — строки импорта нет', () => {
  const { container } = render(<ClassicImport />);
  expect(container.textContent).toBe('');
});

it('сначала превью, перенос — отдельной кнопкой; после переноса отметки видны, а повторно переносить нечего', async () => {
  localStorage.setItem('m3102-hw-done-v1', JSON.stringify({ 'hw-1': '2026-10-08T23:00:52.587Z', 'hw-2': null }));
  localStorage.setItem('m3102-study-plan-v1', JSON.stringify({ tasks: [], done: { 'deadline:dm-hw': true, 'deadline:op-lab1': false } }));
  render(<ClassicImport />);

  await userEvent.click(screen.getByRole('button', { name: BUTTON }));
  // Превью ничего не меняет
  expect(screen.getByText('Найдено в классической версии')).toBeTruthy();
  expect(useHomeworkStore.getState().done).toEqual({});
  expect(useGroupStore.getState().deadlinesDone).toEqual({});
  expect(screen.getByText('Выполненных ДЗ').nextSibling?.textContent).toBe('1');
  expect(screen.getByText('Выполненных дедлайнов').nextSibling?.textContent).toBe('1');
  expect(screen.getByText('Новых для этой версии').nextSibling?.textContent).toBe('2');

  await userEvent.click(screen.getByRole('button', { name: 'Перенести' }));
  expect(useHomeworkStore.getState().done).toEqual({ 'hw-1': '2026-10-08T23:00:52.587Z' });
  expect(useGroupStore.getState().deadlinesDone).toEqual({ 'dm-hw': true });
  expect(screen.getByText('Перенесено отметок: 2.')).toBeTruthy();

  // Ещё раз: найдено то же, нового нет — кнопка «Перенести» недоступна
  await userEvent.click(screen.getByRole('button', { name: BUTTON }));
  expect(screen.getByText('Новых для этой версии').nextSibling?.textContent).toBe('0');
  expect((screen.getByRole('button', { name: 'Перенести' }) as HTMLButtonElement).disabled).toBe(true);
});

it('«Отмена» закрывает превью без изменений', async () => {
  localStorage.setItem('m3102-hw-done-v1', JSON.stringify({ 'hw-1': '2026-10-08T23:00:52.587Z' }));
  render(<ClassicImport />);
  await userEvent.click(screen.getByRole('button', { name: BUTTON }));
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.queryByText('Найдено в классической версии')).toBeNull();
  expect(useHomeworkStore.getState().done).toEqual({});
});
