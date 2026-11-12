import { expect, test } from '@playwright/test';
import { mockGithub } from './github';

// Первое открытие тянет ленивые куски (страница карточек, Markdown с формулами): под параллельными воркерами 5 с мало
const FIRST_PAINT = { timeout: 20_000 };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00+03:00'));
  await mockGithub(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('m3102:settings')) localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
    if (!localStorage.getItem('m3102:me')) localStorage.setItem('m3102:me', JSON.stringify({ state: { login: null, guest: true }, version: 2 }));
  });
});

test('карточки: вкладка предмета, занятие с клавиатуры, оценка запоминается между заходами', async ({ page }) => {
  await page.goto('./#/subjects/aisd?tab=cards');
  await expect(page.getByRole('tab', { name: 'Карточки', selected: true })).toBeVisible(FIRST_PAINT);
  await expect(page.getByText('Мастер-Теорема')).toBeVisible(FIRST_PAINT);
  // У предмета много конспектов с карточками: общая кнопка «Начать» открыла бы первый, нужен именно этот
  await page.getByRole('link', { name: /Мастер-Теорема/ }).click();

  await expect(page.getByText('1 из 17')).toBeVisible(FIRST_PAINT);
  await expect(page.getByText('Что описывает рекуррентность')).toBeVisible(FIRST_PAINT);
  await page.keyboard.press('Space');
  await expect(page.getByText('Ответ', { exact: true })).toBeVisible();
  // «Не помню» возвращает карточку в конец этого же занятия: в очереди их становится 18
  await page.keyboard.press('1');
  await expect(page.getByText('2 из 18')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(page.getByText('3 из 18')).toBeVisible();

  // Новое занятие: «хорошо» подойдёт завтра и не показывается, «не помню» (срок сегодня) идёт первой, остальные новые
  await page.reload();
  await expect(page.getByText('1 из 16')).toBeVisible(FIRST_PAINT);
  await expect(page.getByText('Что описывает рекуррентность')).toBeVisible();
});

test('карточки: ответ со схемой и формулами открывается по кнопке, оценки подписаны сроками', async ({ page }) => {
  await page.goto(`./#/cards?note=${encodeURIComponent('алгоритмы_и_структуры_данных/практика_3/мастер-теорема')}`);
  await expect(page.getByRole('button', { name: 'Показать ответ' })).toBeVisible(FIRST_PAINT);
  // Третья карточка — с деревом рекурсии
  for (let step = 0; step < 2; step++) {
    await page.getByRole('button', { name: 'Показать ответ' }).click();
    await page.getByRole('button', { name: /Хорошо/ }).click();
  }
  await page.getByRole('button', { name: 'Показать ответ' }).click();
  await expect(page.getByRole('button', { name: 'Увеличить' }).first()).toBeVisible(FIRST_PAINT);
  await expect(page.getByRole('button', { name: /Не помню/ })).toContainText('сейчас');
  await expect(page.getByRole('button', { name: /Хорошо/ })).toContainText('завтра');
  await expect(page.getByRole('button', { name: /Легко/ })).toContainText('3 дн.');
});
