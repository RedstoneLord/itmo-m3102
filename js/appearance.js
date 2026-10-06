// Тема (авто / светлая / тёмная) и скругления (округлые / мягкие / классические / умеренные / строгие).
// Хранится в том же localStorage-ключе, что и шрифт с палитрой (m3102-settings-v1).
// Подключается из js/settings.js (правка вносится tools/apply-appearance.mjs).
const KEY = 'm3102-settings-v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = patch => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* Приватный режим. */ } };
const html = () => document.documentElement;

export const THEMES = [
  { id: 'auto', name: 'Как на устройстве', note: 'Следует настройкам системы' },
  { id: 'light', name: 'Светлая', note: 'Всегда светлая' },
  { id: 'dark', name: 'Тёмная', note: 'Всегда тёмная' },
];
export const RADII = [
  { id: 'bubbly', name: 'Округлые', note: 'Крупные мягкие скругления' },
  { id: 'soft', name: 'Мягкие', note: 'Чуть круглее обычного' },
  { id: 'classic', name: 'Классические', note: 'Как сейчас' },
  { id: 'firm', name: 'Умеренные', note: 'Чуть строже обычного' },
  { id: 'strict', name: 'Строгие', note: 'Почти прямые углы' },
];
const DEFAULT_RADIUS = 'classic';
const BAR = { light: '#f5f6fa', dark: '#11131b' };

/* ---------- тема ---------- */
export const getTheme = () => { const id = read().theme; return THEMES.some(t => t.id === id) ? id : 'auto'; };
// В CSS уже есть правила для [data-theme="light"|"dark"]; без атрибута тема определяется устройством
export function applyTheme(id) {
  if (id === 'auto') html().removeAttribute('data-theme'); else html().dataset.theme = id;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.dataset.auto ??= meta.content;
    meta.content = id === 'auto' ? meta.dataset.auto : BAR[id];
  });
}
export function setTheme(id) {
  if (!THEMES.some(t => t.id === id)) return;
  write({ theme: id }); applyTheme(id);
}

/* ---------- скругления ---------- */
export const getRadius = () => { const id = read().radius; return RADII.some(r => r.id === id) ? id : DEFAULT_RADIUS; };
// Значения --rs / --rp задаются в css/appearance.css
export function applyRadius(id) {
  if (id === DEFAULT_RADIUS) html().removeAttribute('data-radius'); else html().dataset.radius = id;
}
export function setRadius(id) {
  if (!RADII.some(r => r.id === id)) return;
  write({ radius: id }); applyRadius(id);
}

/* ---------- страница настроек ---------- */
export const APPEARANCE_HTML = '<section class="dash-panel settings-group"><div class="panel-head"><h2>Тема</h2></div><p class="settings-note">Можно закрепить светлую или тёмную тему независимо от настроек устройства.</p><div class="theme-options choice-options" role="radiogroup" aria-label="Тема оформления"></div></section>'
  + '<section class="dash-panel settings-group"><div class="panel-head"><h2>Скругления</h2></div><p class="settings-note">Радиус углов у карточек, кнопок, полей и плашек.</p><div class="radius-options choice-options" role="radiogroup" aria-label="Скругления"></div></section>';

const options = (list, current, attr, swatch) => list.map(o => `<button type="button" class="choice-option" role="radio" aria-checked="${o.id === current}" ${attr}="${o.id}"><span class="${swatch}" data-v="${o.id}" aria-hidden="true"></span><span class="choice-name">${o.name}</span><span class="choice-note">${o.note}</span></button>`).join('');

export function drawAppearance(root) {
  const theme = root.querySelector('.theme-options'), radius = root.querySelector('.radius-options');
  if (theme) theme.innerHTML = options(THEMES, getTheme(), 'data-theme-opt', 'theme-swatch');
  if (radius) radius.innerHTML = options(RADII, getRadius(), 'data-radius-opt', 'radius-swatch');
}
export function chooseAppearance(button) {
  if (button.dataset.themeOpt) setTheme(button.dataset.themeOpt);
  else if (button.dataset.radiusOpt) setRadius(button.dataset.radiusOpt);
}
