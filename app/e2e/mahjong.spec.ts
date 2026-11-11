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
    await page.getByRole('button', { name: 'Крупнее', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('group', { name: /Игровое поле/ }).evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(460);
    await page.getByRole('button', { name: 'Всё поле', exact: true }).click();
    const board = await page.getByRole('group', { name: /Игровое поле/ }).boundingBox();
    const hint = page.getByRole('button', { name: 'Подсказка', exact: true });
    await hint.scrollIntoViewIfNeeded();
    const currentBoard = await page.getByRole('group', { name: /Игровое поле/ }).boundingBox();
    const tools = await hint.boundingBox();
    expect(board).not.toBeNull();
    expect(tools!.y).toBeGreaterThanOrEqual(currentBoard!.y + currentBoard!.height);

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

for (const reduced of [false, true]) {
  test(`маджонг: прежние ёжики, отмена и прогресс${reduced ? ', уменьшение движения' : ''}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.addInitScript(() => {
      localStorage.setItem('m3102:mahjong', JSON.stringify({ version: 1, state: { wins: 0, total: 0, game: {
        id: 'legacy-hedgehogs', level: 0, rows: 6, offset: 1, history: [], combo: 0, best: 0, lastMatch: 0, assists: 0, earned: 0,
        tiles: [
          { id: 0, x: 0, y: 1, z: 0, kind: 9 }, { id: 1, x: 1, y: 1, z: 0, kind: 11 },
          { id: 2, x: 0, y: 3, z: 0, kind: 0 }, { id: 3, x: 1, y: 3, z: 0, kind: 0 },
        ],
      } } }));
    });
    await page.goto('./#/mahjong');
    await expect(page.locator('[data-tile="0"]')).toHaveAccessibleName(/^Ёжик/);
    await expect(page.locator('[data-tile="1"]')).toHaveAccessibleName(/^Ёжик/);
    await page.locator('[data-tile="0"]').click();
    await page.locator('[data-tile="1"]').click();
    await expect(page.locator('[data-tile]')).toHaveCount(2);
    await expect(page.getByRole('progressbar', { name: 'Прогресс сада' })).toHaveAttribute('value', '46');
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(page.locator('[data-tile]')).toHaveCount(4);
    await expect(page.getByRole('progressbar', { name: 'Прогресс сада' })).toHaveAttribute('value', '44');
    for (const id of [0, 1, 2, 3]) await page.locator(`[data-tile="${id}"]`).click();
    await expect(page.getByRole('heading', { name: 'Сад собран!' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Прогресс сада' })).toHaveAttribute('value', '48');
  });
}

test('маджонг: одно поле, оформление и продолжение партии между версиями', async ({ page }) => {
  // Проверяем сам классический модуль без загрузчика контента и внешних CDN классического сайта.
  await page.route('**/mahjong-classic-test.html', (route) => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html lang="ru"><head><link rel="stylesheet" href="/css/mahjong.css"></head>
    <body><div id="content"></div><script type="module">
      import { renderMahjongPage } from '/js/mahjong.js'; renderMahjongPage();
    </script></body></html>` }));
  await page.goto('../mahjong-classic-test.html');
  await page.getByRole('button', { name: 'Начать игру', exact: true }).click();
  const tile = page.locator('[data-free="true"][data-tile]').first();
  const appearance = await tile.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.backgroundImage, s.boxShadow, s.borderRadius];
  });
  await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
  const ids = await page.locator('[data-hint="true"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-tile')));
  for (const id of ids) await page.locator(`[data-tile="${id}"]`).click();
  const saved = await page.evaluate(() => localStorage.getItem('m3102:mahjong'));
  await page.goto('./#/mahjong');
  await expect(page.locator('[data-tile]')).toHaveCount(78);
  expect(await page.evaluate(() => localStorage.getItem('m3102:mahjong'))).toBe(saved);
  // Сравниваем свободную кость того же типа состояния, а не случайный символ раскладки.
  const style = await page.locator('[data-free="true"][data-tile]').first().evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.backgroundImage, s.boxShadow, s.borderRadius];
  });
  expect(style).toEqual(appearance);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.locator('[data-tile]')).toHaveCount(80);
});
