/* casino:step6 */
/*
  Темы оформления казино (слоты, блэкджек, рулетка, хаб): реестр, применение к .casino-root, SVG-фильтры символов, наборы звука.
  Без DOM при импорте (грузится и в Node). Зависимостей нет — поэтому slots-audio.js может импортировать makeThemeSounds без циклов.

  Как пользоваться из игр:
    applyCasinoTheme(rootEl, S)   — повесить на корень страницы классы casino-root / th-<тема> / sk-<тема> и CSS-переменные --ct-*
                                    (S — состояние слотов m3102-slots-v1; без S тема читается из localStorage);
    decorateCasinoPage()          — то же для текущей страницы (вызывается из index.html после каждого перехода);
    themeVars(S)                  — { id, theme, vars }: переменные темы + предметы S.equip (felt/chips/cardback) поверх;
    chipTier(value)               — 1..4 для .ct-chip[data-tier];
  Готовые CSS-классы для столов: .ct-felt (сукно), .ct-chip[data-tier] (фишка), .ct-cardback (рубашка карты).
*/
export const SLOTS_KEY = 'm3102-slots-v1';
export const THEME_IDS = ['forest', 'night', 'server', 'velvet', 'arcade', 'vault'];
const FREE_ITEMS = ['theme:forest', 'title:newbie', 'chips:berry', 'felt:burgundy'];
const px = n => 'calc(' + n + 'px * var(--rs,1))';
const stack = (...names) => names.map(n => (/\s/.test(n) ? '"' + n + '"' : n)).join(', ');
const SANS = ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'];

/* ---------- реестр тем ---------- */
// font/fontDisplay — стеки (Google Fonts подключены в index.html; офлайн остаются системные), vars — CSS-переменные --ct-*
export const THEMES = {
  forest: {
    id: 'forest', item: 'theme:forest', name: 'Лес', cls: 'th-forest', skin: '', sound: 'forest',
    font: stack('Comfortaa', 'Nunito', 'Varela Round', 'Trebuchet MS', 'ui-rounded', ...SANS),
    fontDisplay: stack('Comfortaa', 'Nunito', 'Varela Round', 'Trebuchet MS', 'ui-rounded', ...SANS),
    vars: {
      '--ct-acc': '#9be37a', '--ct-acc2': '#ffd84a',
      '--ct-r-btn': px(16), '--ct-r-dlg': px(22), '--ct-r-frame': px(24),
      '--ct-bw': '3px', '--ct-edge': '#2f6b3a',
      '--ct-shadow': '0 4px 0 #1a3d25', '--ct-shadow-press': '0 1px 0 #1a3d25', '--ct-press': 'translateY(3px)',
      '--ct-btn-bg': 'color-mix(in srgb,#7fd070 16%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': 'linear-gradient(180deg,#8fe07f,#3f9a4e)', '--ct-primary-fg': '#0f2e18',
      '--ct-dlg-bg': 'color-mix(in srgb,#3f9a4e 12%,var(--card))', '--ct-dlg-edge': '#2f6b3a', '--ct-dlg-shadow': '0 6px 0 #1a3d25,0 28px 70px rgba(0,0,0,.35)',
      '--ct-felt-a': '#2f7d46', '--ct-felt-b': '#1b4d2b', '--ct-felt-line': '#9be37a', '--ct-felt-ink': '#eaffdc',
      '--ct-chip-1': '#f4f1de', '--ct-chip-2': '#e8467c', '--ct-chip-3': '#3f9a4e', '--ct-chip-4': '#2b2a3a', '--ct-chip-edge': '#ffffff', '--ct-chip-ink': '#173d22', '--ct-chip-stripe': '#ffffff',
      '--ct-cb-a': '#2f6b3a', '--ct-cb-b': '#9be37a', '--ct-cb-c': '#ffd84a',
    },
  },
  night: {
    id: 'night', item: 'theme:night', name: 'Звёздная ночь', cls: 'th-night', skin: 'sk-night', sound: 'night',
    font: stack('Exo 2', 'Rajdhani', ...SANS), fontDisplay: stack('Exo 2', 'Rajdhani', ...SANS),
    vars: {
      '--ct-acc': '#7cf0ff', '--ct-acc2': '#b88cff',
      '--ct-r-btn': px(10), '--ct-r-dlg': px(16), '--ct-r-frame': px(18),
      '--ct-bw': '1.5px', '--ct-edge': '#7cf0ff',
      '--ct-shadow': '0 0 0 1px rgba(124,240,255,.2),0 0 14px rgba(124,240,255,.35)', '--ct-shadow-press': '0 0 6px rgba(124,240,255,.55)', '--ct-press': 'scale(.96)',
      '--ct-btn-bg': 'color-mix(in srgb,#171a45 70%,var(--card))', '--ct-btn-fg': '#e6f7ff',
      '--ct-primary-bg': 'linear-gradient(135deg,#2bb7d6,#7b4dd6)', '--ct-primary-fg': '#ffffff',
      '--ct-dlg-bg': 'color-mix(in srgb,#171a45 85%,var(--card))', '--ct-dlg-edge': '#7cf0ff', '--ct-dlg-shadow': '0 0 24px rgba(124,240,255,.35),0 28px 70px rgba(0,0,0,.5)',
      '--ct-felt-a': '#1d2a6b', '--ct-felt-b': '#0c1238', '--ct-felt-line': '#7cf0ff', '--ct-felt-ink': '#e6f7ff',
      '--ct-chip-1': '#cfe3ff', '--ct-chip-2': '#7cf0ff', '--ct-chip-3': '#b88cff', '--ct-chip-4': '#ff7fd0', '--ct-chip-edge': '#0b0f2e', '--ct-chip-ink': '#0b0f2e', '--ct-chip-stripe': 'rgba(255,255,255,.85)',
      '--ct-cb-a': '#171a45', '--ct-cb-b': '#7cf0ff', '--ct-cb-c': '#b88cff',
    },
  },
  server: {
    id: 'server', item: 'theme:server', name: 'Серверная', cls: 'th-server', skin: 'sk-server', sound: 'server',
    font: stack('IBM Plex Mono', 'ui-monospace', 'Cascadia Mono', 'Consolas', 'DejaVu Sans Mono', 'monospace'),
    fontDisplay: stack('IBM Plex Mono', 'ui-monospace', 'Cascadia Mono', 'Consolas', 'DejaVu Sans Mono', 'monospace'),
    vars: {
      '--ct-acc': '#33ff99', '--ct-acc2': '#18b86b',
      '--ct-r-btn': px(2), '--ct-r-dlg': px(4), '--ct-r-frame': px(4),
      '--ct-bw': '1px', '--ct-edge': '#33ff99',
      '--ct-shadow': 'inset 0 0 0 1px rgba(51,255,153,.2)', '--ct-shadow-press': 'inset 0 0 0 1px rgba(51,255,153,.2)', '--ct-press': 'translateY(1px)',
      '--ct-press-bg': '#33ff99', '--ct-press-fg': '#021a0f',
      '--ct-btn-bg': 'color-mix(in srgb,#06140d 80%,var(--card))', '--ct-btn-fg': '#9bffcb',
      '--ct-primary-bg': '#13804b', '--ct-primary-fg': '#eafff3',
      '--ct-dlg-bg': 'color-mix(in srgb,#06140d 90%,var(--card))', '--ct-dlg-edge': '#33ff99', '--ct-dlg-shadow': '0 0 0 1px rgba(51,255,153,.25),0 28px 70px rgba(0,0,0,.6)',
      '--ct-felt-a': '#0b2b1c', '--ct-felt-b': '#04120b', '--ct-felt-line': '#33ff99', '--ct-felt-ink': '#b6ffd6',
      '--ct-chip-1': '#c8ffd8', '--ct-chip-2': '#33ff99', '--ct-chip-3': '#18b86b', '--ct-chip-4': '#0c5a39', '--ct-chip-edge': '#021a0f', '--ct-chip-ink': '#021a0f', '--ct-chip-stripe': '#33ff99',
      '--ct-cb-a': '#04120b', '--ct-cb-b': '#33ff99', '--ct-cb-c': '#0c5a39',
    },
  },
  velvet: {
    id: 'velvet', item: 'theme:velvet', name: 'Бархат', cls: 'th-velvet', skin: 'sk-velvet', sound: 'velvet',
    font: stack('Playfair Display', 'Georgia', 'Times New Roman', 'serif'), fontDisplay: stack('Playfair Display', 'Georgia', 'Times New Roman', 'serif'),
    vars: {
      '--ct-acc': '#e8c37a', '--ct-acc2': '#c4445a',
      '--ct-r-btn': px(12), '--ct-r-dlg': px(18), '--ct-r-frame': px(14),
      '--ct-bw': '1px', '--ct-edge': '#e8c37a',
      '--ct-shadow': '0 2px 0 rgba(232,195,122,.55),0 6px 14px rgba(0,0,0,.3)', '--ct-shadow-press': '0 0 0 rgba(0,0,0,0)', '--ct-press': 'translateY(1px) scale(.99)',
      '--ct-btn-bg': 'color-mix(in srgb,#7a1f33 22%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': 'linear-gradient(180deg,#a02a45,#5e1527)', '--ct-primary-fg': '#ffe9c4',
      '--ct-dlg-bg': 'color-mix(in srgb,#7a1f33 14%,var(--card))', '--ct-dlg-edge': '#e8c37a', '--ct-dlg-shadow': '0 0 0 3px rgba(122,31,51,.5),0 28px 70px rgba(0,0,0,.45)',
      '--ct-felt-a': '#7a1f33', '--ct-felt-b': '#3b0f1b', '--ct-felt-line': '#e8c37a', '--ct-felt-ink': '#ffe9c4',
      '--ct-chip-1': '#f5ead2', '--ct-chip-2': '#c4445a', '--ct-chip-3': '#7a1f33', '--ct-chip-4': '#1b1013', '--ct-chip-edge': '#e8c37a', '--ct-chip-ink': '#2b1d00', '--ct-chip-stripe': '#e8c37a',
      '--ct-cb-a': '#7a1f33', '--ct-cb-b': '#e8c37a', '--ct-cb-c': '#3b0f1b',
    },
  },
  arcade: {
    id: 'arcade', item: 'theme:arcade', name: 'Аркада', cls: 'th-arcade', skin: 'sk-arcade', sound: 'arcade',
    font: stack('Exo 2', ...SANS), fontDisplay: stack('Press Start 2P', 'Courier New', 'monospace'),
    vars: {
      '--ct-acc': '#ff3d9a', '--ct-acc2': '#31e0ff',
      '--ct-r-btn': '0px', '--ct-r-dlg': '0px', '--ct-r-frame': '0px',
      '--ct-bw': '3px', '--ct-edge': '#0a0a1a',
      '--ct-shadow': '4px 4px 0 #0a0a1a', '--ct-shadow-press': '1px 1px 0 #0a0a1a', '--ct-press': 'translate(3px,3px)',
      '--ct-btn-bg': 'color-mix(in srgb,#31e0ff 22%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': '#ff3d9a', '--ct-primary-fg': '#ffffff',
      '--ct-dlg-bg': 'color-mix(in srgb,#2a1470 30%,var(--card))', '--ct-dlg-edge': '#ff3d9a', '--ct-dlg-shadow': '8px 8px 0 #0a0a1a',
      '--ct-felt-a': '#2a1470', '--ct-felt-b': '#0e0630', '--ct-felt-line': '#ff3d9a', '--ct-felt-ink': '#ffffff',
      '--ct-chip-1': '#ffffff', '--ct-chip-2': '#ff3d9a', '--ct-chip-3': '#31e0ff', '--ct-chip-4': '#ffd84a', '--ct-chip-edge': '#0a0a1a', '--ct-chip-ink': '#0a0a1a', '--ct-chip-stripe': '#0a0a1a',
      '--ct-cb-a': '#2a1470', '--ct-cb-b': '#ff3d9a', '--ct-cb-c': '#31e0ff',
    },
  },
  vault: {
    id: 'vault', item: 'theme:vault', name: 'Хранилище', cls: 'th-vault', skin: 'sk-vault', sound: 'vault',
    font: stack('Oswald', 'Arial Narrow', ...SANS), fontDisplay: stack('Oswald', 'Arial Narrow', ...SANS),
    vars: {
      '--ct-acc': '#c9a24a', '--ct-acc2': '#e8e4da',
      '--ct-r-btn': px(6), '--ct-r-dlg': px(10), '--ct-r-frame': px(8),
      '--ct-bw': '2px', '--ct-edge': '#c9a24a',
      '--ct-shadow': '0 3px 0 #1d1a10,inset 0 1px 0 rgba(255,255,255,.3)', '--ct-shadow-press': '0 1px 0 #1d1a10,inset 0 1px 0 rgba(255,255,255,.2)', '--ct-press': 'translateY(2px)',
      '--ct-btn-bg': 'color-mix(in srgb,#5b616b 28%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': 'linear-gradient(180deg,#e3c36e,#a87f22)', '--ct-primary-fg': '#1d1a10',
      '--ct-dlg-bg': 'color-mix(in srgb,#5b616b 22%,var(--card))', '--ct-dlg-edge': '#c9a24a', '--ct-dlg-shadow': '0 0 0 3px rgba(29,26,16,.6),0 28px 70px rgba(0,0,0,.5)',
      '--ct-felt-a': '#4b5361', '--ct-felt-b': '#20252d', '--ct-felt-line': '#c9a24a', '--ct-felt-ink': '#f2e9cc',
      '--ct-chip-1': '#e8e4da', '--ct-chip-2': '#c9a24a', '--ct-chip-3': '#7f8794', '--ct-chip-4': '#2e3440', '--ct-chip-edge': '#fff3c4', '--ct-chip-ink': '#1d1a10', '--ct-chip-stripe': '#fff3c4',
      '--ct-cb-a': '#2e3440', '--ct-cb-b': '#c9a24a', '--ct-cb-c': '#e8e4da',
    },
  },
};

// Предметы шага 3 перекрывают умолчания темы: ключ — id предмета из S.equip
export const ITEM_STYLES = {
  'felt:burgundy': { '--ct-felt-a': '#7a1f33', '--ct-felt-b': '#3b0f1b', '--ct-felt-line': '#e8c37a', '--ct-felt-ink': '#ffe9c4' },
  'chips:berry': { '--ct-chip-1': '#ffd1e3', '--ct-chip-2': '#e8467c', '--ct-chip-3': '#a0124f', '--ct-chip-4': '#3d1230', '--ct-chip-edge': '#ffd1e3', '--ct-chip-ink': '#3d1230', '--ct-chip-stripe': '#ffd1e3' },
  'cardback:marked': { '--ct-cb-a': '#233466', '--ct-cb-b': '#4d87bf', '--ct-cb-c': '#ffe27a' },
};
const EQUIP_KINDS = ['felt', 'chips', 'cardback'];

/* ---------- выбор темы и стилей по состоянию ---------- */
export function themeIdOf(S) {
  const raw = String((S && S.theme) || 'forest').replace(/^theme:/, '');
  const id = THEMES[raw] ? raw : 'forest';
  if (id !== 'forest' && S && S.album && !S.album['theme:' + id]) return 'forest';
  return id;
}
export const themeOf = S => THEMES[themeIdOf(S)];
const owned = (S, id) => FREE_ITEMS.includes(id) || !S || !S.album || Boolean(S.album[id]);
export function equippedStyle(S, kind) {
  const id = S && S.equip && S.equip[kind];
  return id && ITEM_STYLES[id] && owned(S, id) ? id : '';
}
export function themeVars(S) {
  const theme = themeOf(S), vars = { ...theme.vars, '--ct-font': theme.font, '--ct-font-d': theme.fontDisplay }, picked = {};
  for (const kind of EQUIP_KINDS) { const id = equippedStyle(S, kind); picked[kind] = id ? id.split(':')[1] : ''; if (id) Object.assign(vars, ITEM_STYLES[id]); }
  return { id: theme.id, theme, vars, picked };
}
export const chipTier = v => (v < 10 ? 1 : v < 100 ? 2 : v < 1000 ? 3 : 4);
export function readStoredSlots() {
  try { return typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(SLOTS_KEY) || 'null'); } catch { return null; }
}
export const storedThemeId = () => themeIdOf(readStoredSlots());

/* ---------- SVG-фильтры символов (по темам) ---------- */
const F = 'color-interpolation-filters="sRGB"';
export const THEME_DEFS = {
  night: '<filter id="ct-neon" x="-12%" y="-12%" width="124%" height="124%" ' + F + '>'
    + '<feMorphology in="SourceAlpha" operator="erode" radius="1.6" result="er"/><feComposite in="SourceAlpha" in2="er" operator="out" result="edge"/>'
    + '<feFlood flood-color="#7cf0ff" result="c"/><feComposite in="c" in2="edge" operator="in" result="line"/>'
    + '<feGaussianBlur in="line" stdDeviation="2.4" result="glow"/>'
    + '<feComponentTransfer in="SourceGraphic" result="dim"><feFuncA type="linear" slope=".22"/></feComponentTransfer>'
    + '<feMerge><feMergeNode in="glow"/><feMergeNode in="glow"/><feMergeNode in="dim"/><feMergeNode in="line"/></feMerge></filter>',
  server: '<filter id="ct-phosphor" x="-6%" y="-6%" width="112%" height="112%" ' + F + '>'
    + '<feFlood x="1" y="1" width="2" height="2" flood-color="#000"/><feComposite width="4" height="4" result="px"/><feTile result="grid"/>'
    + '<feComposite in="SourceGraphic" in2="grid" operator="in" result="samp"/><feMorphology in="samp" operator="dilate" radius="1.5" result="blocks"/>'
    + '<feColorMatrix in="blocks" type="matrix" values="0 0 0 0 .08  .33 .59 .11 0 0  0 0 0 0 .1  0 0 0 1 0" result="green"/>'
    + '<feComponentTransfer in="green" result="post"><feFuncG type="discrete" tableValues=".16 .42 .72 1"/></feComponentTransfer>'
    + '<feGaussianBlur in="post" stdDeviation="1.5" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="post"/></feMerge></filter>',
  arcade: '<filter id="ct-arcade" x="-6%" y="-6%" width="112%" height="112%" ' + F + '>'
    + '<feComponentTransfer in="SourceGraphic" result="flat"><feFuncR type="discrete" tableValues="0 .25 .55 .8 1"/><feFuncG type="discrete" tableValues="0 .25 .55 .8 1"/><feFuncB type="discrete" tableValues="0 .25 .55 .8 1"/></feComponentTransfer>'
    + '<feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="fat"/><feFlood flood-color="#0a0a1a"/><feComposite in2="fat" operator="in" result="ink"/>'
    + '<feColorMatrix in="flat" type="saturate" values="1.5" result="vivid"/><feMerge><feMergeNode in="ink"/><feMergeNode in="vivid"/></feMerge></filter>',
  vault: '<filter id="ct-bevel" x="-8%" y="-8%" width="116%" height="116%" ' + F + '>'
    + '<feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b"/>'
    + '<feSpecularLighting in="b" surfaceScale="3" specularConstant=".75" specularExponent="18" lighting-color="#fff2c4" result="s"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>'
    + '<feComposite in="s" in2="SourceAlpha" operator="in" result="sp"/><feComposite in="SourceGraphic" in2="sp" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/></filter>',
};
export const themeDefsMarkup = () => '<svg id="ct-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + Object.values(THEME_DEFS).join('') + '</defs></svg>';
export function ensureThemeDefs() {
  if (typeof document === 'undefined' || document.getElementById('ct-defs') || !document.body) return;
  document.body.insertAdjacentHTML('afterbegin', themeDefsMarkup());
}

/* ---------- применение к странице ---------- */
export function applyCasinoTheme(root, S) {
  if (!root || !root.classList) return null;
  if (S === undefined) S = readStoredSlots();
  ensureThemeDefs();
  const { theme, vars, picked } = themeVars(S);
  for (const c of [...root.classList]) if (/^(th|sk)-/.test(c)) root.classList.remove(c);
  root.classList.add('casino-root', theme.cls);
  if (theme.skin) root.classList.add(theme.skin);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.ctTheme = theme.id;
  for (const kind of EQUIP_KINDS) root.dataset['ct' + kind[0].toUpperCase() + kind.slice(1)] = picked[kind] || 'default';
  return theme;
}
const PAGE_SELECTOR = '.slots-page,.cs-hub,.cs-game-page';
export function decorateCasinoPage(scope) {
  if (typeof document === 'undefined') return;
  const host = scope || document.querySelector('#content');
  if (!host) return;
  const S = readStoredSlots();
  host.querySelectorAll(PAGE_SELECTOR).forEach(root => applyCasinoTheme(root, S));
}
export function installCasinoThemes() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  ensureThemeDefs();
  // тема сменилась в другой вкладке — перекрашиваем открытую страницу
  window.addEventListener('storage', e => { if (e.key === SLOTS_KEY) decorateCasinoPage(); });
}

/* ---------- звук: наборы по темам ---------- */
const PENT = [0, 2, 4, 7, 9];
// partials: [отношение частоты, громкость, доля затухания, форма волны]; отношения ~1 : 2.76 : 5.4 — «колокольчик/монета»
const BELL3 = [[1, 1, 1, 'sine'], [2.76, 0.5, 0.55, 'sine'], [5.4, 0.28, 0.3, 'triangle']];
const SOUNDS = {
  forest: {
    bell: { partials: BELL3, decay: 0.45, vol: 0.12 },
    stop: { base: 523, scale: PENT, vol: 0.13, thunk: { f: 170, to: 62, v: 0.24, type: 'sine' } },
    coin: { base: 1318, scale: PENT, partials: [[1, 1, 1, 'sine'], [2.76, 0.45, 0.5, 'sine'], [5.4, 0.2, 0.3, 'sine']], decay: 0.28, vol: 0.085, step: 0.05, clatter: 0.02 },
    ratchet: { f: 1500, type: 'square', v: 0.028, gap: 46, slow: 14, noise: 0.02 },
    ui: { click: { f: 700, type: 'square', v: 0.05 }, nope: { f: 200, to: 150, type: 'square', v: 0.08 } },
    lead: 'triangle',
    table: { deal: { f: 900, to: 380, type: 'triangle', v: 0.12 }, chip: { base: 1760, decay: 0.16, vol: 0.09 }, ball: { f: 2100, type: 'triangle', v: 0.05 }, drop: { f: 260, to: 110, type: 'sine', v: 0.2 } },
  },
  night: {
    bell: { partials: [[1, 1, 1.3, 'sine'], [2.76, 0.55, 0.9, 'sine'], [5.4, 0.3, 0.5, 'sine'], [8.93, 0.12, 0.3, 'sine']], decay: 0.9, vol: 0.1 },
    stop: { base: 659, scale: [0, 3, 5, 7, 10], vol: 0.12, thunk: { f: 130, to: 52, v: 0.18, type: 'sine' } },
    coin: { base: 1568, scale: [0, 3, 5, 7, 10], partials: [[1, 1, 1, 'sine'], [2.76, 0.5, 0.7, 'sine'], [5.4, 0.2, 0.4, 'sine']], decay: 0.5, vol: 0.07, step: 0.055, clatter: 0 },
    ratchet: { f: 2300, type: 'sine', v: 0.03, gap: 52, slow: 16, noise: 0 },
    ui: { click: { f: 880, type: 'sine', v: 0.05 }, nope: { f: 220, to: 160, type: 'sine', v: 0.09 } },
    lead: 'sine',
    table: { deal: { f: 1100, to: 500, type: 'sine', v: 0.1 }, chip: { base: 1976, decay: 0.3, vol: 0.08 }, ball: { f: 2600, type: 'sine', v: 0.05 }, drop: { f: 300, to: 120, type: 'sine', v: 0.18 } },
  },
  server: {
    bell: { partials: [[1, 1, 1, 'square'], [2.76, 0.35, 0.5, 'square'], [5.4, 0.18, 0.3, 'square']], decay: 0.22, vol: 0.05 },
    stop: { base: 440, scale: PENT, vol: 0.06, thunk: { f: 110, to: 45, v: 0.12, type: 'sawtooth' } },
    coin: { base: 1760, scale: [0, 2, 4, 7, 9, 12], partials: [[1, 1, 1, 'square'], [2.76, 0.25, 0.4, 'square']], decay: 0.12, vol: 0.04, step: 0.035, clatter: 0.03 },
    ratchet: { f: 2800, type: 'square', v: 0.03, gap: 38, slow: 12, noise: 0.035 },
    ui: { click: { f: 1200, type: 'square', v: 0.045 }, nope: { f: 140, to: 100, type: 'sawtooth', v: 0.08 } },
    lead: 'square',
    table: { deal: { f: 1500, to: 600, type: 'square', v: 0.06 }, chip: { base: 2200, decay: 0.08, vol: 0.05 }, ball: { f: 3000, type: 'square', v: 0.035 }, drop: { f: 200, to: 80, type: 'sawtooth', v: 0.1 } },
  },
  velvet: {
    bell: { partials: [[1, 1, 1.2, 'sine'], [2.76, 0.4, 0.7, 'triangle'], [5.4, 0.16, 0.4, 'sine']], decay: 0.8, vol: 0.11 },
    stop: { base: 392, scale: [0, 2, 4, 5, 7], vol: 0.12, thunk: { f: 120, to: 55, v: 0.22, type: 'sine' } },
    coin: { base: 1047, scale: [0, 2, 4, 5, 7, 9, 11], partials: [[1, 1, 1, 'sine'], [2.76, 0.4, 0.6, 'triangle'], [5.4, 0.15, 0.3, 'sine']], decay: 0.4, vol: 0.08, step: 0.06, clatter: 0.01 },
    ratchet: { f: 1200, type: 'triangle', v: 0.03, gap: 55, slow: 18, noise: 0.01 },
    ui: { click: { f: 520, type: 'triangle', v: 0.06 }, nope: { f: 190, to: 140, type: 'triangle', v: 0.09 } },
    lead: 'triangle',
    table: { deal: { f: 700, to: 320, type: 'triangle', v: 0.12 }, chip: { base: 1568, decay: 0.22, vol: 0.09 }, ball: { f: 1800, type: 'triangle', v: 0.05 }, drop: { f: 240, to: 100, type: 'sine', v: 0.2 } },
  },
  arcade: {
    bell: { partials: [[1, 1, 0.7, 'square'], [2, 0.4, 0.4, 'square']], decay: 0.3, vol: 0.05 },
    stop: { base: 784, scale: [0, 4, 7, 12, 16], vol: 0.06, thunk: { f: 260, to: 110, v: 0.1, type: 'square' } },
    coin: { base: 1319, scale: [0, 4, 7, 12], partials: [[1, 1, 1, 'square'], [2.76, 0.2, 0.3, 'square']], decay: 0.09, vol: 0.045, step: 0.03, clatter: 0 },
    ratchet: { f: 1800, type: 'square', v: 0.03, gap: 34, slow: 10, noise: 0 },
    ui: { click: { f: 1046, type: 'square', v: 0.05 }, nope: { f: 220, to: 110, type: 'square', v: 0.08 } },
    lead: 'square',
    table: { deal: { f: 1200, to: 700, type: 'square', v: 0.07 }, chip: { base: 1568, decay: 0.07, vol: 0.05 }, ball: { f: 2400, type: 'square', v: 0.04 }, drop: { f: 330, to: 130, type: 'square', v: 0.09 } },
  },
  vault: {
    bell: { partials: [[1, 1, 1.5, 'sine'], [2.76, 0.6, 1, 'sine'], [5.4, 0.35, 0.6, 'triangle'], [8.93, 0.15, 0.35, 'sine']], decay: 1.1, vol: 0.1 },
    stop: { base: 330, scale: PENT, vol: 0.12, thunk: { f: 90, to: 38, v: 0.3, type: 'sine' } },
    coin: { base: 1175, scale: PENT, partials: [[1, 1, 1.2, 'sine'], [2.76, 0.6, 0.8, 'sine'], [5.4, 0.3, 0.5, 'triangle']], decay: 0.5, vol: 0.09, step: 0.052, clatter: 0.03 },
    ratchet: { f: 3200, type: 'triangle', v: 0.035, gap: 60, slow: 18, noise: 0.03 },
    ui: { click: { f: 400, type: 'triangle', v: 0.07 }, nope: { f: 150, to: 90, type: 'triangle', v: 0.1 } },
    lead: 'triangle',
    table: { deal: { f: 600, to: 260, type: 'triangle', v: 0.13 }, chip: { base: 1397, decay: 0.35, vol: 0.1 }, ball: { f: 1600, type: 'triangle', v: 0.06 }, drop: { f: 180, to: 70, type: 'sine', v: 0.26 } },
  },
};
export function makeThemeSounds(name) {
  const key = String(name || '').replace(/^theme:/, ''), id = SOUNDS[key] ? key : 'forest';
  return { id, ...JSON.parse(JSON.stringify(SOUNDS[id])) };
}
