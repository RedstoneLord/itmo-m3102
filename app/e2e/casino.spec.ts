import { expect, test } from '@playwright/test';
import { mockGithub } from './github';

// Первое открытие казино тянет цепочку модулей игры, а превью с шестью соединениями при параллельных тестах отдаёт её после предзагрузки всех страниц: 5 с по умолчанию мало
const FIRST_PAINT = { timeout: 20_000 };

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
  await expect(page.getByRole('heading', { level: 1, name: 'Казино' })).toBeVisible(FIRST_PAINT);
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
  await expect(page.getByRole('heading', { level: 1, name: 'Блэкджек' })).toBeVisible(FIRST_PAINT);
  await page.goto('./#/hedgehog');
  await expect(page).toHaveURL(/#\/game$/);
  await expect(page.locator('#content')).toHaveCount(0);
});

test('коллекция: открытая вкладка пишется в адрес (#/collection/…), и перезагрузка или ссылка на неё не уводят на главную', async ({ page }) => {
  await page.goto('./#/collection');
  await expect(page.getByRole('heading', { level: 1, name: 'Коллекция' })).toBeVisible(FIRST_PAINT);
  await page.getByRole('tab', { name: 'Ежедневно и колесо' }).click();
  await expect(page).toHaveURL(/#\/collection\/\w+/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Коллекция' })).toBeVisible(FIRST_PAINT);
  await expect(page.getByRole('tab', { name: 'Ежедневно и колесо' })).toHaveAttribute('aria-selected', 'true', FIRST_PAINT);
});

test('коллекция: шляпу можно купить и надеть, она сразу видна в сводке «Надето сейчас» и остаётся после перезагрузки', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('hh_save_v1')) localStorage.setItem('hh_save_v1', JSON.stringify({ berries: 500, owned: ['none'], hat: 'none' }));
  });
  await page.goto('./#/collection');
  await expect(page.getByRole('heading', { level: 1, name: 'Коллекция' })).toBeVisible(FIRST_PAINT);
  const now = page.getByRole('region', { name: 'Надето сейчас' });
  await expect(now).toContainText('без шляпы');

  await page.getByRole('button', { name: 'Купить за 25', exact: true }).click();
  await expect(now).toContainText('Колпачок');
  await page.getByRole('button', { name: 'Снять', exact: true }).first().click();
  await expect(now).toContainText('без шляпы');
  await page.getByRole('button', { name: 'Надеть' }).first().click();
  await expect(now).toContainText('Колпачок');

  await page.reload();
  await expect(now).toContainText('Колпачок', FIRST_PAINT);
});
