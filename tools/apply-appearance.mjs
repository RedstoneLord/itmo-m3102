#!/usr/bin/env node
/*
  Подключает к настройкам сайта: тему (авто / светлая / тёмная), скругления (округлые / классические / строгие)
  и загрузку URW Gothic из папки fonts/. Правит существующие файлы; новые (js/appearance.js,
  css/appearance.css, fonts/README.md) должны уже лежать в репозитории.

  Запуск из корня репозитория:
    node tools/apply-appearance.mjs --dry   — показать, что будет сделано
    node tools/apply-appearance.mjs         — применить

  Безопасно запускать повторно: сделанные правки пропускаются. Если какой-то якорь не найден,
  ничего не записывается. Откат — git checkout.

  Что делает:
    index.html   — inline-скрипт в <head> (тема и скругления без «мигания»), css/appearance.css,
                   'fonts' в HIDDEN_FOLDER_NAMES, радиусы в <style>
    js/settings.js — две новые группы настроек
    css/settings.css — @font-face: сначала файлы из fonts/, потом системный шрифт
    sw.js        — appearance.css и шрифты в кэше оболочки, номер кэша +1
    все css/*.css, site.css, array-player.js, offline.js — каждый радиус border-radius: Npx
                   превращается в calc(Npx * var(--rs,1)); «таблетки» (>= 100px) — в calc(… var(--rp,1))

  ВАЖНО: после этого НЕ запускайте tools/soften-radii.mjs — он не рассчитан на calc().
*/
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');
let failed = false;

for (const rel of ['js/appearance.js', 'css/appearance.css'])
  if (!existsSync(join(root, rel))) { console.warn(`! Нет файла ${rel} — положите его в репозиторий.`); failed = true; }
if (failed) process.exit(1);

const files = new Map();
const load = rel => {
  if (!files.has(rel)) { const text = readFileSync(join(root, rel), 'utf8'); files.set(rel, { orig: text, text }); }
  return files.get(rel);
};
const log = (state, rel, what) => console.log(`${state === 'ok' ? '+' : state === 'skip' ? '=' : 'x'} ${rel}: ${what}`);
function step(rel, what, done, apply) {
  const file = load(rel);
  if (done(file.text)) return log('skip', rel, what);
  const next = apply(file.text);
  if (next == null || next === file.text) { failed = true; return log('fail', rel, `${what} — якорь не найден`); }
  file.text = next; log('ok', rel, what);
}
const replace = (rel, what, done, from, to) => step(rel, what, done, t => (t.includes(from) ? t.replace(from, () => to) : null));

/* ---------------- index.html ---------------- */
const HEAD_SCRIPT = `<script>try{var s=JSON.parse(localStorage.getItem('m3102-settings-v1'))||{},r=document.documentElement;if(s.font)r.setAttribute('data-font',s.font);if(s.palette&&s.palette!=='purple')r.setAttribute('data-palette',s.palette);if(s.theme==='light'||s.theme==='dark')r.setAttribute('data-theme',s.theme);if(s.radius==='bubbly'||s.radius==='strict')r.setAttribute('data-radius',s.radius)}catch(e){}</script>`;

step('index.html', 'inline-скрипт в <head> (тема и скругления)', t => t.includes("s.radius==='bubbly'"), t => {
  const old = /<script>try\{var \w=JSON\.parse\(localStorage\.getItem\('m3102-settings-v1'\)\)[^<]*<\/script>/;
  return old.test(t) ? t.replace(old, () => HEAD_SCRIPT) : null;
});

step('index.html', 'подключение css/appearance.css', t => t.includes('css/appearance.css'), t => {
  const anchor = '<link rel="stylesheet" href="./css/settings.css">', at = t.indexOf(anchor);
  if (at < 0) return null;
  const eol = t.includes('\r\n') ? '\r\n' : '\n', indent = /^[ \t]*/.exec(t.slice(t.lastIndexOf('\n', at) + 1))[0], end = at + anchor.length;
  return `${t.slice(0, end)}${eol}${indent}<link rel="stylesheet" href="./css/appearance.css">${t.slice(end)}`;
});

replace('index.html', "папка fonts в HIDDEN_FOLDER_NAMES", t => t.includes("'app', 'fonts'"), "'.github', 'app']", "'.github', 'app', 'fonts']");

/* ---------------- js/settings.js ---------------- */
const APP_IMPORT = "import { applyTheme, applyRadius, getTheme, getRadius, drawAppearance, chooseAppearance, APPEARANCE_HTML } from './appearance.js';";
replace('js/settings.js', 'import js/appearance.js', t => t.includes('./appearance.js'),
  "import { ic } from './icons.js';", `import { ic } from './icons.js';\n${APP_IMPORT}`);
replace('js/settings.js', 'installSettings применяет тему и скругления', t => t.includes('applyTheme(getTheme())'),
  'applyFont(getFont()); applyPalette(getPalette()); };', 'applyFont(getFont()); applyPalette(getPalette()); applyTheme(getTheme()); applyRadius(getRadius()); };');
replace('js/settings.js', 'группы «Тема» и «Скругления» на странице', t => t.includes('${APPEARANCE_HTML}'),
  '<section class="dash-panel settings-group"><div class="panel-head"><h2>Шрифт сайта</h2></div>',
  '${APPEARANCE_HTML}<section class="dash-panel settings-group"><div class="panel-head"><h2>Шрифт сайта</h2></div>');
replace('js/settings.js', 'отрисовка вариантов темы и скруглений', t => t.includes('drawAppearance(content)'),
  "content.querySelector('.font-options').innerHTML = FONTS.map(", "drawAppearance(content);\n    content.querySelector('.font-options').innerHTML = FONTS.map(");
replace('js/settings.js', 'обработка кликов по темам и скруглениям', t => t.includes('chooseAppearance(opt)'),
  ", font = event.target.closest('button[data-font]');",
  ", font = event.target.closest('button[data-font]'), opt = event.target.closest('button[data-theme-opt],button[data-radius-opt]');");
replace('js/settings.js', 'ветка opt в обработчике кликов', t => t.includes('else if (opt)'),
  'if (pal) setPalette(pal.dataset.palette); else if (font)', 'if (pal) setPalette(pal.dataset.palette); else if (opt) chooseAppearance(opt); else if (font)');
replace('js/settings.js', 'подпись URW Gothic', t => t.includes('Загружается из папки fonts/'),
  "note: 'Системный или файл из папки fonts/'", "note: 'Загружается из папки fonts/ (запасной вариант — системный)'");
replace('js/settings.js', 'подпись у цветов', t => t.includes('выбирается ниже'),
  'Светлая и тёмная тема по-прежнему определяются устройством.', 'Светлая или тёмная тема выбирается ниже.');

/* ---------------- css/settings.css: URW Gothic из fonts/ ---------------- */
replace('css/settings.css', 'URW Gothic Book: сначала файл', t => t.includes('url("../fonts/URWGothic-Book.woff2") format("woff2"),local'),
  'src:local("URW Gothic Book"),local("URWGothic-Book"),url("../fonts/URWGothic-Book.woff2") format("woff2")}',
  'src:url("../fonts/URWGothic-Book.woff2") format("woff2"),local("URW Gothic Book"),local("URWGothic-Book")}');
replace('css/settings.css', 'URW Gothic Demi: сначала файл', t => t.includes('url("../fonts/URWGothic-Demi.woff2") format("woff2"),local'),
  'src:local("URW Gothic Demi"),local("URWGothic-Demi"),url("../fonts/URWGothic-Demi.woff2") format("woff2")}',
  'src:url("../fonts/URWGothic-Demi.woff2") format("woff2"),local("URW Gothic Demi"),local("URWGothic-Demi")}');
replace('css/settings.css', 'комментарий к @font-face', t => t.includes('берём файл из папки fonts/'),
  '/* URW Gothic нет в Google Fonts: берём системный, а если его нет — свой файл из репозитория */',
  '/* URW Gothic нет в Google Fonts: берём файл из папки fonts/, а если его нет — системный */');

/* ---------------- sw.js ---------------- */
replace('sw.js', 'appearance.css и шрифты в SHELL', t => t.includes('./css/appearance.css'),
  "'./js/settings.js', './css/settings.css'",
  "'./js/settings.js', './css/settings.css', './css/appearance.css', './js/appearance.js',\n  './fonts/URWGothic-Book.woff2', './fonts/URWGothic-Demi.woff2'");

/* ---------------- радиусы -> calc(Npx * var(--rs,1)) ---------------- */
const RADIUS = /((?:border(?:-[a-z]+){0,2}-radius|--radius)\s*:\s*)([^;}]+)/g;
function scaleRadii(text) {
  return text.replace(RADIUS, (whole, key, value) => {
    if (/var\(--r[sp]/.test(value)) return whole; // уже преобразовано
    const next = value.replace(/(\d*\.?\d+)px/g, (match, n) => (Number(n) ? `calc(${n}px * var(${Number(n) >= 100 ? '--rp' : '--rs'},1))` : match));
    return key + next;
  });
}
const radiusFiles = ['site.css', 'js/diagrams/array-player.js', 'js/offline.js',
  ...readdirSync(join(root, 'css')).filter(f => f.endsWith('.css') && f !== 'appearance.css').map(f => `css/${f}`)]
  .filter(rel => existsSync(join(root, rel)));
for (const rel of radiusFiles) {
  const file = load(rel), next = scaleRadii(file.text);
  if (next === file.text) log('skip', rel, 'радиусы уже преобразованы');
  else { file.text = next; log('ok', rel, 'радиусы → calc(… * var(--rs))'); }
}
{ // index.html: только содержимое <style>…</style>, JS не трогаем
  const file = load('index.html'), next = file.text.replace(/<style[^>]*>[\s\S]*?<\/style>/g, scaleRadii);
  if (next === file.text) log('skip', 'index.html', 'радиусы в <style> уже преобразованы');
  else { file.text = next; log('ok', 'index.html', 'радиусы в <style> → calc(… * var(--rs))'); }
}

/* Любое изменение — повод обновить кэш оболочки */
const changed = [...files.entries()].filter(([, f]) => f.text !== f.orig);
if (changed.length) {
  const sw = load('sw.js'), m = /const CACHE = 'm3102-shell-v(\d+)';/.exec(sw.text);
  if (m) { sw.text = sw.text.replace(m[0], `const CACHE = 'm3102-shell-v${Number(m[1]) + 1}';`); log('ok', 'sw.js', `CACHE v${m[1]} → v${Number(m[1]) + 1}`); }
  else console.warn('! sw.js: строка const CACHE = … не найдена — поднимите номер кэша вручную.');
}

if (failed) { console.error('\nНичего не записано: исправьте замечания выше.'); process.exit(1); }
if (![...files.values()].some(f => f.text !== f.orig)) { console.log('\nВсё уже применено.'); process.exit(0); }
if (dry) { console.log('\n--dry: файлы не изменены.'); process.exit(0); }
for (const [rel, f] of files) if (f.text !== f.orig) writeFileSync(join(root, rel), f.text);
console.log('\nГотово. Проверьте сайт; откат — git checkout.');
