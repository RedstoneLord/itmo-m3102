#!/usr/bin/env node
// Applies the "hide tests" switch and some extra settings to the classic M3102 site.
//
// Usage (from the repo root):   node apply-settings-features.mjs [--dry]
//
// What it does
//   1. creates  js/prefs.js   (storage, applying prefs, settings panel injected into #/settings)
//   2. creates  css/prefs.css (hide-tests rules, reduced motion, text size, link underline, panel styles)
//   3. patches  index.html    (early inline script so there is no flash, stylesheet link, module script)
//   4. patches  sw.js         (bumps the shell cache version, adds the two new files to the shell list)
//
// New settings (all stored in the existing localStorage key "m3102-settings-v1"):
//   hideQuizzes     - do not show tests (```quiz blocks and full-page tests)
//   reduceMotion    - turn off animations and transitions
//   textScale       - page text size: 100 / 110 / 125 / 140 %
//   underlineLinks  - always underline links
//   + export / import / reset of all site settings (JSON file)
//
// The script is idempotent: running it twice changes nothing the second time.
// It never edits js/settings.js: the panel is added to the settings page at runtime.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DRY = process.argv.includes('--dry');
const MARK = 'prefs-extra';
const problems = [];

function save(path, text) {
  if (DRY) { console.log('[dry] would write ' + path + ' (' + text.length + ' chars)'); return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log('wrote ' + path);
}

// ---------------------------------------------------------------- js/prefs.js
const PREFS_JS = String.raw`// Extra site settings: hide tests, reduced motion, text size, link underline,
// export / import / reset. Stored in the same localStorage key as the other settings.
const KEY = 'm3102-settings-v1';
const DEFAULTS = { hideQuizzes: false, reduceMotion: false, textScale: 100, underlineLinks: false };
const SCALES = [100, 110, 125, 140];

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
const write = patch => {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* storage blocked */ }
};

export const getPref = name => (name in read() ? read()[name] : DEFAULTS[name]);
export const setPref = (name, value) => { write({ [name]: value }); applyPrefs(); };
export const getHideQuizzes = () => getPref('hideQuizzes') === true;
export const setHideQuizzes = on => setPref('hideQuizzes', Boolean(on));

function flag(root, name, on) {
  if (on) root.setAttribute(name, ''); else root.removeAttribute(name);
}

export function applyPrefs() {
  const root = document.documentElement;
  const s = { ...DEFAULTS, ...read() };
  flag(root, 'data-hide-quizzes', s.hideQuizzes === true);
  flag(root, 'data-reduce-motion', s.reduceMotion === true);
  flag(root, 'data-underline-links', s.underlineLinks === true);
  const scale = SCALES.includes(Number(s.textScale)) ? Number(s.textScale) : 100;
  if (scale === 100) root.removeAttribute('data-text-scale'); else root.setAttribute('data-text-scale', String(scale));
}

function panelHtml() {
  const s = { ...DEFAULTS, ...read() };
  const check = (name, label, note) =>
    '<label class="toggle-label"><input type="checkbox" data-pref="' + name + '"' +
    (s[name] === true ? ' checked' : '') + '> ' + label + '</label>' +
    (note ? '<p class="settings-note">' + note + '</p>' : '');
  const scale = SCALES.includes(Number(s.textScale)) ? Number(s.textScale) : 100;
  const options = SCALES.map(v => '<option value="' + v + '"' + (v === scale ? ' selected' : '') + '>' + v + '%</option>').join('');
  return '<section class="dash-panel settings-group ${MARK}">' +
    '<div class="panel-head"><h2>Тесты и удобство</h2></div>' +
    check('hideQuizzes', 'Скрыть тесты', 'Блоки с тестами в конспектах и страницы-тесты не показываются.') +
    check('reduceMotion', 'Меньше анимаций', 'Отключает переходы и анимации на сайте.') +
    check('underlineLinks', 'Подчёркивать ссылки', '') +
    '<label class="prefs-row">Размер текста <select data-pref="textScale" data-number>' + options + '</select></label>' +
    '<div class="prefs-actions">' +
    '<button type="button" data-prefs-action="export">Экспорт настроек</button>' +
    '<button type="button" data-prefs-action="import">Импорт настроек</button>' +
    '<button type="button" data-prefs-action="reset">Сбросить всё</button>' +
    '</div><input type="file" accept="application/json,.json" hidden data-prefs-import>' +
    '<p class="settings-note prefs-status" role="status"></p></section>';
}

function mount() {
  const page = document.querySelector('.settings-page');
  if (!page || page.querySelector('.${MARK}')) return;
  page.insertAdjacentHTML('beforeend', panelHtml());
}

function status(text) {
  const el = document.querySelector('.${MARK} .prefs-status');
  if (el) el.textContent = text;
}

function sanitize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (k.length > 40) continue;
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 200)) out[k] = v;
  }
  return out;
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(read(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'm3102-settings.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status('Настройки сохранены в файл.');
}

async function importSettings(file) {
  try {
    const data = sanitize(JSON.parse(await file.text()));
    if (!Object.keys(data).length) { status('В файле нет подходящих настроек.'); return; }
    write(data);
    location.reload();
  } catch { status('Не удалось прочитать файл настроек.'); }
}

function resetSettings() {
  if (!confirm('Сбросить все настройки сайта (тема, шрифт, палитра и т. д.)?')) return;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  location.reload();
}

export function installPrefs() {
  applyPrefs();
  document.addEventListener('change', event => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches('[data-pref]')) {
      const name = t.getAttribute('data-pref');
      const value = t.type === 'checkbox' ? t.checked : t.hasAttribute('data-number') ? Number(t.value) : t.value;
      setPref(name, value);
    } else if (t.matches('[data-prefs-import]') && t.files && t.files[0]) {
      importSettings(t.files[0]);
      t.value = '';
    }
  });
  document.addEventListener('click', event => {
    const b = event.target instanceof Element ? event.target.closest('[data-prefs-action]') : null;
    if (!b) return;
    const action = b.getAttribute('data-prefs-action');
    if (action === 'export') exportSettings();
    else if (action === 'reset') resetSettings();
    else if (action === 'import') { const input = document.querySelector('[data-prefs-import]'); if (input) input.click(); }
  });
  window.addEventListener('storage', event => { if (event.key === KEY) applyPrefs(); });
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();
}

installPrefs();
`.replaceAll('${MARK}', MARK);

// ---------------------------------------------------------------- css/prefs.css
const PREFS_CSS = String.raw`/* Extra settings: see js/prefs.js */

/* Hide tests */
html[data-hide-quizzes] .quiz-block { display: none !important; }
html[data-hide-quizzes] .quiz-page > * { display: none !important; }
html[data-hide-quizzes] .quiz-page::before {
  content: "Тесты скрыты в настройках (Настройки → Тесты и удобство)";
  display: block;
  padding: 1rem 0;
  opacity: .7;
}

/* Reduced motion */
html[data-reduce-motion] *,
html[data-reduce-motion] *::before,
html[data-reduce-motion] *::after {
  animation-duration: .001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: .001ms !important;
  scroll-behavior: auto !important;
}

/* Text size */
html[data-text-scale="110"] body { zoom: 1.1; }
html[data-text-scale="125"] body { zoom: 1.25; }
html[data-text-scale="140"] body { zoom: 1.4; }

/* Links */
html[data-underline-links] a { text-decoration: underline; }

/* Settings panel */
.prefs-extra .prefs-row { display: flex; align-items: center; gap: .6rem; margin: .6rem 0; }
.prefs-extra select { font: inherit; }
.prefs-extra .prefs-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .8rem; }
.prefs-extra .prefs-actions button { font: inherit; cursor: pointer; }
`;

// ---------------------------------------------------------------- patches
function patchIndex(path) {
  if (!existsSync(path)) { problems.push(path + ' not found (run from the repo root)'); return; }
  let html = readFileSync(path, 'utf8');
  if (html.includes('<!-- ' + MARK + ' -->')) { console.log(path + ': already patched'); return; }

  const head = html.match(/<head[^>]*>/i);
  const end = html.search(/<\/head>/i);
  if (!head || end < 0) { problems.push(path + ': <head> not found'); return; }

  const early =
    '\n<!-- ' + MARK + ' -->\n<script>try{var s=JSON.parse(localStorage.getItem("m3102-settings-v1")||"{}"),h=document.documentElement;' +
    'if(s.hideQuizzes===true)h.setAttribute("data-hide-quizzes","");' +
    'if(s.reduceMotion===true)h.setAttribute("data-reduce-motion","");' +
    'if(s.underlineLinks===true)h.setAttribute("data-underline-links","");' +
    'if([110,125,140].indexOf(Number(s.textScale))>=0)h.setAttribute("data-text-scale",String(Number(s.textScale)))}catch(e){}</script>';
  const tail = '\n<link rel="stylesheet" href="css/prefs.css">\n<script type="module" src="js/prefs.js"></script>\n';

  let afterHead = head.index + head[0].length;
  const cs = html.slice(afterHead, end).match(/<meta[^>]*charset[^>]*>/i);
  if (cs) afterHead += cs.index + cs[0].length; // keep charset within the first 1024 bytes
  html = html.slice(0, afterHead) + early + html.slice(afterHead, end) + tail + html.slice(end);
  save(path, html);
}

function patchSw(path) {
  if (!existsSync(path)) { console.log(path + ' not found - skipping service worker patch'); return; }
  let sw = readFileSync(path, 'utf8');
  if (sw.includes('js/prefs.js')) { console.log(path + ': already patched'); return; }

  sw = sw.replace(/(m3102-shell-v)(\d+)/, (_, p, n) => p + (Number(n) + 1));

  const anchor = sw.match(/(['"`])((?:\.\/|\/)?)js\/settings\.js\1/);
  if (!anchor) {
    problems.push(path + ': could not find js/settings.js in the shell list; add js/prefs.js and css/prefs.css there by hand (the shell is network-first, so it still works)');
  } else {
    const q = anchor[1], pre = anchor[2];
    sw = sw.replace(anchor[0], anchor[0] + ', ' + q + pre + 'js/prefs.js' + q + ', ' + q + pre + 'css/prefs.css' + q);
  }
  save(path, sw);
}

// ---------------------------------------------------------------- run
if (!existsSync('index.html')) {
  console.error('Run this from the repo root (index.html not found).');
  process.exit(1);
}
save('js/prefs.js', PREFS_JS);
save('css/prefs.css', PREFS_CSS);
patchIndex('index.html');
patchSw('sw.js');

if (problems.length) {
  console.warn('\nNeeds attention:');
  for (const p of problems) console.warn(' - ' + p);
  process.exitCode = 2;
} else {
  console.log('\nDone. Open #/settings and look for "Тесты и удобство".');
}
