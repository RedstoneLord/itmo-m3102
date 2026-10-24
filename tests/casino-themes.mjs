/* casino:step6 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../js/casino-themes.js';
import * as C from '../js/casino-common.js';

// Шаг 6 казино: реестр тем, переменные, фильтры, наборы звука, переписанный slots-audio.js (с фальшивым AudioContext).
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const REQUIRED = ['--ct-r-btn', '--ct-r-dlg', '--ct-r-frame', '--ct-bw', '--ct-edge', '--ct-shadow', '--ct-shadow-press', '--ct-press', '--ct-btn-bg', '--ct-btn-fg', '--ct-primary-bg', '--ct-primary-fg',
  '--ct-dlg-bg', '--ct-dlg-edge', '--ct-dlg-shadow', '--ct-felt-a', '--ct-felt-b', '--ct-felt-line', '--ct-felt-ink', '--ct-chip-1', '--ct-chip-2', '--ct-chip-3', '--ct-chip-4', '--ct-chip-edge', '--ct-chip-ink', '--ct-chip-stripe', '--ct-cb-a', '--ct-cb-b', '--ct-cb-c'];

test('реестр: шесть тем, классы совпадают с THEME_CLASS, полный набор переменных', () => {
  assert.deepEqual(T.THEME_IDS, ['forest', 'night', 'server', 'velvet', 'arcade', 'vault']);
  for (const id of T.THEME_IDS) {
    const t = T.THEMES[id];
    assert.equal(t.id, id); assert.equal(t.cls, 'th-' + id); assert.equal(C.THEME_CLASS['theme:' + id], t.cls, id);
    for (const k of REQUIRED) assert.ok(t.vars[k], id + ' ' + k);
    assert.match(t.font, /(sans-serif|serif|monospace)$/); assert.match(t.fontDisplay, /(sans-serif|serif|monospace)$/);
  }
});

test('themeIdOf: префикс theme:, неизвестная и не купленная тема → forest', () => {
  assert.equal(T.themeIdOf({ theme: 'theme:night', album: { 'theme:night': 1 } }), 'night');
  assert.equal(T.themeIdOf({ theme: 'night' }), 'night');
  assert.equal(T.themeIdOf({ theme: 'theme:night', album: {} }), 'forest');
  assert.equal(T.themeIdOf({ theme: 'theme:nope' }), 'forest');
  assert.equal(T.themeIdOf(null), 'forest');
});

test('предметы шага 3 перекрывают умолчания темы, только если имеются', () => {
  const base = T.themeVars({ theme: 'forest' });
  assert.equal(base.vars['--ct-felt-a'], T.THEMES.forest.vars['--ct-felt-a']);
  const eq = T.themeVars({ theme: 'forest', equip: { felt: 'felt:burgundy', chips: 'chips:berry', cardback: 'cardback:marked' }, album: { 'cardback:marked': 1 } });
  assert.equal(eq.vars['--ct-felt-a'], T.ITEM_STYLES['felt:burgundy']['--ct-felt-a']);
  assert.equal(eq.vars['--ct-chip-2'], T.ITEM_STYLES['chips:berry']['--ct-chip-2']);
  assert.equal(eq.picked.cardback, 'marked');
  const no = T.themeVars({ theme: 'forest', equip: { cardback: 'cardback:marked' }, album: {} });
  assert.equal(no.picked.cardback, '');
  assert.equal(T.chipTier(5), 1); assert.equal(T.chipTier(50), 2); assert.equal(T.chipTier(500), 3); assert.equal(T.chipTier(5000), 4);
});

test('CSS: у каждой темы есть правила, все фильтры url(#ct-…) определены в SVG-defs', () => {
  const css = read('css/casino-themes.css'), defs = T.themeDefsMarkup();
  for (const id of T.THEME_IDS) assert.ok(css.includes('.casino-root.th-' + id + ' '), id);
  for (const m of css.matchAll(/url\(#(ct-[\w-]+)\)/g)) assert.ok(defs.includes('id="' + m[1] + '"'), m[1]);
  for (const cls of ['.ct-felt', '.ct-chip', '.ct-cardback']) assert.ok(css.includes(cls), cls);
  assert.ok(css.includes('prefers-reduced-motion'));
});

test('index.html: шрифты, импорт, установка и перекраска после перехода', () => {
  const h = read('index.html');
  assert.ok(h.includes('family=Comfortaa') && h.includes('Press+Start+2P') && h.includes('IBM+Plex+Mono'));
  assert.ok(h.includes("from './js/casino-themes.js'") && h.includes('installCasinoThemes();') && h.includes('decorateCasinoPage();'));
});

test('звуковые наборы: у каждой темы есть все роли, неизвестное имя → forest', () => {
  for (const id of T.THEME_IDS) {
    const s = T.makeThemeSounds(id);
    assert.equal(s.id, id);
    for (const k of ['bell', 'stop', 'coin', 'ratchet', 'ui', 'lead', 'table']) assert.ok(s[k], id + ' ' + k);
    assert.ok(s.bell.partials.length >= 2 && s.bell.partials.every(p => p.length === 4));
    assert.ok(s.coin.scale.length >= 4 && s.stop.scale.length >= 5);
  }
  assert.equal(T.makeThemeSounds('???').id, 'forest');
  assert.equal(T.makeThemeSounds('theme:vault').id, 'vault');
});

async function withFakeAudio(fn) {
  const rec = { osc: 0, src: 0, closed: false };
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  class Node { constructor() { this.gain = param(); this.frequency = param(); this.Q = param(); } connect() { return this; } disconnect() {} start() {} stop() {} }
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); }
    createOscillator() { rec.osc++; return new Node(); } createGain() { return new Node(); } createBiquadFilter() { return new Node(); }
    createBufferSource() { rec.src++; return new Node(); } createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    resume() {} close() { rec.closed = true; }
  }
  const store = { hh_save_v1: JSON.stringify({ sfx: true }) };
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.AudioContext = Ctx; Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  try { return await fn(rec, store); }
  finally { delete globalThis.AudioContext; if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; }
}

test('slots-audio: API прежний, тема переключается, остановка барабана звенит, победы растут с уровнем', async () => {
  const { makeSlotsAudio } = await import('../js/slots-audio.js');
  await withFakeAudio(rec => {
    const a = makeSlotsAudio('vault');
    for (const m of ['set', 'click', 'nope', 'lever', 'whirStart', 'whirStop', 'thunk', 'wild', 'scatter', 'heartbeat', 'tick', 'win', 'berry', 'feature', 'segfault', 'shake', 'crack', 'wheelTick', 'flip', 'gambleLose', 'heat', 'fanfare', 'stopFanfare', 'stopAll', 'destroy', 'later', 'theme', 'deal', 'chip', 'ballTick', 'ballDrop']) assert.equal(typeof a[m], 'function', m);
    assert.equal(a.on, true); assert.equal(a.themeName, 'vault');
    assert.equal(a.theme('night').themeName, 'night');
    let n = rec.osc; a.thunk(0); assert.ok(rec.osc - n >= 4, 'тон + колокольчик из партиалов');
    n = rec.osc; a.win('small'); const small = rec.osc - n;
    n = rec.osc; a.win('epic'); const epic = rec.osc - n;
    assert.ok(epic > small * 2, 'эпик звенит заметно дольше');
    a.destroy();
  });
});

test('slots-audio: трещотка идёт во время вращения, замедляется и полностью глохнет после destroy()', async () => {
  const { makeSlotsAudio } = await import('../js/slots-audio.js');
  await withFakeAudio(async rec => {
    const a = makeSlotsAudio('server');
    a.whirStart(); await new Promise(r => setTimeout(r, 160)); assert.ok(rec.osc >= 3, 'щелчки идут');
    a.whirStop(); let n = rec.osc; await new Promise(r => setTimeout(r, 120)); assert.equal(rec.osc, n, 'после whirStop тишина');
    a.whirStart(); a.fanfare(); a.destroy(); n = rec.osc; await new Promise(r => setTimeout(r, 250)); assert.equal(rec.osc, n, 'destroy гасит трещотку и фанфару'); assert.equal(rec.closed, true);
    a.whirStart(); await new Promise(r => setTimeout(r, 80)); assert.equal(rec.osc, n, 'после destroy ничего не стартует');
  });
});

test('slots-audio: без флага sfx — тишина; в источнике нет пилообразного гула', async () => {
  const { makeSlotsAudio } = await import('../js/slots-audio.js');
  await withFakeAudio(async (rec, store) => {
    store.hh_save_v1 = JSON.stringify({ sfx: false });
    const a = makeSlotsAudio('forest'); a.thunk(2); a.win('big'); a.whirStart(); await new Promise(r => setTimeout(r, 80)); a.destroy(); assert.equal(rec.osc, 0);
  });
  assert.ok(!read('js/slots-audio.js').includes('frequency.value = 70'));
});
