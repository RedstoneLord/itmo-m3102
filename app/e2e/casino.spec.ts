import { expect, test } from '@playwright/test';
import { mockGithub } from './github';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00+03:00'));
  await mockGithub(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('m3102:settings')) localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
  });
});

test('казино: хаб ведёт ко всем играм группы, все страницы открываются без ошибок, «Казино» подсвечено в меню', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('./#/casino');
  await expect(page.getByRole('heading', { level: 1, name: 'Казино' })).toBeVisible();
  for (const game of ['Колючий куш', 'Блэкджек', 'Рулетка']) await expect(page.getByRole('link', { name: new RegExp(game) })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Казино' })).toHaveAttribute('aria-current', 'page');

  // Игры — файлы группы, подключённые как есть: каждая рисует свою страницу в #content
  for (const [link, title] of [
    [/Блэкджек/, 'Блэкджек'],
    [/Рулетка/, 'Рулетка'],
    [/Колючий куш/, 'Колючий куш'],
  ] as const) {
    await page.goto('./#/casino');
    await page.getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('#content')).toHaveCount(1);
  }

  await page.goto('./#/collection');
  await expect(page.getByRole('heading', { level: 1, name: 'Коллекция' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('казино: «Ёжик» из хаба ведёт в нашу игру, а уход со страницы убирает её #content', async ({ page }) => {
  await page.goto('./#/blackjack');
  await expect(page.getByRole('heading', { level: 1, name: 'Блэкджек' })).toBeVisible();
  await page.goto('./#/hedgehog');
  await expect(page).toHaveURL(/#\/game$/);
  await expect(page.locator('#content')).toHaveCount(0);
});
