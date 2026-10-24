/* casino:step5 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';

// Мини-«DOM»: проверяем, что страницы строятся без ошибок и после destroy не остаётся таймеров и слушателей.
const store = new Map(), cache = new Map(), listeners = [], intervals = new Set(), timeouts = new Set(), errors = [], noop = () => {};
const ctx2d = new Proxy({}, { get: () => noop, set: () => true });
function makeEl(tag) {
  const e = { tag, classList: { add: noop, remove: noop, toggle: noop, contains: () => false, [Symbol.iterator]: () => [].values() }, style: { setProperty: noop, removeProperty: noop }, dataset: {}, hidden: false, disabled: false, innerHTML: '', textContent: '', value: '', open: false, isConnected: true, tabIndex: 0,
    querySelector: sel => pick(sel), querySelectorAll: () => [], addEventListener(t, f, o) { listeners.push({ t, f, o }); }, removeEventListener: noop, append: noop, remove: noop, setAttribute: noop, focus: noop,
    getContext: () => ctx2d, closest: () => null, showModal() { this.open = true; }, close() { this.open = false; } };
  return e;
}
const pick = sel => { if (!cache.has(sel)) cache.set(sel, makeEl(sel)); return cache.get(sel); };
Object.assign(globalThis, {
  document: { createElement: makeEl, querySelector: pick, getElementById: id => pick('#' + id), body: makeEl('body'), addEventListener: noop, removeEventListener: noop },
  window: { addEventListener(t, f, o) { listeners.push({ t, f, o }); }, removeEventListener: noop },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  history: { replaceState: noop }, matchMedia: () => ({ matches: true }), requestAnimationFrame: noop, cancelAnimationFrame: noop, innerWidth: 800, innerHeight: 600,
  setInterval: f => { const id = intervals.size + 1000 + Math.random(); intervals.add(id); return id; }, clearInterval: id => intervals.delete(id),
  setTimeout: (f, ms) => { const id = Math.random(); timeouts.add(id); return id; }, clearTimeout: id => timeouts.delete(id),
});
process.on('unhandledRejection', e => errors.push(e));
const leaks = () => ({ intervals: intervals.size, timeouts: timeouts.size, signals: listeners.filter(l => l.o && l.o.signal && !l.o.signal.aborted).length });

function seed(extra = {}) {
  store.set('hh_save_v1', JSON.stringify({ berries: 500, owned: ['none'], hat: 'none', bonusSpins: 1, boosts: {}, daily: null }));
  const S = M.newSlotsState(); Object.assign(S, extra); store.set('m3102-slots-v1', JSON.stringify(S));
}

test('хаб: рисуется, показывает перерыв, destroy снимает таймеры и слушатели', async () => {
  seed({ breakUntil: Date.now() + 600000 });
  const { renderCasinoPage } = await import('../js/casino.js');
  renderCasinoPage(); assert.equal(typeof window.__hhDestroy, 'function');
  assert.match(pick('#content').innerHTML, /cs-game--slots[\s\S]*cs-game--blackjack[\s\S]*cs-game--roulette/);
  assert.equal(pick('#cs-break').hidden, false); assert.match(pick('#cs-break').textContent, /Перерыв до/);
  assert.equal(pick('#cs-bal').textContent.replace(/\s/g, ''), '500');
  window.__hhDestroy(); window.__hhDestroy();
  assert.deepEqual(leaks(), { intervals: 0, timeouts: 0, signals: 0 });
});

test('коллекция: все вкладки, destroy чистый; тот же состав панелей, что был в слотах', async () => {
  seed({ capsules: 2, free: 1 });
  const { renderCollectionPage, COLLECTION_TABS } = await import('../js/casino-collection.js');
  for (const tab of ['', 'album', 'daily', 'stats', 'bogus']) {
    renderCollectionPage(tab); const html = pick('#content').innerHTML;
    for (const id of ['sl-album', 'sl-daily', 'sl-wheel', 'sl-ach', 'sl-stats', 'sl-dlg']) assert.ok(html.includes(`id="${id}"`), id);
    for (const t of COLLECTION_TABS) assert.ok(html.includes(`id="co-tab-${t.id}"`));
    assert.match(pick('#sl-album').innerHTML, /Альбом и капсулы/); assert.match(pick('#sl-daily').innerHTML, /Ежедневные спины/);
    assert.match(pick('#sl-ach').innerHTML, /Достижения/); assert.match(pick('#sl-stats').innerHTML, /Статистика/);
    window.__hhDestroy();
    assert.deepEqual(leaks(), { intervals: 0, timeouts: 0, signals: 0 }, tab);
  }
  const S = JSON.parse(store.get('m3102-slots-v1')); assert.equal(M.checkSlots(S), 'ok');
});

test('заглушки блэкджека и рулетки: рендерятся, ведут назад в казино', async () => {
  const { renderBlackjackPage } = await import('../js/blackjack.js'), { renderRoulettePage } = await import('../js/roulette.js');
  for (const r of [renderBlackjackPage, renderRoulettePage]) { r(); assert.match(pick('#content').innerHTML, /href="#\/casino"/); window.__hhDestroy(); }
  assert.deepEqual(errors, []);
});
