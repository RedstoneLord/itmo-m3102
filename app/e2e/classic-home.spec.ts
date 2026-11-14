import { test, expect, type Page } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
const md = 'Конспекты/Тест/Лекция_1/Очень_длинное_кириллическое_название_конспекта.md';
const pdf = 'Конспекты/Тест/Лекция_1/Занятие.pdf';
async function fixture(
  page: Page,
  options: { identity?: object; layout?: object; fail?: boolean; empty?: boolean; time?: string; deny?: boolean } = {},
) {
  await page.clock.install({ time: new Date(options.time || '2026-11-14T12:00:00+03:00') });
  await page.context().route(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: route.request().url().includes('/marked/') ? 'window.marked={use(){},parse(){return "<h1>Конспект</h1><p>Текст занятия</p>"}}' : '',
      }),
  );
  await page.route('**/data/tree.json', (route) =>
    route.fulfill({ json: { tree: [md, pdf].map((path) => ({ path, type: 'blob', sha: '1' })), truncated: false } }),
  );
  await page.route('**/data/recent-notes.json', (route) =>
    route.fulfill({
      json: { entries: [{ path: md, date: '2026-11-13T10:00:00Z', change: 'added' }, { path: pdf }, { path: 'Конспекты/удалён.md' }] },
    }),
  );
  const lesson = {
    id: 'test',
    subject: 'Тест',
    start: '13:06',
    end: '14:36',
    room: '2311',
    kind: 'practice',
    teacher: 'Преподаватель',
    location: 'Кронверкский проспект, 49',
  };
  await page.route('**/data/schedule.json', (route) =>
    options.fail
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: {
            anchorMonday: '2026-11-09',
            anchorParity: 'odd',
            cycle: Array.from({ length: 14 }, () => (options.empty ? [] : [lesson])),
            vacations: [],
            overrides: {},
            defaultLocation: '',
          },
        }),
  );
  await page.addInitScript(({ identity, layout, deny }) => {
    if (localStorage.getItem('__home_fixture')) return;
    localStorage.setItem('__home_fixture', '1');
    localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme: 'light' }));
    if (identity) localStorage.setItem('m3102-student-v1', JSON.stringify(identity));
    if (layout) localStorage.setItem('m3102-home-layout-v1', JSON.stringify(layout));
    localStorage.setItem('m3102-study-plan-v1', JSON.stringify({ tasks: [{ id: 'keep', name: 'Не потерять' }], done: { keep: true } }));
    localStorage.setItem('hh_save_v1', JSON.stringify({ berries: 123 }));
    if (deny) {
      Storage.prototype.setItem = () => {
        throw new DOMException('Denied', 'QuotaExceededError');
      };
      Object.defineProperty(window, 'caches', {
        get() {
          throw new DOMException('Denied', 'SecurityError');
        },
      });
    }
  }, options);
  await page.goto('../');
  await expect(page.locator('#student-next')).toBeVisible();
}
async function doneGuest(page: Page) {
  await page.locator('[data-guest]').click();
  await page.locator('[data-home-save]').click();
  await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
}

test('первый запуск: явный гость, четыре блока, завершение и запасная копия', async ({ page }) => {
  await fixture(page);
  const dialog = page.getByRole('dialog', { name: 'Настройте сайт под себя' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Готово' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await doneGuest(page);
  await expect(page.locator('[data-home-block]:visible')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
  const backup = await page.evaluate(async () => {
    const core = await import('/js/student-core.js');
    return core.parsePersonal(JSON.stringify(core.exportPersonal(localStorage)));
  });
  expect(JSON.parse(backup.data['m3102-setup-v1']).completed).toBe(true);
  expect(JSON.parse(backup.data['m3102-student-v1']).login).toBe('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hh_save_v1')!).berries)).toBe(123);
});
test('студент: поиск и выбор, отмена предпросмотра, настройки без повторного запроса', async ({ page }) => {
  await fixture(page);
  await page.locator('[data-student-search]').fill('Жупиков');
  await page.locator('[data-login="RedstoneLord"]').click();
  await page.locator('[data-home-save]').click();
  await page.goto('../#/settings');
  await page.getByRole('button', { name: 'Быстрая настройка', exact: true }).click();
  await page.locator('[data-setup-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('m3102-student-v1')!).login)).toBe('RedstoneLord');
});
test('миграция порядка, скрыть всё, отмена и восстановление стандартного набора', async ({ page }) => {
  await fixture(page, { identity: { login: 'RedstoneLord' }, layout: { order: ['notes-panel', 'schedule-panel', 'notes-panel', 'unknown'] } });
  await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
  await expect(page.locator('[data-home-block]:visible').first()).toHaveAttribute('data-home-block', 'notes-panel');
  await page.getByRole('button', { name: 'Настроить главную', exact: true }).click();
  for (const input of await page.locator('[data-block] input').all()) await input.uncheck();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('[data-home-none]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-home-block]:visible')).toHaveCount(0);
  await page.locator('#student-home-tools button').click();
  await page.getByRole('button', { name: 'Вернуть стандартный набор' }).click();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('[data-home-block]:visible')).toHaveCount(0);
  await page.locator('#student-home-tools button').click();
  await page.getByRole('button', { name: 'Вернуть стандартный набор' }).click();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('[data-home-block]:visible')).toHaveCount(4);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('m3102-study-plan-v1')!).done.keep)).toBe(true);
});
test('запрет хранения: понятное сообщение и работа в текущей вкладке', async ({ page }) => {
  await fixture(page, { deny: true });
  await doneGuest(page);
  await expect(page.locator('#student-next')).toContainText('Тест');
  await expect(page.getByRole('status').filter({ hasText: 'Браузер не сохранил' })).toBeVisible();
  await page.evaluate(() => {
    location.hash = '/settings';
  });
  await expect(page.locator('.settings-page')).toBeVisible();
  await page.evaluate(() => {
    location.hash = '';
  });
  await expect(page.locator('[data-home-dialog]')).toHaveCount(0);
});
test('конспекты MD/PDF: настоящие адреса, удалённый файл отфильтрован, без запросов истории', async ({ page }) => {
  const commits: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/commits')) commits.push(r.url());
  });
  await fixture(page, { identity: { login: '' } });
  const links = page.locator('.home-note');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', /^#\/note\//);
  await expect(links.nth(1)).toHaveAttribute('href', /^#\/view\//);
  expect(commits).toEqual([]);
  await links.first().click();
  await expect(page.locator('#note-body')).toContainText('Текст занятия');
  await page.goBack();
  await expect(page.locator('.home-note')).toHaveCount(2);
});
test('обновление без перезагрузки: фокус, ввод, ошибка и старая дата', async ({ page }) => {
  await fixture(page, { identity: { login: '' }, layout: { order: [], visible: ['student-next-panel', 'plan-panel'] } });
  await page.locator('#task-name').fill('Не терять ввод');
  await page.evaluate(() => {
    (window as any).sameDocument = true;
  });
  await page.locator('.home-refresh').click();
  await expect(page.locator('[data-refresh-message]')).toContainText('завершена');
  await expect(page.locator('.home-refresh')).toBeFocused();
  await expect(page.locator('#task-name')).toHaveValue('Не терять ввод');
  expect(await page.evaluate(() => (window as any).sameDocument)).toBe(true);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('m3102-data-freshness-v1')!)['Расписание'].at);
  await page.route('**/data/schedule.json', (r) => r.fulfill({ status: 503 }));
  await page.locator('.home-refresh').click();
  await expect(page.locator('[data-refresh-message]')).toContainText('Часть данных');
  await expect(page.locator('.home-refresh')).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('m3102-data-freshness-v1')!)['Расписание'].at)).toBe(before);
  await expect(page.locator('#student-next')).toContainText('Сохранённое расписание');
});
test('та же пара: все поля обновляются, пустое расписание восстанавливается, действие сохраняет фокус', async ({ page }) => {
  await fixture(page, { identity: { login: '' } });
  const lesson = { id:'test', subject:'Новый предмет', start:'13:30', end:'15:10', room:'9999', kind:'lab', teacher:'Другой преподаватель', location:'Новый корпус' };
  let entries = [lesson];
  await page.route('**/data/schedule.json', r => r.fulfill({json:{anchorMonday:'2026-11-09',anchorParity:'odd',cycle:Array.from({length:14},()=>entries),vacations:[],overrides:{}}}));
  const refresh = () => page.evaluate(async () => {
    const prefix = `/releases/${document.documentElement.dataset.classicRelease}/js/`;
    await (await import(prefix + 'home-dashboard.js')).refreshHomeData();
  });
  const action = page.locator('#student-next a').first();
  await action.focus();
  await refresh();
  await expect(action).toBeFocused();
  for (const value of ['13:30','15:10','9999','Лабораторная','Новый предмет','Другой преподаватель','Новый корпус']) await expect(page.locator('#student-next')).toContainText(value);
  entries = [];
  await refresh();
  await expect(page.locator('#student-next')).toContainText('В ближайшие 30 дней занятий нет');
  entries = [lesson];
  await refresh();
  await expect(page.locator('#student-next h3')).toHaveText('Новый предмет');
  await expect(page.locator('#student-next .lesson-room')).toHaveText('Ауд. 9999');
});
for (const state of ['upcoming', 'ongoing', 'tomorrow', 'empty', 'error'] as const)
  test(`расписание: ${state}, московская дата на устройстве в Америке`, async ({ page }) => {
    await fixture(page, {
      identity: { login: '' },
      time: state === 'ongoing' ? '2026-11-14T13:20:00+03:00' : state === 'tomorrow' ? '2026-11-14T23:59:00+03:00' : undefined,
      empty: state === 'empty',
      fail: state === 'error',
    });
    if (state === 'upcoming') await expect(page.locator('#student-next')).toContainText('Через 1 ч 6 мин');
    if (state === 'ongoing') await expect(page.locator('#student-next')).toContainText('Идёт сейчас');
    if (state === 'tomorrow') {
      await expect(page.locator('#student-next')).toContainText('Завтра');
      await page.clock.fastForward(62000);
      await expect(page.locator('.hero-date')).toContainText('15 ноября');
      await expect(page.locator('#student-next')).toContainText('Сегодня');
    }
    if (state === 'empty') {
      await expect(page.locator('#student-next')).toContainText('В ближайшие 30 дней занятий нет');
      await expect(page.locator('#home-today')).toContainText('Сегодня без занятий');
    }
    if (state === 'error') {
      await expect(page.locator('#student-next')).toContainText('Расписание недоступно');
      await expect(page.locator('#home-today')).not.toContainText('без занятий');
    }
  });
test.describe('другой часовой пояс', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('время кампуса, граница занятия и возобновление', async ({ page }) => {
    await fixture(page, { identity: { login: '' }, time: '2026-11-14T13:05:58+03:00' });
    await expect(page.locator('#student-next')).toContainText('Следующая пара');
    await page.clock.fastForward(3000);
    await expect(page.locator('#student-next')).toContainText('Идёт сейчас');
    await expect(page.locator('.hero-date')).toContainText('14 ноября');
  });
});
test('ёжик: два цикла на телефоне и компьютере, пауза и уменьшение движения @phone', async ({ page }) => {
  test.setTimeout(90000);
  await fixture(page, { identity: { login: '' } });
  await expect(page.locator('.hog-facing img')).toHaveCount(0);
  for (const width of [390, 760, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    const xs: number[] = [];
    for (let i = 0; i < 98; i++) {
      await page.clock.fastForward(500);
      const hero = (await page.locator('.home-hero').boundingBox())!;
      const hog = (await page.locator('.hog-facing').boundingBox())!;
      xs.push(hog.x);
      expect(hog.width).toBeCloseTo(64, 3);
      expect(hog.x).toBeGreaterThanOrEqual(hero.x);
      expect(hog.x + hog.width).toBeLessThanOrEqual(hero.x + hero.width);
      expect(hog.y + hog.height).toBeLessThanOrEqual(hero.y + hero.height + 1);
      const text = (await page.locator('.hero-inner').boundingBox())!;
      expect(hog.y).toBeGreaterThan(text.y + text.height);
      const control = (await page.locator('.home-motion').boundingBox())!;
      expect(hog.x + hog.width).toBeLessThan(control.x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
  }
  await page.getByRole('button', { name: 'Приостановить анимацию ёжика' }).click();
  const transform = await page.locator('.hog-travel').getAttribute('style');
  await page.clock.fastForward(3000);
  expect(await page.locator('.hog-travel').getAttribute('style')).toBe(transform);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.home-motion')).toBeDisabled();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.documentElement.setAttribute('data-reduce-motion', ''));
  await expect(page.locator('.home-motion')).toBeDisabled();
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      location.hash = '/settings';
    });
    await expect(page.locator('.settings-page')).toBeVisible();
    await page.evaluate(() => {
      location.hash = '';
    });
    await expect(page.locator('.home-motion')).toHaveCount(1);
  }
});
test('размеры: нет горизонтальной прокрутки, обновление в одной строке @phone', async ({ page }) => {
  await fixture(page, { identity: { login: '' } });
  for (const width of [320, 360, 390, 430, 760, 920, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const row = (await page.locator('.home-freshness-row').boundingBox())!,
      button = (await page.locator('.home-refresh').boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.y + button.height).toBeLessThanOrEqual(row.y + row.height);
  }
});

test('сохранённые конспекты видны сразу, пока свежее дерево ещё загружается', async ({ page }) => {
  await fixture(page, { identity: { login: '' } });
  await expect(page.locator('.home-note')).toHaveCount(2);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/tree.json', async (route) => {
    await held;
    await route.fulfill({ json: { tree: [md, pdf].map((path) => ({ path, type: 'blob', sha: '1' })), truncated: false } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.home-note')).toHaveCount(2);
  await expect(page.locator('#recent-notes')).toContainText('Сохранённый список');
  release();
});

test('повтор после ошибки раздела загружает его без перезагрузки документа', async ({ page }) => {
  await fixture(page, { identity: { login: '' } });
  let failed = true;
  await page.route('**/data/lectures.json', (r) => r.fulfill(failed ? { status: 503 } : { json: { root: 'Конспекты', subjects: [] } }));
  await page.goto('../#/subjects');
  await expect(page.locator('#content [data-student-retry]')).toBeVisible();
  await page.evaluate(() => {
    (window as any).retainedDocument = true;
  });
  failed = false;
  await page.locator('#content [data-student-retry]').click();
  await expect(page.locator('#content [data-student-retry]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).retainedDocument)).toBe(true);
});

test('ошибка запуска модуля: понятный повтор, личные данные сохраняются', async ({page}) => {
  test.setTimeout(30000);
  await page.context().route(u => !['127.0.0.1','localhost'].includes(u.hostname),r=>r.fulfill({contentType:'text/javascript',body:r.request().url().includes('/marked/')?'window.marked={use(){}}':''}));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('m3102-student-v1')) {
      localStorage.setItem('m3102-student-v1','{"login":""}');
      localStorage.setItem('m3102-study-plan-v1','{"tasks":[{"id":"keep","name":"Не потерять"}],"done":{}}');
    }
  });
  await page.route('**/js/home-setup.js',r=>r.abort());
  await page.goto('../');
  await expect(page.locator('#classic-boot-recovery')).toContainText('Ваши задачи и прогресс сохранены',{timeout:15000});
  await page.unroute('**/js/home-setup.js');
  await page.getByRole('button',{name:'Повторить загрузку',exact:true}).click();
  await expect(page.locator('#student-next')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('m3102-study-plan-v1')!).tasks[0].id)).toBe('keep');
});
test('главная не загружает библиотеки PDF, экспорта и Mermaid', async ({page})=>{
  const requests:string[]=[];page.on('request',r=>{if(/cdnjs.*\/(pdf\.js|jspdf|html2canvas|mermaid)\//.test(r.url()))requests.push(r.url());});
  await fixture(page,{identity:{login:''}});
  await expect(page.locator('#student-next .lesson-summary')).toBeVisible();
  expect(requests).toEqual([]);
});
