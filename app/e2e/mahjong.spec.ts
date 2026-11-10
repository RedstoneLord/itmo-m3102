import { expect, test } from '@playwright/test';
import { mockGithub } from './github';

test.beforeEach(async ({ page }) => {
  await mockGithub(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('m3102:settings')) localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
  });
});

test('маджонг: «Ещё», пары, отмена и сохранение партии', async ({ page }) => {
  await page.goto('./#/more');
  await page.getByRole('main').getByRole('link', { name: 'Маджонг' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Маджонг' })).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Сочетания клавиш' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Ёжик-кувырок')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Начать игру' }).click();
  const tiles = page.locator('[data-tile]');
  await expect(tiles).toHaveCount(80);
  await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
  const ids = await page.locator('[data-hint="true"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-tile')));
  for (const id of ids) await page.locator(`[data-tile="${id}"]`).click();
  await expect(tiles).toHaveCount(78);
  await page.reload();
  await expect(tiles).toHaveCount(78);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(tiles).toHaveCount(80);
  await page.getByRole('button', { name: 'Перемешать', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'есть решение' })).toBeVisible();
});

test('маджонг: телефон и две темы без горизонтальной прокрутки @phone', async ({ page }) => {
  await page.goto('./#/mahjong');
  await page.getByRole('button', { name: 'Начать игру' }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('[data-tile]').first()).toBeVisible();
  }
});

test('маджонг: полная победа пополняет общий баланс ровно один раз', async ({ page }) => {
  const { pairs } = await import('../src/features/mahjong/engine');
  type Tile = import('../src/features/mahjong/engine').Tile;
  function solve(tiles: Tile[], seen = new Set<string>()): number[][] | null {
    if (!tiles.length) return [];
    const key = tiles.map((t) => t.id).join(',');
    if (seen.has(key)) return null;
    seen.add(key);
    for (const [a, b] of pairs(tiles)) {
      const rest = solve(tiles.filter((t) => t.id !== a.id && t.id !== b.id), seen);
      if (rest) return [[a.id, b.id], ...rest];
    }
    return null;
  }
  await page.goto('./#/mahjong');
  await page.getByRole('combobox').selectOption('0');
  await page.getByRole('button', { name: 'Начать игру' }).click();
  const board = await page.evaluate(() => JSON.parse(localStorage.getItem('m3102:mahjong')!).state.game.tiles as Tile[]);
  const path = solve(board);
  expect(path).not.toBeNull();
  for (const pair of path!) for (const id of pair) await page.locator(`[data-tile="${id}"]`).click();
  await expect(page.getByRole('heading', { name: 'Сад собран!' })).toBeVisible();
  const balance = await page.evaluate(() => JSON.parse(localStorage.getItem('hh_save_v1')!).berries as number);
  expect(balance).toBeGreaterThanOrEqual(20);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Сад собран!' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hh_save_v1')!).berries)).toBe(balance);
  await page.goto('./#/collection');
  await expect(page.getByRole('heading', { level: 1, name: 'Коллекция' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hh_save_v1')!).berries)).toBe(balance);
});
