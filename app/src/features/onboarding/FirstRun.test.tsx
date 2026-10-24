// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { useSettingsStore } from '../settings/settingsStore';
import { FirstRun } from './FirstRun';
import { PALETTE_PAIRS } from './palettePairs';

beforeEach(() => {
  useSettingsStore.setState({ onboarded: false, style: 'aurora', theme: 'system', accent: 'lavender', accent2: 'dusty', dynamicTheme: 'off' });
});

const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 });

it('показывает три шага, выбор применяется сразу, «Готово» закрывает окно', async () => {
  render(<FirstRun />);
  const dialog = screen.getByRole('dialog', { name: 'Настройте сайт под себя' });
  expect(['Стиль', 'Тема', 'Палитра'].map((name) => screen.getByRole('radiogroup', { name }))).toHaveLength(3);
  // Фокус внутри окна — на первом выборе
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

  await userEvent.click(screen.getByRole('radio', { name: 'Liquid Glass' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Тёмная' }));
  const pair = PALETTE_PAIRS.find((item) => item.id.startsWith('group-'))!;
  await userEvent.click(screen.getByRole('radio', { name: pair.name }));
  expect(useSettingsStore.getState()).toMatchObject({ style: 'glass', theme: 'dark', accent: pair.a, accent2: pair.b, onboarded: false });

  await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
  expect(useSettingsStore.getState().onboarded).toBe(true);
  await closed();
});

it('«Пропустить» и Esc тоже закрывают окно; выбранное остаётся', async () => {
  const view = render(<FirstRun />);
  await userEvent.click(screen.getByRole('radio', { name: 'Minimalism' }));
  await userEvent.click(screen.getByRole('button', { name: 'Пропустить' }));
  expect(useSettingsStore.getState()).toMatchObject({ onboarded: true, style: 'minimal' });
  await closed();
  view.unmount();

  useSettingsStore.setState({ onboarded: false });
  render(<FirstRun />);
  await userEvent.keyboard('{Escape}');
  expect(useSettingsStore.getState().onboarded).toBe(true);
  await closed();
});

it('палитра выключает динамическую тему, иначе выбранная пара не была бы видна', async () => {
  useSettingsStore.setState({ dynamicTheme: '15' });
  render(<FirstRun />);
  await userEvent.click(screen.getByRole('radio', { name: PALETTE_PAIRS[0]!.name }));
  expect(useSettingsStore.getState().dynamicTheme).toBe('off');
});

it('у уже показанного окна нет: onboarded = true — ничего не рисуется', () => {
  useSettingsStore.setState({ onboarded: true });
  render(<FirstRun />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
