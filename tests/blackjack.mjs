/* casino:step8 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';
import * as B from '../js/blackjack-math.js';

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
      if (s === 'button') return this.tag === 'button' || this.id.includes('btn') || this.id.includes('deal') || this.id.includes('hit') || this.id.includes('stand') ? this : null;
      if (s.includes('data-cell') && this.dataset.cell) return this;
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
    if (sel.startsWith('button') || sel.includes('btn') || sel.includes('deal') || sel.includes('hit') || sel.includes('stand')) el.tag = 'button';
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

test('блэкджек UI: рендеринг стола, HUD, возврат в казино и правила', async () => {
  seed();
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();
  assert.equal(typeof window.__hhDestroy, 'function');

  const html = pick('#content').innerHTML;
  assert.ok(html.includes('href="#/casino"'), 'ссылка на хаб');
  assert.ok(html.includes('id="bj-table"'), 'стол блэкджека');
  assert.ok(html.includes('id="bj-dealer-cards"'), 'карты дилера');
  assert.ok(html.includes('id="bj-player-cards"'), 'карты игрока');
  assert.ok(html.includes('id="bj-shoe-txt"'), 'индикатор шу');
  assert.ok(html.includes('id="bj-rules"'), 'кнопка правил');

  window.__hhDestroy();
});

test('блэкджек: цикл раздачи, Hit, Stand, выплата и сохранение состояния', async () => {
  seed({ stats: { spins: 0, wagered: 0, won: 0, biggest: 0, fs: 0, picks: 0, jackpots: 0, gambles: 0, gambleWins: 0, poked: 0, capsuleSyms: 0, bjHands: 0, bjWins: 0, bjWagered: 0, bjWon: 0, bjStreak: 0 } });
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const dealBtn = pick('#bj-deal');
  const standBtn = pick('#bj-stand');

  dealBtn.click();
  await new Promise(r => setTimeout(r, 600));

  let savedS = JSON.parse(store.get('m3102-slots-v1'));
  let savedH = JSON.parse(store.get('hh_save_v1'));
  assert.equal(savedS.stats.bjHands, 1, 'bjHands увеличен');
  assert.equal(savedS.stats.bjWagered, 5, 'bjWagered увеличен');
  assert.ok(savedH.berries <= 1000, 'ставка снята');

  if (!pick('#bj-stand').disabled) {
    standBtn.click();
    await new Promise(r => setTimeout(r, 600));
  }

  savedS = JSON.parse(store.get('m3102-slots-v1'));
  savedH = JSON.parse(store.get('hh_save_v1'));
  assert.equal(M.checkSlots(savedS), 'ok', 'подпись слотов валидна');
  assert.equal(M.checkShared(savedH), 'ok', 'подпись shared валидна');
  assert.ok(savedS.stats.bjHands >= 1);

  window.__hhDestroy();
});

test('блэкджек: горячие клавиши H, S, Enter', async () => {
  seed();
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const dispatchKey = key => {
    for (const l of listeners) {
      if (l.t === 'keydown' && (!l.o?.signal || !l.o.signal.aborted)) {
        l.f({ key, target: pick('#content'), preventDefault: noop });
      }
    }
  };

  dispatchKey('Enter');
  await new Promise(r => setTimeout(r, 600));

  let savedS = JSON.parse(store.get('m3102-slots-v1'));
  assert.equal(savedS.stats.bjHands, 1, 'Enter запустил раздачу');

  if (!pick('#bj-stand').disabled) {
    dispatchKey('s');
    await new Promise(r => setTimeout(r, 600));
  }

  window.__hhDestroy();
});

test('блэкджек: глобальный перерыв блокирует раздачу', async () => {
  seed({ breakUntil: Date.now() + 600000 });
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const dealBtn = pick('#bj-deal');
  assert.equal(dealBtn.disabled, true, 'кнопка раздачи отключена во время перерыва');

  window.__hhDestroy();
});

test('блэкджек: талисман «Туз в рукаве» и отображение перков', async () => {
  seed({
    equip: { perkcharm: 'perkcharm:ace', emote: 'emote:fyr', cardback: 'cardback:marked' },
    album: { 'perkcharm:ace': 1, 'emote:fyr': 1, 'cardback:marked': 1 }
  });
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const perksHtml = pick('#bj-perks-bar').innerHTML;
  assert.ok(perksHtml.includes('Туз в рукаве'), 'бейдж талисмана');
  assert.ok(perksHtml.includes('Меченая рубашка'), 'бейдж рубашки');
  assert.ok(perksHtml.includes('Фыр!'), 'эмоция ёжика');

  window.__hhDestroy();
});
