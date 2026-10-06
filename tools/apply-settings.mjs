#!/usr/bin/env node
/*
  Подключает страницу «Настройки» (шрифт + цвета) к сайту: правит index.html и sw.js.

  Запуск из корня репозитория:
    node tools/apply-settings.mjs          — применить
    node tools/apply-settings.mjs --dry    — только показать, что будет сделано

  Скрипт безопасно запускать повторно: уже внесённые правки пропускаются, а старый
  inline-скрипт из <head> (только со шрифтом) заменяется новым (шрифт + цвета).
  Если какой-то якорь в файле не найден, ничего не записывается. Перед первой записью
  создаются копии index.html.bak и sw.js.bak.
*/
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');
let failed = false, changed = false;

for (const file of ['js/settings.js', 'css/settings.css'])
  if (!existsSync(join(root, file))) { console.warn(`! Нет файла ${file} — положите его в репозиторий.`); failed = true; }

const HEAD_SCRIPT = `<script>try{var s=JSON.parse(localStorage.getItem('m3102-settings-v1'))||{};if(s.font)document.documentElement.setAttribute('data-font',s.font);if(s.palette&&s.palette!=='purple')document.documentElement.setAttribute('data-palette',s.palette)}catch(e){}</script>`;
const FONTS_ADD = '&family=Ubuntu+Sans:ital,wght@0,100..800;1,100..800&family=Arimo:ital,wght@0,400..700;1,400..700';
const SETTINGS_CARD = `<a class="card" data-go="settings"><div class="ic">\${ic('settings',22)}</div><div class="meta"><div class="name">Настройки</div><div class="desc">Цвета, шрифт и внешний вид сайта</div></div></a>`;

function patcher(name, text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const log = (state, what) => console.log(`${state === 'ok' ? '+' : state === 'skip' ? '=' : 'x'} ${name}: ${what}`);
  const lineOf = at => { const start = text.lastIndexOf('\n', at) + 1; return { start, indent: /^[ \t]*/.exec(text.slice(start))[0] }; };
  return {
    get text() { return text; },
    /** done — признак «уже сделано»; apply — функция, возвращающая новый текст или null (якорь не найден) */
    step(what, done, apply) {
      if (done(text)) return log('skip', what);
      const next = apply(text);
      if (next == null || next === text) { failed = true; return log('fail', `${what} — якорь не найден`); }
      text = next; changed = true; log('ok', what);
    },
    /** вставляет новую строку сразу после строки, в которой найден anchor */
    afterLine(what, done, anchor, line) {
      this.step(what, done, t => {
        const at = t.indexOf(anchor); if (at < 0) return null;
        const end = t.indexOf('\n', at), stop = end < 0 ? t.length : end, { indent } = lineOf(at);
        const cut = t[stop - 1] === '\r' ? stop - 1 : stop;
        return `${t.slice(0, cut)}${eol}${indent}${line}${t.slice(cut)}`;
      });
    },
    replace(what, done, from, to) {
      this.step(what, done, t => (t.includes(from) ? t.replace(from, () => to) : null));
    },
  };
}

/* ---------------- index.html ---------------- */
const indexPath = join(root, 'index.html'), swPath = join(root, 'sw.js');
const indexOrig = readFileSync(indexPath, 'utf8'), swOrig = readFileSync(swPath, 'utf8');
const html = patcher('index.html', indexOrig);

html.replace('Google Fonts: Ubuntu Sans и Arimo', t => t.includes('Ubuntu+Sans'),
  '1,400..800&display=swap', `1,400..800${FONTS_ADD}&display=swap`);

html.step('inline-скрипт в <head> (шрифт + цвета)', t => t.includes(HEAD_SCRIPT), t => {
  const old = /<script>try\{var \w=JSON\.parse\(localStorage\.getItem\('m3102-settings-v1'\)\)[^<]*<\/script>/;
  if (old.test(t)) return t.replace(old, () => HEAD_SCRIPT);
  const anchor = '<link rel="icon" type="image/png" sizes="32x32"', at = t.indexOf(anchor);
  if (at < 0) return null;
  const eol = t.includes('\r\n') ? '\r\n' : '\n', indent = /^[ \t]*/.exec(t.slice(t.lastIndexOf('\n', at) + 1))[0];
  return `${t.slice(0, at)}${HEAD_SCRIPT}${eol}${indent}${t.slice(at)}`;
});

html.afterLine('подключение css/settings.css', t => t.includes('css/settings.css'),
  '<link rel="stylesheet" href="./css/glass.css">', '<link rel="stylesheet" href="./css/settings.css">');

html.afterLine('import js/settings.js', t => t.includes("./js/settings.js"),
  "import { installBackdrop } from './js/backdrop.js';", "import { installSettings, renderSettingsPage } from './js/settings.js';");

html.replace('карточка «Настройки» на странице «Ещё»', t => t.includes('data-go="settings"'),
  'Мини-игра: катись с холмов, делай кувырки, не засыпай</div></div></a>',
  `Мини-игра: катись с холмов, делай кувырки, не засыпай</div></div></a>\n          ${SETTINGS_CARD}`);

html.afterLine('маршрут #/settings в parseHash', t => t.includes("h==='settings'"),
  "if(h==='other')return{mode:'other',path:''};", "if(h==='settings')return{mode:'settings',path:''};");

html.replace('вкладка «Еще» подсвечена на странице настроек', t => t.includes("'students','settings']"),
  "['diagrams','memes','hedgehog','other','students'].includes(mode)",
  "['diagrams','memes','hedgehog','other','students','settings'].includes(mode)");

html.replace('settings в TAB_ORDER', t => t.includes('settings:4'),
  'hedgehog:4};', 'hedgehog:4,settings:4};');

html.afterLine('renderRoute: вызов renderSettingsPage', t => t.includes("mode==='settings')renderSettingsPage"),
  "else if(mode==='hedgehog')renderHedgehogPage();", "else if(mode==='settings')renderSettingsPage();");

html.step('installSettings() при запуске', t => t.includes('installSettings();'), t => {
  const re = /installBackdrop\(\);(\s*)route\(\);/;
  return re.test(t) ? t.replace(re, (_, gap) => `installBackdrop();${gap}installSettings();${gap}route();`) : null;
});

/* ---------------- sw.js ---------------- */
const sw = patcher('sw.js', swOrig);
sw.replace('settings.js и settings.css в SHELL', t => t.includes('./js/settings.js'),
  "'./js/backdrop.js', './css/glass.css'", "'./js/backdrop.js', './css/glass.css',\n  './js/settings.js', './css/settings.css'");

/* Любое изменение — повод обновить кэш оболочки, иначе установленные копии останутся со старыми файлами */
let indexNew = html.text, swNew = sw.text;
if (indexNew !== indexOrig || swNew !== swOrig) {
  const m = /const CACHE = 'm3102-shell-v(\d+)';/.exec(swNew);
  if (m) { swNew = swNew.replace(m[0], `const CACHE = 'm3102-shell-v${Number(m[1]) + 1}';`); console.log(`+ sw.js: CACHE v${m[1]} → v${Number(m[1]) + 1}`); }
  else { console.warn('! sw.js: строка const CACHE = … не найдена — поднимите номер кэша вручную.'); }
}

if (failed) { console.error('\nНичего не записано: исправьте замечания выше.'); process.exit(1); }
if (!changed) { console.log('\nВсё уже применено.'); process.exit(0); }
if (dry) { console.log('\n--dry: файлы не изменены.'); process.exit(0); }

if (indexNew !== indexOrig) { if (!existsSync(indexPath + '.bak')) copyFileSync(indexPath, indexPath + '.bak'); writeFileSync(indexPath, indexNew); }
if (swNew !== swOrig) { if (!existsSync(swPath + '.bak')) copyFileSync(swPath, swPath + '.bak'); writeFileSync(swPath, swNew); }
console.log('\nГотово. Проверьте сайт и удалите *.bak, когда убедитесь, что всё работает.');
