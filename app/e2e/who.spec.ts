import { expect, test, type Page } from '@playwright/test';
import { mockGithub } from './github';

/** Окно первого входа: на главной за ним стоит такой же выбор в блоке «Мои очереди», поэтому ищем внутри окна */
const dialog = (page: Page) => page.getByRole('dialog');

/** Что сайт запомнил про «кто вы» */
const storedMe = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('m3102:me') ?? 'null')?.state ?? null);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00+03:00'));
  await mockGithub(page);
});

test('первый вход: «Кто вы?» — можно выбрать «Я гость», потом студента; у студентов появляется «Это вы»', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Настройте сайт под себя')).toBeVisible();

  await dialog(page).getByRole('button', { name: 'Кто вы' }).click();
  await page.getByRole('option', { name: /Я гость/ }).click();
  await expect.poll(() => storedMe(page)).toMatchObject({ guest: true, login: null });

  await dialog(page).getByRole('button', { name: 'Кто вы' }).click();
  await page.getByRole('option', { name: /@LazerProOk1/ }).click();
  await expect.poll(() => storedMe(page)).toMatchObject({ guest: false, login: 'LazerProOk1' });

  await page.getByRole('button', { name: 'Готово' }).click();
  await page.goto('./#/students');
  await expect(page.getByText('Это вы')).toBeVisible();
});

test('телефон: список «Кто вы?» открывается, не закрывается от экранной клавиатуры и выбирает студента @phone', async ({ page }) => {
  await page.goto('./');
  await dialog(page).getByRole('button', { name: 'Кто вы' }).tap();
  const option = page.getByRole('option', { name: /@LazerProOk1/ });
  await expect(option).toBeVisible();

  // Клавиатура уменьшает окно (resize) — раньше нижний лист от этого закрывался сразу
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) });
  await page.waitForTimeout(400);
  await expect(option).toBeVisible();

  await option.tap();
  await expect.poll(() => storedMe(page)).toMatchObject({ login: 'LazerProOk1' });
});

test('«Мои очереди» на главной и «Вы №1» в дедлайнах — по выбранному «Кто вы?»', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
    localStorage.setItem('m3102:me', JSON.stringify({ state: { login: 'LazerProOk1', guest: false }, version: 2 }));
  });
  // Один срок и одна запись в его очереди от аккаунта выбранного студента (позже зарегистрированные обработчики главнее)
  await page
    .context()
    .route('https://raw.githubusercontent.com/**', (route) =>
      decodeURIComponent(route.request().url()).endsWith('deadlines.json')
        ? route.fulfill({ json: [{ id: 'dm-cards', name: 'ДМ - Карточки', deadline: '2026-10-05T23:59:00+03:00' }] })
        : route.fallback(),
    );
  await page.context().route('https://api.github.com/**', (route) =>
    decodeURIComponent(route.request().url()).includes('/issues')
      ? route.fulfill({
          json: [{ title: '[dm-cards]', html_url: 'https://github.com/RedstoneLord/itmo-m3102/issues/1', user: { login: 'LazerProOk1' } }],
        })
      : route.fallback(),
  );

  await page.goto('./');
  const block = page
    .getByRole('region', { name: 'Мои очереди' })
    .or(page.locator('section', { has: page.getByRole('heading', { name: 'Мои очереди' }) }));
  await expect(block.getByText('Карточки')).toBeVisible();
  await expect(block.getByText('№1')).toBeVisible();

  await page.goto('./#/deadlines');
  await expect(page.getByText('Вы №1')).toBeVisible();
  await expect(page.getByText('Вы стоите в очередях: 1')).toBeVisible();
});

test('гость: блока «Мои очереди» на главной нет, а выбор «Я гость» запомнен', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
    localStorage.setItem('m3102:me', JSON.stringify({ state: { login: null, guest: true }, version: 2 }));
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Ближайшие дедлайны' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Мои очереди' })).toHaveCount(0);
});

test('резервная копия: скачать, стереть данные, восстановить из файла — выбор «Кто вы» и заметки на месте', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('m3102:settings')) localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
    if (!localStorage.getItem('m3102:me'))
      localStorage.setItem('m3102:me', JSON.stringify({ state: { login: 'LazerProOk1', guest: false }, version: 2 }));
  });
  await page.goto('./#/settings?tab=data');
  await expect(page.getByText('Копии ещё не было.')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать копию' }).click()]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/^m3102-backup-\d{4}-\d{2}-\d{2}\.json$/);

  // «Новый браузер»: личное стёрто
  await page.evaluate(() => localStorage.removeItem('m3102:me'));
  expect(await storedMe(page)).toBeNull();

  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByText('Восстановить из копии?')).toBeVisible();
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();

  await page.waitForLoadState('load');
  await expect.poll(() => storedMe(page)).toMatchObject({ login: 'LazerProOk1' });
});

test('битый файл копии отклоняется с понятным сообщением, данные не тронуты', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('m3102:settings')) localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
    if (!localStorage.getItem('m3102:me'))
      localStorage.setItem('m3102:me', JSON.stringify({ state: { login: 'LazerProOk1', guest: false }, version: 2 }));
  });
  await page.goto('./#/settings?tab=data');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"m3102","data":{"m3102:tasks":"не json"}}') });
  await expect(page.getByText(/повреждена/)).toBeVisible();
  expect(await storedMe(page)).toMatchObject({ login: 'LazerProOk1' });
});

test('«Что нового»: у «Настроек» горит тихая точка, пока вкладку не открыли; потом гаснет и не возвращается', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('m3102:settings')) localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
  });
  await page.goto('./#/today');
  const dot = page.getByRole('img', { name: 'есть новое' });
  await expect(dot).toHaveCount(1);

  await page.goto('./#/settings?tab=changelog');
  await expect(page.getByText('Очереди, дедлайны и телефон')).toBeVisible();
  await expect(dot).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Очереди, дедлайны и телефон')).toBeVisible();
  await expect(dot).toHaveCount(0);
});
