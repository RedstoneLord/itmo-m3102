// Extra site settings: hide tests, reduced motion, text size, link underline,
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
  return '<section class="dash-panel settings-group prefs-extra">' +
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
  if (!page || page.querySelector('.prefs-extra')) return;
  page.insertAdjacentHTML('beforeend', panelHtml());
}

function status(text) {
  const el = document.querySelector('.prefs-extra .prefs-status');
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
