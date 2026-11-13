import { expect, test, type Page } from '@playwright/test';
test.use({ serviceWorkers: 'block' });

const subject = 'Тест';
const note = 'Конспекты/Тест/Лекция_1/Теорема.md';
const pdf = 'Конспекты/Тест/Лекция_2/Чтение.pdf';
const audio = 'Записи лекций/Тест/Запись.wav';
const noteText =
  '# Теорема\n\nДоказательство для личной закладки.\n\n```quiz\n? Два плюс два?\n- [x] Четыре\n- [ ] Пять\nexplain: Сложите две пары.\n```';
const tree = [
  ...['Конспекты', 'Конспекты/Тест', 'Конспекты/Тест/Лекция_1', 'Конспекты/Тест/Лекция_2', 'Записи лекций', 'Записи лекций/Тест', 'output'].map(
    (path) => ({ path, type: 'tree', sha: '' }),
  ),
  ...[note, pdf, audio].map((path) => ({ path, type: 'blob', size: 100, sha: 'v1' })),
];
const lectures = {
  root: 'Конспекты',
  subjects: [
    {
      name: subject,
      lectures: [
        {
          name: 'Лекция_1',
          path: 'Конспекты/Тест/Лекция_1',
          files: [{ name: 'Теорема', path: note, type: 'md', headings: ['Теорема о производной'] }],
        },
        { name: 'Лекция_2', path: 'Конспекты/Тест/Лекция_2', files: [{ name: 'Чтение', path: pdf, type: 'pdf', headings: [] }] },
      ],
    },
  ],
};
const deadlines = [
  { id: 'future', name: 'Тест — будущая работа', deadline: '2026-12-31T23:59:00+03:00' },
  { id: 'old', name: 'Тест — старый долг', deadline: '2026-10-01T23:59:00+03:00' },
  { id: 'archived', name: 'Тест — закрыта для группы', deadline: '2026-10-01T23:59:00+03:00', status: 'completed' },
];
const marked = `window.marked={use(){},parse(text){return '<h1>Теорема</h1><p>Доказательство для личной закладки.</p>'}};`;
const pdfjs = `window.pdfjsLib={GlobalWorkerOptions:{},getDocument(){return {promise:Promise.resolve({numPages:4,getPage(n){return Promise.resolve({getViewport({scale}){return {width:600*scale,height:800*scale}},render({canvasContext,viewport}){canvasContext.fillStyle='white';canvasContext.fillRect(0,0,viewport.width,viewport.height);return {promise:Promise.resolve()}}})}})}}};`;
async function setup(page: Page, identity = false) {
  await page.clock.install({ time: new Date('2026-11-14T12:00:00+03:00') });
  await page.context().route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => {
      const url = decodeURIComponent(route.request().url());
      if (url.includes('cdnjs.cloudflare.com'))
        return route.fulfill({
          contentType: url.endsWith('.css') ? 'text/css' : 'text/javascript',
          body: url.includes('/marked/') ? marked : url.includes('/pdf.min.js') ? pdfjs : '',
        });
      if (url.includes('/issues?'))
        return route.fulfill({
          json: [
            { title: '[future] Жупиков Федор', user: { login: 'someone-else' }, html_url: 'https://github.com/RedstoneLord/itmo-m3102/issues/1' },
          ],
        });
      if (url.startsWith('https://api.github.com/')) return route.fulfill({ status: 403, json: { message: 'rate limit' } });
      if (url.endsWith(note)) return route.fulfill({ body: noteText });
      if (url.endsWith(pdf)) return route.fulfill({ body: '%PDF-test' });
      if (url.endsWith(audio)) {
        const samples = 30 * 8000,
          wav = Buffer.alloc(44 + samples * 2);
        wav.write('RIFF');
        wav.writeUInt32LE(wav.length - 8, 4);
        wav.write('WAVEfmt ', 8);
        wav.writeUInt32LE(16, 16);
        wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(8000, 24);
        wav.writeUInt32LE(16000, 28);
        wav.writeUInt16LE(2, 32);
        wav.writeUInt16LE(16, 34);
        wav.write('data', 36);
        wav.writeUInt32LE(samples * 2, 40);
        const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
        const start = range ? Number(range[1]) : 0,
          end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
        return route.fulfill({
          body: wav.subarray(start, end + 1),
          status: range ? 206 : 200,
          contentType: 'audio/wav',
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
          },
        });
      }
      return route.abort();
    },
  );
  await page.context().route('**/data/tree.json', (route) => route.fulfill({ json: { tree, truncated: false } }));
  await page.context().route('**/data/lectures.json', (route) => route.fulfill({ json: lectures }));
  await page.context().route('**/data/display-names.json', (route) => route.fulfill({ json: {} }));
  await page.context().route('**/Дедлайны/deadlines.json', (route) => route.fulfill({ json: deadlines }));
  await page.context().route('**/%D0%94%D0%B5%D0%B4%D0%BB%D0%B0%D0%B9%D0%BD%D1%8B/deadlines.json', (route) => route.fulfill({ json: deadlines }));
  await page.addInitScript((login) => {
    localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme: 'dark', reduceMotion: true }));
    if (login) localStorage.setItem('m3102-student-v1', JSON.stringify({ login: 'RedstoneLord' }));
  }, identity);
}
test('классика: главная разделяет сроки и долги, выделяет очередь записанного другим студента', async ({ page }) => {
  await setup(page, true);
  await page.goto('../');
  await expect(page.locator('#student-my-queues')).toContainText('вы №1');
  await expect(page.locator('#home-deadlines')).toContainText('Остались долги · 1');
  await expect(page.locator('#home-deadlines')).toContainText('Архив и выполненные для меня · 1');
  await expect(page.locator('#home-deadlines > p')).toContainText('будущая работа');
  await page.goto('../#/deadlines');
  await expect(page.locator('.student-is-me')).toContainText('это вы · №1');
  await expect(page.locator('#student-work-tabs')).toBeVisible();
  await page.goto('../#/hw-deadlines');
  await expect(page).toHaveURL(/#\/deadlines$/);
});
test('классика: список файлов при лимите API, темы папок и страница предмета', async ({ page }) => {
  await setup(page);
  await page.goto('../#/materials');
  await expect(page.locator('[data-nav="Конспекты"]')).toBeVisible();
  await expect(page.locator('[data-nav="output"]')).toHaveCount(0);
  await page.goto('../#/' + encodeURI('Конспекты/Тест'));
  await expect(page.locator('[data-nav="Конспекты/Тест/Лекция_1"] .desc')).toContainText('производной');
  await page.goto('../#/subject/' + encodeURIComponent(subject));
  await expect(page.getByRole('button', { name: 'Для ИИ: скачать текст' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Подготовка к контрольной' })).toBeVisible();
});
test('классика: недели и месяцы, отдельная подписка и разовая выгрузка', async ({ page }) => {
  await setup(page);
  await page.goto('../#/week');
  await expect(page.locator('.student-calendar article')).toHaveCount(7);
  await page.goto('../#/month/2026-11-01');
  await expect(page.locator('.student-calendar article')).toHaveCount(42);
  await page.getByRole('button', { name: 'Подписка на календарь' }).click();
  await expect(page.getByRole('link', { name: 'Подписаться на расписание' })).toHaveAttribute('href', /^webcal:/);
  await expect(page.getByRole('link', { name: 'Скачать файл один раз' })).toHaveAttribute('download', 'm3102.ics');
});
test('классика: закладка, вопрос, PDF с тёмными страницами и восстановлением места', async ({ page }) => {
  await setup(page);
  await page.goto('../#/note/' + encodeURI(note));
  await expect(page.locator('#note-body p')).toBeVisible();
  await page.getByRole('button', { name: 'Закладка / вопрос' }).click();
  await page.getByRole('textbox', { name: 'Моя пометка' }).fill('Спросить преподавателя');
  await page.getByRole('button', { name: 'Сохранить для меня', exact: true }).click();
  await page.goto('../#/bookmarks');
  await expect(page.locator('#content')).toContainText('Спросить преподавателя');
  await page.goto('../#/view/' + encodeURI(pdf));
  const input = page.getByRole('spinbutton', { name: 'Страница PDF' });
  await expect(input).toBeVisible();
  await expect(page.locator('#pdf-pages canvas').first()).toHaveCSS('filter', 'invert(0.9) hue-rotate(180deg)');
  await page.getByRole('button', { name: 'Крупнее', exact: true }).click();
  await page.getByRole('button', { name: 'Крупнее', exact: true }).click();
  await expect(page.locator('[data-pdf-zoom]')).toHaveText('150%');
  expect(await page.locator('.student-pdf-viewport').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'По ширине', exact: true }).click();
  await expect(page.locator('[data-pdf-zoom]')).toHaveText('100%');
  await input.fill('3');
  await input.dispatchEvent('change');
  await expect.poll(() => page.evaluate((path) => JSON.parse(localStorage.getItem('m3102-reading-v1') || '{}')[path]?.page, pdf)).toBe(3);
  await page.reload();
  await expect(input).toHaveValue('3');
});

test('классика: поиск и мемы помещаются на промежуточных ширинах', async ({ page }) => {
  await setup(page);
  await page.goto('../#/memes');
  for (const width of [760, 920, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole('combobox', { name: 'Поиск по сайту' }).fill('Теорема');
    const results = page.locator('.ss-results');
    await expect(results).toBeVisible();
    const rect = await results.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    const card = page.locator('.meme-card').first();
    await expect(card).toBeVisible();
    expect((await card.boundingBox())!.width).toBeGreaterThan(240);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('классика: 125% сохраняет мобильный поиск и нижнее меню @phone', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme: 'dark', reduceMotion: true, textScale: 125 })));
  await page.goto('../');
  const input = page.getByRole('combobox', { name: 'Поиск по сайту' });
  await expect(input).toBeVisible();
  expect((await input.boundingBox())!.width).toBeGreaterThan(70);
  const home = page.locator('#bn-home span').last();
  expect(await home.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await input.fill('Теорема');
  await expect(page.locator('.ss-results')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('классика: быстрые действия в один ряд при 125% @phone', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme: 'dark', reduceMotion: true, textScale: 125 })));
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    for (const path of ['', '#/materials', '#/subject/' + encodeURIComponent(subject), '#/schedule/2026-11-14']) {
      await page.goto('../' + path);
      const row = path.startsWith('#/subject/')
        ? page.locator('[data-ai-download]').locator('..')
        : path.startsWith('#/schedule/')
          ? page.locator('[data-schedule-links]')
          : path
            ? page.locator('nav.student-quick-actions:has(a[aria-label="Мои закладки"])')
            : page.locator('#student-home-tools');
      await expect(row).toHaveClass(/student-quick-actions/);
      const buttons = row.locator(':scope > a, :scope > button');
      await expect(buttons.first()).toBeVisible();
      await buttons.first().click({ trial: true });
      const rects = await buttons.evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { top: Math.round(r.top), left: r.left, right: r.right, height: r.height };
        }),
      );
      expect(new Set(rects.map((r) => r.top)).size).toBe(1);
      for (const rect of rects) {
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(width);
        expect(rect.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.goto('../');
    await page.getByRole('button', { name: 'Настроить главную', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  }
});

test('классика: PDF-закладка без цитаты и оформленные настройки', async ({ page }) => {
  await setup(page);
  await page.addInitScript(
    (path) => localStorage.setItem('m3102-bookmarks-v1', JSON.stringify({ one: { path, page: 3, quote: '', note: 'Повторить', at: '2026-11-14' } })),
    pdf,
  );
  await page.goto('../#/bookmarks');
  await expect(page.locator('#content')).toContainText('страница 3');
  await expect(page.locator('#content blockquote')).toHaveCount(0);
  await page.goto('../#/settings');
  await expect(page.getByRole('button', { name: 'Выбрать резервную копию' })).toBeVisible();
  await expect(page.locator('[data-backup-import]')).toBeHidden();
  await expect(page.locator('[data-prefs-action="reset"]')).toHaveAccessibleName('Сбросить настройки оформления и чтения');
  await expect(page.locator('[data-pref="textScale"]')).toHaveCSS('min-height', '44px');
});

test('классика: указатели в перегрузках C++ видны буквально', async ({ page }) => {
  await setup(page);
  await page.goto('../#/bookmarks');
  await page.evaluate(async () => {
    const { mountQuizPage } = await import(new URL('js/quiz.js', location.href).href);
    mountQuizPage(
      document.querySelector('#content'),
      '? Какая пара задаёт разные перегрузки?\n- [ ] void F(int) и void F(const int)\n- [ ] int F(int) и double F(int)\n- [x] void F(int*) и void F(const int*)',
    );
  });
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.locator('.quiz-opt').filter({ hasText: 'void F(int*) и void F(const int*)' })).toBeVisible();
  await expect(page.locator('.quiz-opt em')).toHaveCount(0);
  await expect(page.locator('.quiz-opt code')).toHaveCount(6);
});
test('классика: резервная копия переносит прогресс и отвергает посторонний файл', async ({ page }) => {
  await setup(page);
  await page.goto('../#/settings');
  await page.evaluate(() => {
    localStorage.setItem('m3102-study-plan-v1', JSON.stringify({ tasks: [{ id: 'one', name: 'Моя задача' }], done: { one: true } }));
    localStorage.setItem('m3102-github-token-v1', 'test-secret');
  });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
  const file = await downloaded;
  const filePath = await file.path();
  expect(filePath).toBeTruthy();
  await page.locator('[data-backup-import]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('[data-backup-status]')).toContainText('Нужна резервная копия');
  await page.evaluate(() => localStorage.removeItem('m3102-study-plan-v1'));
  await page.locator('[data-backup-import]').setInputFiles(filePath!);
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('m3102-study-plan-v1'))).toContain('Моя задача');
});
test('классика: ошибки подготовки сохраняются между открытиями', async ({ page }) => {
  await setup(page);
  await page.goto('../#/review/' + encodeURIComponent(subject));
  await page.getByRole('button', { name: 'Перемешать все вопросы' }).click();
  await page.locator('input[type=radio][value="1"]').check();
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.locator('[data-feedback]')).toContainText('Нужно повторить');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Повторить сохранённые ошибки' })).toBeEnabled();
});
test('классика: мем по прямой ссылке и подсказка нулевого баланса', async ({ page }) => {
  await setup(page);
  await page.goto('../#/memes');
  const id = await page.locator('.meme-card').first().getAttribute('data-meme');
  await page.goto('../#/memes?meme=' + encodeURIComponent(id!));
  await expect(page.locator('.student-meme-large')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.goto('../#/blackjack');
  await expect(page.locator('#student-berries')).toContainText('Для раздачи нужно 5 ягод, у вас 0');
  await expect(page.locator('#student-berries a')).toHaveCount(2);
});
test('классика: личный порядок главной сохраняется', async ({ page }) => {
  await setup(page);
  await page.goto('../');
  await page.getByRole('button', { name: 'Настроить главную' }).click();
  await page.locator('[data-block="student-queues-panel"] [data-up]').click();
  await page.getByRole('button', { name: 'Сохранить порядок' }).click();
  await page.reload();
  await expect(page.locator('[data-home-block]').first()).toHaveAttribute('data-home-block', 'student-queues-panel');
});
test('классика: сохранённые данные имеют дату успеха при ошибке обновления', async ({ page, context }) => {
  await setup(page);
  await page.goto('../#/homework');
  await expect(page.locator('#student-freshness')).toContainText('ДЗ: 14.11.2026');
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('m3102-data-freshness-v1') || '{}')['ДЗ'].at);
  await page.clock.fastForward(60_000);
  await context.route('**/data/homework.json', (route) => route.fulfill({ status: 403 }));
  await page.reload();
  await expect(page.locator('#student-freshness')).toContainText('ДЗ: сохранённые данные');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('m3102-data-freshness-v1') || '{}')['ДЗ'].at)).toBe(original);
  await expect(page.locator('#homework-list .hw-item').first()).toBeVisible();
});
test('классика: запись сохраняет скорость, позицию и личные темы', async ({ page }) => {
  await setup(page);
  await page.goto('../#/audio/' + encodeURI(audio));
  await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.duration)).toBe(30);
  await page.getByLabel('Скорость записи').selectOption('1.5');
  await page.getByRole('button', { name: '+15 секунд', exact: true }).click();
  await page.getByRole('button', { name: 'Отметить тему здесь' }).click();
  await page.getByRole('textbox', { name: 'Название темы' }).fill('Доказательство');
  await page.getByRole('button', { name: 'Сохранить отметку' }).click();
  await page.goto('../#/bookmarks');
  await page.goto('../#/audio/' + encodeURI(audio));
  await expect(page.getByRole('button', { name: '0:15 · Доказательство' })).toBeVisible();
  await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBe(15);
  await expect(page.getByLabel('Скорость записи')).toHaveValue('1.5');
});
test('классика: тип пары и добавление ДЗ видны на телефоне @phone', async ({ page }) => {
  await setup(page);
  await page.goto('../#/schedule/2026-11-14');
  await expect(page.locator('.sched-kind').first()).toBeVisible();
  await page.locator('.sched-card summary').first().click();
  await expect(page.getByRole('button', { name: 'Добавить ДЗ' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test.describe('классика с настоящим офлайн-кешем', () => {
  test.use({ serviceWorkers: 'allow' });
  test('сбой загрузки не выдаёт готовность; после повтора впервые открываются все игры без сети', async ({ page, context }) => {
    test.setTimeout(90_000);
    await setup(page);
    let fail = true;
    await context.route(
      (url) => decodeURIComponent(url.href).endsWith(note),
      (route) => (fail ? route.abort() : route.fulfill({ body: noteText })),
    );
    await page.goto('../#/settings');
    await page.locator('[data-off-start]').click();
    await expect(page.locator('.student-offline [role=status]')).toContainText('Не удалось скачать', { timeout: 40_000 });
    await expect(page.locator('.student-offline [role=status]')).not.toContainText('Всё готово');
    fail = false;
    await page.locator('[data-off-start]').click();
    await expect(page.locator('.student-offline [role=status]')).toContainText('Всё готово для работы без интернета', { timeout: 40_000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const game of ['blackjack', 'roulette', 'slots', 'mahjong', 'hedgehog', 'collection']) {
      await page.goto('../#/' + game);
      await expect(page.locator('#content')).not.toContainText('Ошибка загрузки');
      await expect(page.locator('#content')).not.toBeEmpty();
    }
    await page.goto('../#/note/' + encodeURI(note));
    await expect(page.locator('#note-body')).toContainText('Доказательство');
    expect(errors).toEqual([]);
  });
});
