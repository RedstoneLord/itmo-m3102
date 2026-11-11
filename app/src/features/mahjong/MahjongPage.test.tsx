// @vitest-environment jsdom
import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MahjongPage from './MahjongPage';

it('монтирует общий маджонг в StrictMode, продолжает сохранение и очищает подписки', () => {
  vi.useFakeTimers();
  const timers = vi.spyOn(window, 'setInterval');
  const stopTimers = vi.spyOn(window, 'clearInterval');
  const casinoCleanup = vi.fn();
  window.__hhDestroy = casinoCleanup;
  const view = render(
    <StrictMode>
      <MahjongPage />
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Начать игру' }));
  expect(view.container.querySelectorAll('[data-tile]')).toHaveLength(80);
  const saved = localStorage.getItem('m3102:mahjong')!;
  fireEvent.click(screen.getByRole('button', { name: 'Подсказка' }));
  const pair = [...view.container.querySelectorAll('[data-hint="true"]')];
  expect(pair).toHaveLength(2);
  const ids = pair.map((tile) => tile.getAttribute('data-tile'));
  ids.forEach((id) => fireEvent.click(view.container.querySelector(`[data-tile="${id}"]`)!));
  expect(view.container.querySelectorAll('[data-tile]')).toHaveLength(78);
  localStorage.setItem('m3102:mahjong', saved);
  fireEvent(window, new StorageEvent('storage', { key: 'm3102:mahjong' }));
  expect(view.container.querySelectorAll('[data-tile]')).toHaveLength(80);
  expect(screen.getByRole('link', { name: /Ещё/ }).getAttribute('href')).toBe('#/more');
  view.unmount();
  expect(timers.mock.results.length).toBeGreaterThan(0);
  timers.mock.results.forEach(({ value }) => expect(stopTimers).toHaveBeenCalledWith(value));
  expect(window.__hhDestroy).toBe(casinoCleanup);
  expect(casinoCleanup).not.toHaveBeenCalled();
  delete window.__hhDestroy;
  timers.mockRestore();
  stopTimers.mockRestore();
  vi.useRealTimers();
});
