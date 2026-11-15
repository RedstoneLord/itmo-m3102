import { expect, test, type Page } from '@playwright/test';
import { dateRange, importPersonalTimetable } from '../classic/live-timetable.js';
import { mockGithub } from './github';

const DAY = '2026-11-18';
const baseline = {
  version: 1, group: 'М3102', anchorMonday: '2026-11-16', anchorParity: 'even', defaultLocation: 'Кронверкский', vacations: [], overrides: {},
  cycle: Array.from({ length: 14 }, (_, i) => i % 7 === 2 ? [
    { id: `dm-${i}`, subject: 'Дискретная математика', kind: 'lab', start: '13:30', end: '15:00', room: '2240', location: 'Кронверкский', teacher: 'Т' },
    { id: `aisd-${i}`, subject: 'Алгоритмы и структуры данных', kind: 'lab', start: '15:30', end: '17:00', room: '2240', location: 'Кронверкский', teacher: 'Т' },
  ] : []),
};
function snapshot(room = '1330', previous?: ReturnType<typeof importPersonalTimetable>, at = '2026-11-18T08:30:00Z') {
  return importPersonalTimetable([{
    code: 0,
    data: dateRange('2026-11-15', '2026-11-21').map((date) => ({ date, lessons: date === DAY ? [
      { pair_id: 1, subject: 'Дискретная математика', group: 'ДМ 1.2(M3102)', work_type_id: 2, time_start: '13:30', time_end: '15:00', room, building: 'Кронверкский', teacher_name: 'Т' },
      { pair_id: 2, subject: 'Дискретная математика', group: 'ДМ 1.2.1(M3102)', work_type_id: 10, time_start: '17:10', time_end: '18:40', room: '2430', building: 'Кронверкский', teacher_name: 'Т' },
    ] : [] })),
  }], '2026-11-15', '2026-11-21', at, previous);
}
async function prepare(page: Page, theme: string) {
  await page.clock.install({ time: new Date('2026-11-18T12:00:00+03:00') });
  await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'reduce' });
  await mockGithub(page);
  await page.context().route('https://cdnjs.cloudflare.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.marked={use(){}};' }));
  await page.context().route('**/data/schedule.json', (route) => route.fulfill({ json: baseline }));
  await page.addInitScript((theme) => {
    localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true, motion: 'off' }, version: 7 }));
    localStorage.setItem('m3102:me', JSON.stringify({ state: { login: null, guest: true }, version: 2 }));
    localStorage.setItem('m3102-student-v1', JSON.stringify({ login: '' }));
    localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme, reduceMotion: true }));
  }, theme);
}

test.describe('live timetable UI', () => {
  test.use({ serviceWorkers: 'block' });
  for (const theme of ['light', 'dark']) {
    test(`My ITMO: room changes, missing lessons and consultations in both editions (${theme})`, async ({ page }, info) => {
      await prepare(page, theme);
      await page.context().route('**/data/timetable-live.json', (route) => route.fulfill({ json: snapshot() }));
      await page.goto(`./#/schedule?view=day&date=${DAY}`);
      await page.waitForFunction(() => localStorage.getItem('m3102:last-sync') !== null);
      await expect(page.getByText('Ауд. изменена', { exact: true })).toBeVisible();
      await expect(page.getByText('Отменено', { exact: true })).toHaveCount(1);
      await expect(page.getByText(/Консультация · Аудитория/)).toBeVisible();
      await page.getByRole('button', { name: 'Дискретная математика', exact: true }).first().click();
      await expect(page.getByRole('dialog')).toContainText('1330 (было 2240)');
      await page.keyboard.press('Escape');
      await page.screenshot({ path: info.outputPath(`modern-${theme}.png`), fullPage: true });
      await page.goto('./#/today');
      await expect(page.getByRole('region', { name: 'Ближайшая пара' })).toContainText('Нет в расписании My ITMO');
      await expect(page.getByRole('region', { name: 'Ближайшая пара' })).toContainText('1330 (было 2240)');

      await page.goto(`../#/schedule/${DAY}`);
      await expect(page.locator('.sched-entry.live-cancelled')).toHaveCount(1);
      await expect(page.locator('.sched-entry').first()).toContainText('1330');
      await page.locator('.sched-card summary').first().click();
      await expect(page.locator('.sched-card-body').first()).toContainText('было 2240');
      await expect(page.locator('.sched-kind').last()).toHaveText('Консультация');
      await page.screenshot({ path: info.outputPath(`classic-${theme}.png`), fullPage: true });
      await page.goto('../#/');
      await expect(page.locator('#student-next')).toContainText('Нет в расписании My ITMO');
      await expect(page.locator('#student-next')).toContainText('1330 (было 2240)');
      await expect(page.locator('.hero-week')).toContainText('Санкт-Петербург');
    });
  }
  test('live timetable remains readable on a phone in both editions @phone', async ({ page }, info) => {
    await prepare(page, 'dark');
    await page.context().route('**/data/timetable-live.json', (route) => route.fulfill({ json: snapshot() }));
    for (const url of [`./#/schedule?view=day&date=${DAY}`, `../#/schedule/${DAY}`]) {
      await page.goto(url);
      await expect(page.getByText(/My ITMO · обновлено/).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath('classic-live-phone.png'), fullPage: true });
  });
});

test('hourly public data refreshes through the modern service worker; offline keeps the accepted snapshot', async ({ page, context }) => {
  await prepare(page, 'light');
  let current = snapshot();
  let available = true;
  await context.route('**/data/timetable-live.json', (route) => available ? route.fulfill({ json: current }) : route.abort());
  await page.goto(`./#/schedule?view=day&date=${DAY}`);
  await expect(page.getByText(/1330 \(было 2240\)/).first()).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  current = snapshot('2138', current, '2026-11-18T09:05:00Z');
  await page.clock.fastForward(5 * 60_000 + 1);
  await expect(page.getByText(/2138 \(было 1330\)/).first()).toBeVisible();
  available = false;
  await context.setOffline(true);
  await page.clock.fastForward(5 * 60_000 + 1);
  await expect(page.getByText(/не удалось проверить обновление/)).toBeVisible();
  await expect(page.getByText(/2138 \(было 1330\)/).first()).toBeVisible();
});
