import { expect, it } from 'vitest';
import { patchClassicIndex } from './classicPatch';
import { patchClassicModule } from './classicPatch';
import classicIndex from '../../../index.html?raw';
import classicSchedule from '../../../js/schedule.js?raw';
import classicHomework from '../../../js/homework.js?raw';
import classicScheduleUi from '../../../js/schedule-ui.js?raw';

const SOURCE = `<!DOCTYPE html><html><head><link rel="manifest" href="manifest.webmanifest">
<title>M3102</title></head><body><script>
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
</script></body></html>`;

it('патч классического сайта группы: без манифеста, с его service worker и переключателем стиля в <head>', () => {
  const html = patchClassicIndex(SOURCE);
  expect(html).not.toContain('manifest');
  // Его офлайн-режим сохраняем: регистрация воркера остаётся как есть
  expect(html).toContain("navigator.serviceWorker.register('./sw.js')");
  expect(html.indexOf('./switch/site-switch.js')).toBeLessThan(html.indexOf('</head>'));
  expect(html).toContain('<html data-site-style="classic">');
});

it('патч классического сайта группы: список скрытых файлов приводится к нижнему регистру (иначе AGENTS.md и CLAUDE.md видны)', () => {
  const html = patchClassicIndex(
    "<html><head></head><body><script>const HIDDEN_FILE_NAMES=['site.css','sw.js', 'CLAUDE.md', 'AGENTS.md', '.git-blame-ignore-revs'];</script></body></html>",
  );
  expect(html).toContain("['site.css','sw.js', 'claude.md', 'agents.md', '.git-blame-ignore-revs']");
  expect(html).toContain('HIDDEN_FILE_NAMES');
});

it('патч классического сайта группы: разметка без </head> — понятная ошибка, а не тихо сломанная копия', () => {
  expect(() => patchClassicIndex('<html></html>')).toThrow(/patchClassicIndex/);
});

it('светлая тема встраивается после исходных стилей в кешируемый HTML, без отдельной загрузки CSS', () => {
  const html = patchClassicIndex(SOURCE.replace('</head>', '<link rel="stylesheet" href="css/reading.css"></head>'));
  const start = html.indexOf('<style id="classic-light-theme">');
  expect(start).toBeGreaterThan(html.indexOf('css/reading.css'));
  expect(start).toBeLessThan(html.indexOf('</head>'));
  // Переключение на светлую тему должно работать и поверх системной тёмной, и без явной настройки.
  expect(html).toContain('@media screen and (prefers-color-scheme: light)');
  expect(html).toContain(':root:not([data-theme="dark"])');
  expect(html).toContain(':root[data-theme="light"]');
  expect(html).not.toContain('& .');
});

it('подключения дополнений совместимы с настоящими исходниками классики', () => {
  const original = classicIndex;
  const html = patchClassicIndex(original);
  expect(html).toContain('renderStudentRoute(mode,path)');
  expect(html).toContain('directoryResponse(path)');
  expect(html).toContain("'output','node_modules'");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeTruthy();
  // Parse the complete patched page, not just replacement snippets.
  expect(() => new Function(script!.replace(/^\s*import\s+[^;\n]+;[^\n]*/gm, ''))).not.toThrow();
  for (const [path, source] of [
    ['js/schedule.js', classicSchedule],
    ['js/homework.js', classicHomework],
    ['js/schedule-ui.js', classicScheduleUi],
  ]) {
    const patched = patchClassicModule(path!, source!);
    expect(patched).not.toBe(source);
  }
  expect(() => patchClassicIndex(original.replace('updateActiveTab(mode,path);', 'changedUpstream();'))).toThrow(/integration changed/);
});
