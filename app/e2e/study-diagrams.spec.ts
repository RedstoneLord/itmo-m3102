import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mockGithub } from './github';

const notePath = 'Конспекты/Линейная_Алгебра/Лекция_11/Матрица_перехода_СЛАУ_и_векторы_в_пространстве.md';
const classicNote = '#/note/' + notePath.split('/').map(encodeURIComponent).join('/');
const modernNote = '#/materials/notes/' + encodeURIComponent('gh:' + notePath);

async function prepare(page: Page, classic: boolean, theme: 'light' | 'dark' = 'light', path = notePath) {
  await mockGithub(page);
  const note = readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  const entry = { path, type: 'blob', sha: '11' };
  const context = page.context();
  const tree = { truncated: false, tree: [entry] };
  await context.route('https://api.github.com/**/git/trees/**', (route) => route.fulfill({ json: tree }));
  await context.route('https://raw.githubusercontent.com/**', (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.endsWith(path)) return route.fulfill({ body: note, contentType: 'text/plain; charset=utf-8' });
    if (url.endsWith('/data/tree.json')) return route.fulfill({ json: tree });
    return route.fallback();
  });
  if (classic) {
    // Локальные зависимости заменяют CDN. В читалке схема обрабатывается до передачи Markdown в marked.
    const marked = readFileSync(new URL('marked.umd.js', import.meta.resolve('marked')), 'utf8');
    const katex = readFileSync(new URL('../node_modules/katex/dist/katex.min.js', import.meta.url), 'utf8');
    await context.route('**/marked.min.js', (route) => route.fulfill({ body: marked, contentType: 'text/javascript' }));
    await context.route('**/katex.min.js', (route) => route.fulfill({ body: katex, contentType: 'text/javascript' }));
  }
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: true }, version: 7 }));
    localStorage.setItem('m3102:me', JSON.stringify({ state: { login: null, guest: true }, version: 2 }));
  });
}

async function playMatrix(page: Page) {
  // В конспекте есть и статичная схема ФСР. Проигрыватель нужен для матрицы перехода.
  const matrix = page.locator('[data-study-kind="matrix"]').filter({
    has: page.locator('[data-study-step]'),
  });
  await expect(matrix).toHaveCount(1);
  await matrix.scrollIntoViewIfNeeded();
  const frame = matrix.locator('[data-study-current]');
  await expect(frame).toHaveAttribute('aria-label', '1, 1, 3, 2. 2, 3, 7, 1');
  await matrix.getByRole('button', { name: 'Далее' }).click();
  await expect(frame).toHaveAttribute('aria-label', '1, 1, 3, 2. 0, 1, 1, -3');
  await matrix.getByRole('button', { name: 'Далее' }).click();
  await expect(frame).toHaveAttribute('aria-label', '1, 0, 2, 5. 0, 1, 1, -3');
  await matrix.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(frame).toHaveAttribute('aria-label', '1, 1, 3, 2. 0, 1, 1, -3');
  return matrix;
}

async function rotateScene(page: Page) {
  const scene = page.locator('[data-study-kind="geometry3d"]').filter({ has: page.locator('[data-study-plane]') }).last();
  const svg = scene.locator('[data-study-current]');
  const initial = await svg.innerHTML();
  await scene.getByText('Вид сцены', { exact: true }).click();
  await scene.getByRole('button', { name: 'Вид вдоль оси y' }).click();
  await scene.getByText('Вид сцены', { exact: true }).click();
  await expect(svg.locator('polyline')).toHaveCount(1);
  await scene.getByRole('button', { name: 'Сбросить вид' }).click();
  expect(await svg.innerHTML()).toBe(initial);
  return scene;
}

test('читалка и редактор нового приложения показывают интерактивные блоки', async ({ page }) => {
  await prepare(page, false);
  await page.goto('./' + modernNote);
  const matrix = await playMatrix(page);
  const figure = page.locator('figure[data-lang="matrix"]').filter({ has: matrix });
  await expect(figure.getByRole('button', { name: 'SVG', exact: true })).toHaveCount(0);
  await expect(matrix.locator('[data-export-frame] svg')).toHaveAttribute('aria-label', '1, 0, 2, 5. 0, 1, 1, -3');
  await page.emulateMedia({ media: 'print' });
  await expect(matrix.locator('[data-export-frame]')).toBeVisible();
  await expect(matrix.locator('[data-study-stage]')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  const scene = await rotateScene(page);
  const stage = scene.locator('[data-study-stage]');
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  const current = stage.locator('[data-study-current]');
  const beforeDrag = await current.innerHTML();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 15, { steps: 3 });
  await page.mouse.up();
  expect(await current.innerHTML()).not.toBe(beforeDrag);
  await figure.getByRole('link', { name: 'Редактировать' }).click();
  await expect(page.getByRole('textbox', { name: 'Исходный текст диаграммы' })).toHaveValue(/add 2 1 -2/);
  await playMatrix(page);
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const svg = readFileSync((await (await svgDownload).path())!, 'utf8');
  expect(svg).toContain('1, 1, 3, 2. 0, 1, 1, -3');
  await page.getByRole('textbox', { name: 'Исходный текст диаграммы' }).fill('1\nscale 1 0');
  await expect(page.getByRole('alert')).toContainText('Строка 2');
});

test('уже открытый блок остаётся интерактивным без сети после перезагрузки', async ({ page, context }) => {
  await prepare(page, false);
  await page.goto('./' + modernNote);
  await rotateScene(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await rotateScene(page);
});

for (const view of ['legacy', 'classic']) {
  test('классическая читалка и редактор · ' + view, async ({ page }) => {
    await prepare(page, true, view === 'classic' ? 'dark' : 'light');
    await page.addInitScript((mode) => localStorage.setItem('m3102-classic-view-v1', JSON.stringify({ view: mode })), view);
    await page.goto('/' + classicNote);
    await expect(page.locator('html')).toHaveAttribute('data-classic-view', view);
    const matrix = await playMatrix(page);
    await rotateScene(page);
    const editButton = page.locator('[data-study-figure]').filter({ has: matrix }).getByRole('button', { name: 'Редактировать', exact: true });
    await expect(editButton).toHaveCount(1);
    await expect(page.locator('[data-study-figure] [data-dgm-copy]')).toHaveCount(0);
    await editButton.click();
    await expect(page.getByRole('textbox', { name: 'Текст диаграммы' })).toHaveValue(/add 2 1 -2/);
    await playMatrix(page);
    const svgDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать SVG', exact: true }).click();
    const svg = readFileSync((await (await svgDownload).path())!, 'utf8');
    expect(svg).toContain('1, 1, 3, 2. 0, 1, 1, -3');
    const language = page.locator('#diagram-language');
    await language.selectOption('geometry3d');
    await expect(language).toHaveValue('geometry3d');
    await rotateScene(page);
  });
}

test('матрица прокручивается внутри конспекта, сцена поворачивается кнопками @phone', async ({ page }) => {
  await prepare(page, false, 'dark');
  await page.goto('./' + modernNote);
  await playMatrix(page);
  const stage = page.locator('[data-study-kind="matrix"] [data-study-stage]').last();
  await expect.poll(() => stage.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await rotateScene(page);
});

for (const view of ['legacy', 'classic']) {
  test('конвейер C++ сохраняет уровни и отдельные входы · ' + view, async ({ page }) => {
    const path = 'Конспекты/Основы_программирования/Лекция_7/Компилятор_и_препроцессор.md';
    await prepare(page, true, view === 'classic' ? 'dark' : 'light', path);
    await page.addInitScript((mode) => localStorage.setItem('m3102-classic-view-v1', JSON.stringify({ view: mode })), view);
    await page.goto('/#/note/' + path.split('/').map(encodeURIComponent).join('/'));
    const chart = page.locator('.dgm-network').filter({ has: page.locator('[data-dgm-node="PP"]') });
    await expect(chart).toBeVisible();
    const result = await chart.evaluate((svg) => {
      const y = (id: string) => svg.querySelector<SVGGraphicsElement>(`[data-dgm-node="${id}"]`)!.getBBox().y;
      const arrows = Array.from(svg.querySelectorAll<SVGPathElement>('path[marker-end]'));
      return {
        levels: ['H1', 'PP', 'TU1', 'COMP', 'ASM', 'O1', 'LINK', 'EXE'].map(y),
        routes: arrows.length,
        entries: new Set(arrows.slice(0, 5).map((path) => path.getPointAtLength(path.getTotalLength()).x)).size,
        exits: new Set(arrows.slice(5, 8).map((path) => path.getPointAtLength(0).x)).size,
      };
    });
    expect(result.levels.every((y, i) => i === 0 || y > result.levels[i - 1]!)).toBe(true);
    expect(result).toMatchObject({ routes: 19, entries: 5, exits: 3 });
  });
}
