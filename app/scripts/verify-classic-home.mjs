// Повторяемый визуальный прогон собранной классики: сначала npm run site и preview на 4173.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const out = fileURLToPath(new URL('../../docs/classic-redesign-evidence/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const base = 'http://127.0.0.1:4173/';
const metrics = [],
  checks = [];
const all = [
  'student-next-panel',
  'schedule-panel',
  'materials-panel',
  'notes-panel',
  'student-queues-panel',
  'deadline-panel',
  'homework-panel',
  'plan-panel',
];
async function pageFor(width, theme, { fresh = false, state = 'live', scale = 100 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
  await page.addInitScript(
    ({ theme, fresh, scale, state, all }) => {
      localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme, textScale: scale }));
      if (!fresh) localStorage.setItem('m3102-student-v1', JSON.stringify({ login: state === 'queues' ? 'RedstoneLord' : '' }));
      if (['empty', 'queues'].includes(state)) localStorage.setItem('m3102-home-layout-v1', JSON.stringify({ order: all, visible: all }));
      window.__classicCLS = 0;
      new PerformanceObserver((l) => {
        for (const x of l.getEntries()) if (!x.hadRecentInput) window.__classicCLS += x.value;
      }).observe({ type: 'layout-shift', buffered: true });
    },
    { theme, fresh, scale, state, all },
  );
  await page.route(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    (route) => {
      if (route.request().url().includes('/issues?'))
        return route.fulfill({
          json: state === 'queues' ? [{ title: '[demo] Жупиков Федор', user: { login: 'other' }, html_url: 'https://github.com/example/1' }] : [],
        });
      return route.fulfill({
        contentType: route.request().url().includes('googleapis') ? 'text/css' : 'text/javascript',
        body: route.request().url().includes('/marked/') ? 'window.marked={use(){}}' : '',
      });
    },
  );
  if (state === 'empty') {
    await page.route('**/data/schedule.json', (r) =>
      r.fulfill({ json: { anchorMonday: '2026-11-09', cycle: Array.from({ length: 14 }, () => []), vacations: [], overrides: {} } }),
    );
    await page.route('**/data/recent-notes.json', (r) => r.fulfill({ json: { entries: [] } }));
    await page.route('**/data/homework.json', (r) => r.fulfill({ json: { version: 1, items: [] } }));
  }
  if (state === 'queues')
    await page.route('**/deadlines.json', (r) =>
      r.fulfill({ json: [{ id: 'demo', name: 'Практика: очень длинное название для проверки очереди', deadline: '2026-12-31T23:59:00+03:00' }] }),
    );
  if (state === 'error')
    for (const pattern of ['**/data/schedule.json', '**/data/recent-notes.json']) await page.route(pattern, (r) => r.fulfill({ status: 503 }));
  if (state === 'loading')
    for (const pattern of ['**/data/schedule.json', '**/data/recent-notes.json'])
      await page.route(pattern, async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await r.abort();
      });
  await page.goto(base);
  await page.waitForTimeout(state === 'loading' ? 500 : 1500);
  return page;
}
for (const width of [1440, 390])
  for (const theme of ['light', 'dark']) {
    const page = await pageFor(width, theme);
    await page.screenshot({ path: `${out}after-${width}-${theme}.png`, fullPage: true });
    metrics.push({
      width,
      theme,
      ...(await page.evaluate(() => ({
        cls: window.__classicCLS,
        resources: performance.getEntriesByType('resource').map((r) => ({ url: r.name, size: r.transferSize, type: r.initiatorType })),
        fontLoaded: document.fonts.check('600 16px "Noto Sans"'),
      }))),
    });
    await page.close();
  }
for (const state of ['empty', 'error', 'loading', 'queues'])
  for (const theme of ['light', 'dark']) {
    const page = await pageFor(390, theme, { state });
    await page.screenshot({ path: `${out}state-${state}-${theme}.png`, fullPage: true });
    await page.close();
  }
for (const theme of ['light', 'dark']) {
  const page = await pageFor(390, theme, { fresh: true });
  await page.screenshot({ path: `${out}setup-${theme}.png` });
  await page.locator('[data-guest]').click();
  await page.locator('[data-home-save]').click();
  await page.goto(base + '#/settings');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}settings-${theme}.png`, fullPage: true });
  await page.close();
}
const page = await pageFor(390, 'light');
for (const theme of ['light', 'dark'])
  for (const font of ['noto', 'liberation', 'ubuntu', 'urw'])
    for (const width of [320, 360, 390, 430, 760, 920, 1100, 1440])
      for (const scale of [100, 125, 140]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(
          async ({ theme, font, scale }) => {
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.font = font;
            document.documentElement.dataset.textScale = scale;
            await document.fonts.ready;
          },
          { theme, font, scale: String(scale) },
        );
        const result = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          refresh: (() => {
            const a = document.querySelector('.home-freshness-row').getBoundingClientRect(),
              b = document.querySelector('.home-refresh').getBoundingClientRect();
            return b.width >= 44 && b.height >= 44 && b.right <= a.right + 1 && b.bottom <= a.bottom + 1;
          })(),
        }));
        checks.push({ theme, font, width, scale, ...result });
        assert.equal(result.overflow, false, JSON.stringify(checks.at(-1)));
        assert.equal(result.refresh, true, JSON.stringify(checks.at(-1)));
      }
const contrasts = [];
for (const theme of ['light', 'dark'])
  for (const palette of ['purple', 'orange', 'green', 'blue', 'cyan', 'gold', 'neon', 'aurora', 'graphite', 'sakura', 'ruby', 'tropic']) {
    await page.evaluate(
      ({ theme, palette }) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.palette = palette;
      },
      { theme, palette },
    );
    await page.waitForTimeout(500);
    const ratios = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d');
      function lum(color) {
        c.clearRect(0, 0, 1, 1);
        c.fillStyle = color;
        c.fillRect(0, 0, 1, 1);
        const rgb = [...c.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      }
      return ['#student-next .btn-primary', '.panel-head>a', '.home-note small', '.tab.active'].map((sel) => {
        const n = document.querySelector(sel),
          style = getComputedStyle(n),
          bg = getComputedStyle(n.closest('.dash-panel') || document.querySelector('header'));
        const a = lum(style.color),
          b = lum(sel.includes('btn-primary') ? style.backgroundColor : bg.backgroundColor);
        return { sel, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
    });
    contrasts.push({ theme, palette, ratios });
    for (const r of ratios) assert.ok(r.ratio >= 4.5, JSON.stringify({ theme, palette, ...r }));
  }
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => {
  document.documentElement.dataset.textScale = '100';
});
await page.goto(base);
await page.locator('#student-next .lesson-summary').waitFor();
await page.route('**/data/schedule.json', (r) => r.fulfill({ status: 503 }));
await page.route('**/data/recent-notes.json', (r) => r.fulfill({ status: 503 }));
await page.locator('.home-refresh').click();
await page.locator('.home-refresh[aria-busy]').waitFor({ state: 'detached' });
await page.screenshot({ path: `${out}state-cached-light.png`, fullPage: true });
await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}state-cached-dark.png`, fullPage: true });
const cdp = await page.context().newCDPSession(page);
await page.evaluate(() => scrollTo(0, 0));
await cdp.send('Performance.enable');
const before = await cdp.send('Performance.getMetrics');
await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing', transferMode: 'ReturnAsStream' });
await page.waitForTimeout(5000);
const traced = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
await cdp.send('Tracing.end');
const { stream } = await traced;
let trace = '';
while (true) {
  const r = await cdp.send('IO.read', { handle: stream });
  trace += r.data;
  if (r.eof) break;
}
await cdp.send('IO.close', { handle: stream });
writeFileSync(`${out}mobile-animation-trace.json`, trace);
const after = await cdp.send('Performance.getMetrics');
const metric = (name) => after.metrics.find((m) => m.name === name).value - before.metrics.find((m) => m.name === name).value;
writeFileSync(
  `${out}verification.json`,
  JSON.stringify(
    {
      checks,
      contrasts,
      animation5s: { taskSeconds: metric('TaskDuration'), scriptSeconds: metric('ScriptDuration'), layoutSeconds: metric('LayoutDuration') },
      console: 'Screenshots use assembled local data; unrelated remote services are stubbed.',
    },
    null,
    2,
  ),
);
writeFileSync(`${out}after.json`, JSON.stringify(metrics, null, 2));
await page.close();
await browser.close();
console.log(`${checks.length} responsive/theme/font/scale checks passed. Screenshots and animation trace: ${out}`);
