import { esc, read, save, remember, forget } from './student-core.js';
import { HOME_BLOCKS, SETUP_KEY, LAYOUT_KEY, IDENTITY_KEY, normalizeLayout, migrateSetup } from './home-preferences.js';
import { applyTheme } from './appearance.js';
import { applyPalette } from './settings.js';
import { organizeSettings } from './classic-settings.js';

let students = [],
  completed = false,
  storageWarning = false;
export const homeLayout = () => normalizeLayout(read(LAYOUT_KEY));
const palettes = [
  ['purple', 'Фиолетовая'],
  ['orange', 'Оранжевая'],
  ['green', 'Зелёная'],
  ['blue', 'Синяя'],
  ['cyan', 'Светлый циан'],
  ['gold', 'Золото'],
  ['neon', 'Неон'],
  ['aurora', 'Аврора'],
  ['graphite', 'Графит'],
  ['sakura', 'Сакура'],
  ['ruby', 'Рубин'],
  ['tropic', 'Тропики'],
];
function appearance(prefs) {
  applyTheme(prefs.theme || 'auto');
  applyPalette(prefs.palette || 'purple');
  document.documentElement.toggleAttribute('data-reduce-motion', prefs.reduceMotion === true);
}
function commit(values) {
  const before = new Map();
  try {
    for (const key of Object.keys(values)) before.set(key, localStorage.getItem(key));
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
    storageWarning = false;
  } catch {
    for (const [key, value] of before) {
      try {
        value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
      } catch {}
    }
    storageWarning = true;
  }
  for (const [key, value] of Object.entries(values)) {
    if (storageWarning) remember(key, value);
    else forget(key);
  }
  document.dispatchEvent(new CustomEvent('student:preferences'));
}
function rows(layout) {
  return layout.order
    .map((id) => {
      const b = HOME_BLOCKS.find((b) => b.id === id);
      return `<div class="home-option" data-block="${id}" data-optional="${!b.enabled && !layout.visible.includes(id)}"><label><input type="checkbox" ${layout.visible.includes(id) ? 'checked' : ''}><span><strong>${b.title}</strong><small>${b.description}</small></span></label><button type="button" class="btn2" data-up aria-label="Поднять: ${b.title}">↑</button><button type="button" class="btn2" data-down aria-label="Опустить: ${b.title}">↓</button></div>`;
    })
    .join('');
}
export function openHomeSetup(kind = 'setup') {
  if (document.querySelector('[data-home-dialog]')) return;
  const initial = !completed,
    identityOnly = kind === 'setup',
    original = { ...read('m3102-settings-v1') },
    prefs = { ...original };
  const identity = read(IDENTITY_KEY, null);
  let login = identity && typeof identity.login === 'string' ? identity.login : null,
    accepted = false;
  const dialog = document.createElement('dialog');
  const opener = document.activeElement;
  dialog.className = 'app-dialog student-dialog home-dialog';
  dialog.dataset.homeDialog = '';
  dialog.setAttribute('aria-labelledby', 'home-dialog-title');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="home-dialog-title">${identityOnly ? 'Настройте сайт под себя' : 'Настроить главную'}</h2>${!initial ? '<button class="btn2" data-cancel aria-label="Закрыть">×</button>' : ''}</div><div class="home-dialog-body">${
    identityOnly
      ? `<section><h3>Кто вы?</h3><p>Выбор нужен для мест в очередях. Это настройка этого браузера.</p><div class="home-identity-row"><button type="button" class="btn2 guest-choice" data-guest aria-pressed="${login === ''}">Я гость</button><span data-identity-status role="status"></span></div><label class="home-field">Найти студента<input type="search" data-student-search placeholder="Имя или GitHub" autocomplete="off" aria-controls="setup-students" aria-expanded="false"></label><div id="setup-students" class="student-choices" role="radiogroup" aria-label="Студенты" hidden></div></section><section><h3>Оформление</h3><div class="home-theme-segments" role="radiogroup" aria-label="Тема оформления">${[
          ['auto', 'Система'],
          ['light', 'Светлая'],
          ['dark', 'Тёмная'],
        ]
          .map(
            ([id, name]) =>
              `<button type="button" class="btn2" role="radio" data-setup-theme="${id}" aria-checked="${id === (prefs.theme || 'auto')}">${name}</button>`,
          )
          .join('')}</div><div class="home-palette-options" role="radiogroup" aria-label="Палитра">${palettes
          .filter(
            ([id]) => ['purple', 'orange', 'green', 'blue', 'cyan', original.palette].includes(id) || read('m3102-slots-v1').album?.['pal:' + id],
          )
          .map(
            ([id, name]) =>
              `<button type="button" class="btn2" role="radio" data-setup-palette="${id}" aria-checked="${id === (prefs.palette || 'purple')}"><span class="home-swatch" style="--swatch:var(--pal-${id}-a)" aria-hidden="true"></span>${name}</button>`,
          )
          .join(
            '',
          )}</div><label class="toggle-label"><input type="checkbox" data-setup-motion ${prefs.reduceMotion ? 'checked' : ''}> Меньше анимаций</label></section>`
      : ''
  }<section><h3>Что показывать на главной</h3><p>Скрытие блока сохраняет все ваши задачи и отметки.</p><div data-order>${rows(homeLayout())}</div><div class="student-actions"><button type="button" class="btn2 btn-quiet" data-optional-toggle aria-expanded="false">Добавить блоки</button><button type="button" class="btn2 btn-quiet" data-reorder-toggle aria-pressed="false">Изменить порядок</button><button type="button" class="btn2 btn-quiet" data-defaults aria-label="Вернуть стандартный набор">Стандартный набор</button></div></section></div><div class="home-dialog-footer"><p data-setup-hint>${initial ? 'Выберите студента или нажмите «Я гость», чтобы продолжить.' : 'Изменения применятся после сохранения.'}</p><div class="student-actions">${!initial ? '<button type="button" class="btn2" data-cancel>Отмена</button>' : ''}<button type="button" class="btn2 btn-primary" data-home-save ${initial && login === null ? 'disabled' : ''}>${identityOnly ? 'Готово' : 'Сохранить'}</button></div></div>`;
  const updateIdentity = () => {
    const q = (dialog.querySelector('[data-student-search]')?.value || '').toLowerCase().replaceAll('ё', 'е');
    const list = students.filter((s) => (s.name + ' ' + s.nick).toLowerCase().replaceAll('ё', 'е').includes(q));
    const box = dialog.querySelector('.student-choices');
    if (box) {
      box.hidden = !q;
      dialog.querySelector('[data-student-search]').setAttribute('aria-expanded', String(Boolean(q)));
      box.innerHTML =
        list
          .map(
            (s) =>
              `<button type="button" class="btn2" role="radio" data-login="${esc(s.nick)}" aria-checked="${login === s.nick}">${esc(s.name)}${login === s.nick ? ' ✓' : ''}</button>`,
          )
          .join('') || '<p>Никого не нашли. Попробуйте другую часть имени.</p>';
    }
    if (identityOnly) {
      dialog.querySelector('[data-guest]').setAttribute('aria-pressed', String(login === ''));
      dialog.querySelector('[data-identity-status]').textContent =
        login === null ? 'Выбор пока не сделан' : login === '' ? 'Выбран гость' : `Выбран: ${students.find((s) => s.nick === login)?.name || login}`;
    }
    dialog.querySelector('[data-home-save]').disabled = initial && login === null;
  };
  dialog.addEventListener('input', (e) => {
    if (e.target.matches('[data-student-search]')) updateIdentity();
  });
  dialog.addEventListener('change', () => {
    if (!identityOnly) return;
    prefs.reduceMotion = dialog.querySelector('[data-setup-motion]').checked;
    appearance(prefs);
  });
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-cancel]')) dialog.close();
    const person = e.target.closest('[data-login]');
    if (person) {
      login = person.dataset.login;
      dialog.querySelector('[data-student-search]').value = '';
      updateIdentity();
      const status = dialog.querySelector('[data-identity-status]');
      status.tabIndex = -1;
      status.focus();
    }
    if (e.target.closest('[data-guest]')) {
      login = '';
      updateIdentity();
    }
    for (const [selector, key] of [
      ['[data-setup-theme]', 'theme'],
      ['[data-setup-palette]', 'palette'],
    ]) {
      const choice = e.target.closest(selector);
      if (choice) {
        prefs[key] = key === 'theme' ? choice.dataset.setupTheme : choice.dataset.setupPalette;
        dialog.querySelectorAll(selector).forEach((n) => n.setAttribute('aria-checked', String(n === choice)));
        appearance(prefs);
      }
    }
    const order = dialog.querySelector('[data-order]');
    if (e.target.closest('[data-optional-toggle]')) {
      const shown = order.toggleAttribute('data-show-optional');
      e.target.closest('button').setAttribute('aria-expanded', String(shown));
    }
    if (e.target.closest('[data-reorder-toggle]')) {
      const shown = order.toggleAttribute('data-reordering');
      e.target.closest('button').setAttribute('aria-pressed', String(shown));
    }
    const row = e.target.closest('[data-block]');
    if (row && e.target.closest('[data-up]') && row.previousElementSibling) {
      row.previousElementSibling.before(row);
      e.target.closest('button').focus();
    }
    if (row && e.target.closest('[data-down]') && row.nextElementSibling) {
      row.nextElementSibling.after(row);
      e.target.closest('button').focus();
    }
    if (e.target.closest('[data-defaults]')) dialog.querySelector('[data-order]').innerHTML = rows(normalizeLayout(null));
    if (e.target.closest('[data-home-save]')) {
      if (initial && login === null) return;
      const elements = [...dialog.querySelectorAll('[data-block]')];
      const values = {
        [LAYOUT_KEY]: normalizeLayout({
          order: elements.map((n) => n.dataset.block),
          visible: elements.filter((n) => n.querySelector('input').checked).map((n) => n.dataset.block),
        }),
      };
      if (identityOnly) {
        values[IDENTITY_KEY] = { login };
        values[SETUP_KEY] = { version: 1, completed: true };
        values['m3102-settings-v1'] = prefs;
      }
      commit(values);
      completed = true;
      accepted = true;
      appearance(identityOnly ? prefs : original);
      dialog.close();
      if (storageWarning) showStorageWarning();
    }
  });
  dialog.addEventListener('keydown', (e) => {
    const radio = e.target.closest('[role="radio"]');
    if (!radio || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const options = [...radio.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
    const i = options.indexOf(radio),
      delta = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1;
    const next = options[e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (i + delta + options.length) % options.length];
    e.preventDefault();
    next.focus();
    next.click();
  });
  dialog.addEventListener('cancel', (e) => {
    if (initial) e.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (!accepted) appearance(original);
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  });
  document.body.append(dialog);
  updateIdentity();
  dialog.showModal();
  if (identityOnly) dialog.querySelector('[data-guest]').focus({ preventScroll: true });
}
function showStorageWarning() {
  let node = document.getElementById('home-storage-warning');
  if (!node) {
    node = document.createElement('p');
    node.id = 'home-storage-warning';
    node.setAttribute('role', 'status');
    document.querySelector('header')?.after(node);
  }
  node.textContent = 'Браузер не сохранил настройки. Они действуют в этой вкладке до её закрытия.';
}
export function mountHomeSettings() {
  const page = document.querySelector('.settings-page');
  if (!page) return;
  const reading = page.querySelector('.prefs-extra'),
    data = page.querySelector('#student-settings');
  if (reading && data && reading.nextElementSibling !== data) data.before(reading);
  if (page.querySelector('#home-settings-profile')) {
    organizeSettings(page);
    return;
  }
  const profile = document.createElement('section');
  profile.className = 'dash-panel';
  profile.id = 'home-settings-profile';
  profile.innerHTML = `<div class="panel-head"><h2>Профиль</h2></div><p>Выбор студента или гостя, оформление и главная теперь настраиваются в одном окне.</p><p data-profile-name></p><button type="button" class="btn2" data-quick-setup>Быстрая настройка</button>`;
  const home = document.createElement('section');
  home.className = 'dash-panel';
  home.innerHTML =
    '<div class="panel-head"><h2>Главная</h2></div><p>Выберите блоки и их порядок.</p><button class="btn2" data-home-config>Настроить главную</button>';
  page.querySelector('.intro').after(profile, home);
  const heading = document.createElement('h2');
  heading.textContent = 'Оформление и чтение';
  home.after(heading);
  profile.querySelector('[data-profile-name]').textContent = read(IDENTITY_KEY).login
    ? `Вы: ${students.find((s) => s.nick === read(IDENTITY_KEY).login)?.name || read(IDENTITY_KEY).login}`
    : 'Вы: гость';
  organizeSettings(page);
}
export function installHomeSetup(list) {
  students = list;
  completed = migrateSetup(read(SETUP_KEY), read(IDENTITY_KEY, null)).completed;
  if (completed && !save(SETUP_KEY, { version: 1, completed: true })) showStorageWarning();
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-home-config]')) openHomeSetup('home');
    if (e.target.closest('[data-quick-setup]')) openHomeSetup();
  });
  if (!completed) setTimeout(() => openHomeSetup(), 0);
}
