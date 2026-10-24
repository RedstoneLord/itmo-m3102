/* casino:step8 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';
import * as R from '../js/roulette-math.js';

const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const store = new Map(), cache = new Map(), listeners = [], intervals = new Set(), timeouts = new Set(), noop = () => {};
const ctx2d = new Proxy({}, { get: () => noop, set: () => true });

function makeEl(tag, sel = '') {
  const classes = new Set();
  const e = {
    tag, sel, classes,
    id: sel.startsWith('#') ? sel.slice(1) : '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, v) => (v === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : v ? classes.add(c) : classes.delete(c)),
      contains: c => classes.has(c),
      [Symbol.iterator]: () => classes.values()
    },
    style: { setProperty: noop, removeProperty: noop },
    dataset: {},
    hidden: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    value: '',
    open: false,
    isConnected: true,
    tabIndex: 0,
    querySelector: s => pick(s),
    querySelectorAll: s => [pick(s)],
    addEventListener(t, f, o) { listeners.push({ target: this, t, f, o }); },
    removeEventListener: noop,
    append: noop,
    remove: noop,
    setAttribute(k, v) { if (k.startsWith('data-')) this.dataset[k.slice(5)] = v; },
    getAttribute(k) { return this.dataset[k.slice(5)] || null; },
    focus: noop,
    getContext: () => ctx2d,
    closest(s) {
      if (!s) return null;
      if (s.startsWith('#') && this.id === s.slice(1)) return this;
      if (s.startsWith('.') && this.classes.has(s.slice(1))) return this;
      if (s === 'button') return this.tag === 'button' || this.id.includes('btn') || this.id.includes('spin') || this.id.includes('clear') || this.id.includes('rebet') || this.id.includes('rules') || this.id.includes('break') || this.id.includes('sound') ? this : null;
      if (s.includes('data-cell') && this.dataset.cell) return this;
      if (s.includes('data-chip-val') && this.dataset.chipVal) return this;
      if (s.includes('data-close-dialog') && this.dataset.closeDialog !== undefined) return this;
      return null;
    },
    showModal() { this.open = true; },
    close() { this.open = false; },
    click() {
      const ev = { target: this, closest: s => this.closest(s), preventDefault: noop };
      for (const l of listeners) {
        if (l.t === 'click' && (!l.o?.signal || !l.o.signal.aborted)) {
          l.f(ev);
        }
      }
    }
  };
  return e;
}

const pick = sel => {
  if (!cache.has(sel)) {
    const tag = sel.startsWith('#') ? 'div' : sel.startsWith('.') ? 'span' : sel;
    const el = makeEl(tag, sel);
    if (sel.startsWith('button') || sel.includes('btn') || sel.includes('spin') || sel.includes('clear') || sel.includes('rebet') || sel.includes('cell')) el.tag = 'button';
    cache.set(sel, el);
  }
  return cache.get(sel);
};

Object.assign(globalThis, {
  document: { createElement: makeEl, querySelector: pick, getElementById: id => pick('#' + id), body: Object.assign(makeEl('body'), { insertAdjacentHTML: noop }), addEventListener: noop, removeEventListener: noop },
  window: { addEventListener(t, f, o) { listeners.push({ target: this, t, f, o }); }, removeEventListener: noop },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  history: { replaceState: noop }, matchMedia: () => ({ matches: true }), requestAnimationFrame: noop, cancelAnimationFrame: noop, innerWidth: 800, innerHeight: 600,
  setInterval: f => { const id = intervals.size + 1000 + Math.random(); intervals.add(id); return id; }, clearInterval: id => intervals.delete(id),
  setTimeout: (f, ms) => { const id = realSetTimeout(() => { timeouts.delete(id); f(); }, Math.min(ms, 10)); timeouts.add(id); return id; }, clearTimeout: id => { timeouts.delete(id); realClearTimeout(id); },
});

function seed(extra = {}) {
  store.set('hh_save_v1', JSON.stringify({ berries: 1000, owned: ['none'], hat: 'none', bonusSpins: 0, boosts: {} }));
  const S = M.newSlotsState(); Object.assign(S, extra); delete S.sig; S.sig = M.signSlots(S); store.set('m3102-slots-v1', JSON.stringify(S));
}

test('рулетка UI: рендеринг стола, колеса, HUD, истории и правил', async () => {
  seed();
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();
  assert.equal(typeof window.__hhDestroy, 'function');

  const html = pick('#content').innerHTML;
  assert.ok(html.includes('href="#/casino"'), 'ссылка на хаб');
  assert.ok(html.includes('id="ro-table"'), 'стол рулетки');
  assert.ok(html.includes('id="ro-wheelsvg"'), 'SVG колесо');
  assert.ok(html.includes('id="ro-hist-list"'), 'история чисел');
  assert.ok(html.includes('id="ro-total-stake"'), 'счётчик ставок');
  assert.ok(html.includes('id="ro-spin"'), 'кнопка спина');
  assert.ok(html.includes('id="ro-clear"'), 'кнопка очистить');
  assert.ok(html.includes('id="ro-rebet"'), 'кнопка повторить ставки');

  window.__hhDestroy();
});

test('рулетка: ставки, очистить, повторить', async () => {
  seed();
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const cell = makeEl('button');
  cell.dataset.cell = 'straight';
  cell.dataset.arg = 17;
  cell.click();

  assert.match(pick('#ro-total-stake').textContent, /5 🍓/, 'первая ставка 5');

  cell.click();
  assert.match(pick('#ro-total-stake').textContent, /10 🍓/, 'шаг ставки на 10');

  pick('#ro-clear').click();
  assert.match(pick('#ro-total-stake').textContent, /0 🍓/, 'ставки очищены');

  pick('#ro-rebet').click();
  assert.match(pick('#ro-total-stake').textContent, /10 🍓/, 'ставки восстановлены');

  window.__hhDestroy();
});

test('рулетка: спин колеса, выплата, сохранение состояния и сводка', async () => {
  seed({ stats: { spins: 0, wagered: 0, won: 0, biggest: 0, fs: 0, picks: 0, jackpots: 0, gambles: 0, gambleWins: 0, poked: 0, capsuleSyms: 0, rouletteSpins: 0, rouletteWagered: 0, rouletteWon: 0, rouletteWins: 0 } });
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const cellRed = makeEl('button');
  cellRed.dataset.cell = 'redblack';
  cellRed.dataset.arg = 'red';
  cellRed.click();

  const spinBtn = pick('#ro-spin');
  spinBtn.click();
  await new Promise(r => setTimeout(r, 200));

  let savedS = JSON.parse(store.get('m3102-slots-v1'));
  let savedH = JSON.parse(store.get('hh_save_v1'));
  assert.equal(savedS.stats.rouletteSpins, 1, 'rouletteSpins увеличен');
  assert.equal(savedS.stats.rouletteWagered, 5, 'rouletteWagered увеличен');
  assert.equal(M.checkSlots(savedS), 'ok', 'подпись слотов верна');
  assert.equal(M.checkShared(savedH), 'ok', 'подпись shared верна');

  assert.equal(pick('#ro-summary').hidden, false, 'сводка отображается');
  assert.ok(savedS.rouletteHist.length >= 1, 'число добавлено в историю');

  window.__hhDestroy();
});

test('рулетка: глобальный перерыв блокирует спин', async () => {
  seed({ breakUntil: Date.now() + 600000 });
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const cell = makeEl('button');
  cell.dataset.cell = 'straight';
  cell.dataset.arg = 10;
  cell.click();

  assert.equal(pick('#ro-spin').disabled, true, 'спин отключен во время перерыва');

  window.__hhDestroy();
});

test('рулетка: талисман «Подкова» и отображение перков', async () => {
  seed({
    equip: { perkcharm: 'perkcharm:horseshoe', felt: 'felt:burgundy', chips: 'chips:berry', emote: 'emote:fyr' },
    album: { 'perkcharm:horseshoe': 1, 'felt:burgundy': 1, 'chips:berry': 1, 'emote:fyr': 1 }
  });
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const perksHtml = pick('#ro-perks-bar').innerHTML;
  assert.ok(perksHtml.includes('Подкова'), 'бейдж подковы');
  assert.ok(perksHtml.includes('Бордовое сукно'), 'сукно');
  assert.ok(perksHtml.includes('Ягодные фишки'), 'фишки');

  window.__hhDestroy();
});
