import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { importPersonalTimetable, dateRange } from '../classic/live-timetable.js';

const original = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const day = '2026-11-18';
const seed = { anchorMonday: '2026-11-16', anchorParity: 'even', defaultLocation: 'Кронверкский', vacations: [], overrides: {},
  cycle: Array.from({ length: 14 }, (_, i) => i % 7 === 2 ? [
    { id: `dm-${i}`, subject: 'Дискретная математика', kind: 'practice', start: '13:30', end: '15:00', room: '2240', teacher: 'Т', location: 'Кронверкский' },
    { id: `aisd-${i}`, subject: 'Алгоритмы и структуры данных', kind: 'practice', start: '15:30', end: '17:00', room: '2240', teacher: 'Т', location: 'Кронверкский' },
  ] : []),
};
const live = importPersonalTimetable([{ code: 0, data: dateRange('2026-11-16', '2026-11-22').map(date => ({ date, lessons: date === day ? [
  { pair_id: 1, subject: 'Дискретная математика', group: 'ДМ(M3102)', work_type_id: 2,
    time_start: '13:30', time_end: '15:00', room: '1330', teacher_name: 'Т', building: 'Кронверкский' },
] : [] })) }], '2026-11-16', '2026-11-22', '2026-11-18T08:30:00Z');

async function prepare(page: Page, theme = 'dark') {
  await page.clock.install({ time: new Date('2026-11-18T12:00:00+03:00') });
  await page.context().route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.fulfill({
    contentType: route.request().url().endsWith('.css') ? 'text/css' : 'text/javascript',
    body: route.request().url().includes('/marked/') ? 'window.marked={use(){}};' : '',
  }));
  await page.context().route('**/data/schedule.json', route => route.fulfill({ json: seed }));
  await page.context().route('**/data/timetable-live.json', route => route.fulfill({ json: live }));
  await page.addInitScript(theme => {
    Math.random = () => .5;
    if (localStorage.getItem('__versions_fixture')) return;
    localStorage.setItem('__versions_fixture', '1');
    localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme }));
    localStorage.setItem('m3102-setup-v1', '{"version":1,"completed":true}');
    localStorage.setItem('m3102-home-layout-v1', '{"version":2,"order":[],"visible":[]}');
    localStorage.setItem('m3102-study-plan-v1', '{"tasks":[{"id":"keep","name":"Сохранённая задача"}],"done":{"keep":true}}');
  }, theme);
}

test.describe('Legacy and Classic', () => {
  test.use({ serviceWorkers: 'block' });
  for (const theme of ['light', 'dark']) test(`Legacy restores the original surfaces and emoji (${theme}) @phone`, async ({ page }, info) => {
    await prepare(page, theme);
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'no-preference' });
    await page.route('**/legacy-reference.html', route => route.fulfill({ contentType: 'text/html', body: original
      .replace('<head>', '<head><base href="/">')
      .replace(/<link[^>]+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Noto[^>]+>/, '<link rel="stylesheet" href="/css/home-fonts.css">') }));
    const surfaces = () => page.evaluate(() => Object.fromEntries(['body', '.home-hero', '.home-hero::before', '.home-hero h1', '.hero-orbit', '.hero-hedgehog', '.dash-panel'].map(selector => {
      const [base, pseudo] = selector.split('::');
      const style = getComputedStyle(document.querySelector(base!)!, pseudo ? `::${pseudo}` : null);
      return [selector, Object.fromEntries(['backgroundColor', 'backgroundImage', 'color', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'padding', 'margin', 'animationName', 'animationDuration'].map(key => [key, style[key as keyof CSSStyleDeclaration]]))];
    })));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('../legacy-reference.html');
      await expect(page.locator('.hero-hedgehog')).toHaveText('🦔');
      const before = await surfaces();
      await page.goto('../');
      await expect(page.locator('html')).toHaveAttribute('data-classic-view', 'legacy');
      await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
      await expect(page.locator('.dashboard-grid > section:visible')).toHaveCount(6);
      await expect(page.locator('.hero-hedgehog')).toHaveText('🦔');
      expect(await surfaces()).toEqual(before);
      await expect(page.locator('.brand-logo')).toHaveCSS('filter', theme === 'light' ? 'invert(1)' : 'none');
      await page.screenshot({ path: info.outputPath(`legacy-${theme}-${width}.png`), fullPage: true });
    }
    const first = await page.locator('.hero-hedgehog').evaluate(el => ({ left: getComputedStyle(el).left, hop: getComputedStyle(el).translate }));
    await page.clock.fastForward(1400);
    const next = await page.locator('.hero-hedgehog').evaluate(el => ({ left: getComputedStyle(el).left, hop: getComputedStyle(el).translate }));
    expect(next).not.toEqual(first);
  });

  test('switching in settings remembers the version and preserves personal data', async ({ page }, info) => {
    await prepare(page);
    await page.goto('../#/settings');
    await expect(page.locator('[data-classic-view-choice]')).toHaveValue('legacy');
    await page.locator('[data-classic-view-choice]').selectOption('classic');
    await expect(page.locator('html')).toHaveAttribute('data-classic-view', 'classic');
    await page.getByRole('button', { name: 'Оформление', exact: true }).click();
    await expect(page.locator('[data-classic-view-choice]')).toHaveValue('classic');
    await page.goto('../');
    await expect(page.locator('.hero-hedgehog')).toHaveCount(0);
    await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
    await expect(page.locator('[data-home-none]')).toBeVisible();
    await page.screenshot({ path: info.outputPath('classic-dark.png'), fullPage: true });
    await page.goto('../#/settings?section=appearance');
    await page.locator('[data-classic-view-choice]').selectOption('legacy');
    await expect(page.locator('html')).toHaveAttribute('data-classic-view', 'legacy');
    await page.goto('../');
    await expect(page.locator('#plan-list')).toContainText('Сохранённая задача');
    await expect(page.locator('.hero-hedgehog')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('m3102-study-plan-v1')!).done.keep)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('m3102-student-v1'))).toBeNull();
    await page.goto('../#/settings');
    await page.getByRole('button', { name: 'Быстрая настройка', exact: true }).click();
    await expect(page.locator('[data-home-dialog]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('m3102-student-v1'))).toBeNull();
  });

  test('Legacy keeps live timetable warnings on the home page and the day view', async ({ page }) => {
    await prepare(page);
    await page.goto('../');
    await expect(page.locator('#legacy-today')).toContainText('Ауд. 1330');
    await expect(page.locator('#legacy-today')).toContainText('было 2240');
    await expect(page.locator('#legacy-today')).toContainText('Нет в расписании My ITMO');
    await page.goto(`../#/schedule/${day}`);
    await expect(page.locator('.live-day-banner')).toBeVisible();
    await expect(page.locator('.sched-entry.live-cancelled')).toBeVisible();
    await expect(page.locator('.sched-card').first()).toContainText('1330');
  });
  test('a fresh visitor without setup or identity opens Legacy without questions', async ({ page }) => {
    await prepare(page);
    await page.addInitScript(() => localStorage.removeItem('m3102-setup-v1'));
    await page.goto('../');
    await expect(page.locator('.hero-hedgehog')).toBeVisible();
    await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Я гость', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('m3102-student-v1'))).toBeNull();
  });
});

test('Legacy and Classic reopen and switch offline using the same saved timetable', async ({ page, context }) => {
  test.setTimeout(90_000);
  await prepare(page);
  await page.goto('../');
  await expect(page.locator('#legacy-today')).toContainText('1330');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.unrouteAll({ behavior: 'wait' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero-hedgehog')).toBeVisible();
  await expect(page.locator('#legacy-today')).toContainText('1330');
  await page.goto('../#/settings');
  await page.locator('[data-classic-view-choice]').selectOption('classic');
  await expect(page.locator('html')).toHaveAttribute('data-classic-view', 'classic');
  await page.goto('../');
  await expect(page.locator('[data-home-none]')).toBeVisible();
  await page.goto(`../#/schedule/${day}`);
  await expect(page.locator('.sched-card').first()).toContainText('1330');
  await expect(page.locator('#classic-boot-recovery')).toHaveCount(0);
});
