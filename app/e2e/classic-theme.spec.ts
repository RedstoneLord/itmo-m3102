import { expect, test, type Page } from '@playwright/test';

// Проверяем настоящую собранную классическую страницу, включая каскад всех её стилей.
// CDN не нужен для главной и настроек; marked.use вызывается при запуске страницы.
async function openClassic(page: Page, theme: 'auto' | 'light' | 'dark') {
  await page.context().route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
    if (route.request().url().includes('/marked/')) {
      return route.fulfill({ contentType: 'text/javascript', body: 'window.marked = { use() {} };' });
    }
    return route.abort();
  });
  await page.addInitScript(value => {
    localStorage.setItem('m3102-settings-v1', JSON.stringify({ theme: value, reduceMotion: true }));
  }, theme);
  await page.goto('../');
  await expect(page.locator('.home-hero h1')).toBeVisible();
}

for (const system of ['light', 'dark'] as const) {
  for (const choice of ['auto', 'light', 'dark'] as const) {
    test(`классическая тема: система ${system}, выбор ${choice}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: system, reducedMotion: 'reduce' });
      await openClassic(page, choice);
      const light = (choice === 'auto' ? system : choice) === 'light';
      await expect(page.locator('.brand-logo')).toHaveCSS('filter', light ? 'invert(1)' : 'none');
      await expect(page.locator('body')).toHaveCSS('background-color', light ? 'rgb(255, 255, 255)' : 'rgb(17, 19, 27)');
      await expect(page.locator('.home-hero h1')).toHaveCSS('color', light ? 'rgb(32, 35, 46)' : 'rgb(255, 255, 255)');
      if (system === 'dark' && choice === 'light') {
        await page.screenshot({ path: testInfo.outputPath('classic-light-desktop.png') });
      }
      // Переключение на лету, без перезагрузки: убирается/возвращается весь светлый каскад.
      await page.goto('../#/settings');
      await page.locator(`[data-theme-opt="${light ? 'dark' : 'light'}"]`).click();
      await expect(page.locator('.brand-logo')).toHaveCSS('filter', light ? 'none' : 'invert(1)');
    });
  }
}

test('светлая классическая тема: контраст во всех 12 палитрах', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await openClassic(page, 'light');
  // Особые палитры в обычном интерфейсе видны после открытия в коллекции.
  await page.evaluate(() => localStorage.setItem('m3102-slots-v1', JSON.stringify({
    album: Object.fromEntries(['gold', 'neon', 'aurora', 'graphite', 'sakura', 'ruby', 'tropic'].map(id => [`pal:${id}`, true])),
  })));
  for (const palette of ['purple', 'orange', 'green', 'blue', 'cyan', 'gold', 'neon', 'aurora', 'graphite', 'sakura', 'ruby', 'tropic']) {
    await page.goto('../#/settings');
    await page.locator(`button[data-palette="${palette}"]`).click();
    await page.goto('../');
    await expect(page.locator('.home-hero')).toBeVisible();
    await expect(page.locator('.bgfx')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const ratio = await page.locator('.plan-form button').evaluate(button => {
      const style = getComputedStyle(button);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      function luminance(color: string) {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
          const v = value / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
      }
      const text = luminance(style.color), background = luminance(style.backgroundColor);
      return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
    });
    expect(ratio, `контраст кнопки в палитре ${palette}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('светлая классическая тема на телефоне @phone', async ({ page }, testInfo) => {
  await openClassic(page, 'light');
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await expect(page.locator('.hero-date')).toHaveCSS('border-top-color', 'rgb(221, 225, 233)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('classic-light-phone.png') });
});
