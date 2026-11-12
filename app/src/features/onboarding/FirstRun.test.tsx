// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';
import { useMeStore } from '../group/meStore';
import { useSettingsStore } from '../settings/settingsStore';
import { FirstRun } from './FirstRun';
import { PALETTE_PAIRS } from './palettePairs';

beforeEach(() => {
  useSettingsStore.setState({ style: 'aurora', theme: 'system', accent: 'lavender', accent2: 'dusty', dynamicTheme: 'off' });
  useMeStore.setState({ login: null, guest: true });
});

/** Окно открыто, закрытие — как в AppShell: просто прячет его */
function Harness() {
  const [open, setOpen] = useState(true);
  return <FirstRun open={open} onClose={() => setOpen(false)} />;
}

const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 });

it('три выбора применяются сразу, «Готово» закрывает окно', async () => {
  render(<Harness />);
  const dialog = screen.getByRole('dialog', { name: 'Настройте сайт под себя' });
  expect(['Стиль', 'Тема', 'Палитра'].map((name) => screen.getByRole('radiogroup', { name }))).toHaveLength(3);
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

  await userEvent.click(screen.getByRole('radio', { name: 'Liquid Glass' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Тёмная' }));
  const pair = PALETTE_PAIRS.find((item) => item.id.startsWith('group-'))!;
  await userEvent.click(screen.getByRole('radio', { name: pair.name }));
  expect(useSettingsStore.getState()).toMatchObject({ style: 'glass', theme: 'dark', accent: pair.a, accent2: pair.b });

  await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
  await closed();
});

it('Esc закрывает окно; выбранное остаётся', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('radio', { name: 'Minimalism' }));
  await userEvent.keyboard('{Escape}');
  expect(useSettingsStore.getState().style).toBe('minimal');
  await closed();
});

it('палитра выключает динамическую тему, иначе выбранная пара не была бы видна', async () => {
  useSettingsStore.setState({ dynamicTheme: '15' });
  render(<Harness />);
  await userEvent.click(screen.getByRole('radio', { name: PALETTE_PAIRS[0]!.name }));
  expect(useSettingsStore.getState().dynamicTheme).toBe('off');
});

it('пока «Кто вы?» не выбрано, окно не закрыть: нет крестика, Esc не действует, «Готово» неактивна', async () => {
  useMeStore.setState({ login: null, guest: false });
  render(<Harness />);
  expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull();
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Готово' })).toHaveProperty('disabled', true);
  useMeStore.setState({ guest: true });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Готово' })).toHaveProperty('disabled', false));
  await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
  await closed();
});

it('закрытое окно ничего не рисует', () => {
  render(<FirstRun open={false} onClose={() => undefined} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
