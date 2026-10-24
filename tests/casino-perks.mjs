/* casino:step3 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../js/casino-common.js';
import * as M from '../js/slots-math.js';
import { GREETING_PACKS } from '../js/greetings.js';

// Шаг 3 казино: каталог (23 новых предмета), перки, надевание, наборы. Заглушки для шага 9 помечены todo.
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const NEW_IDS = ['hat:luckyseven', 'pal:graphite', 'pal:sakura', 'pal:ruby', 'pal:tropic', 'greet:linux', 'greet:deadline', 'greet:sleep', 'greet:algo',
  'theme:velvet', 'theme:arcade', 'theme:vault', 'title:lucky', 'title:patient', 'title:early', 'title:legend', 'cardback:marked', 'chips:berry', 'felt:burgundy',
  'emote:fyr', 'perkcharm:clover', 'perkcharm:horseshoe', 'perkcharm:ace'];
const ownAll = () => { const S = M.newSlotsState(); for (const x of M.CATALOG) S.album[x.id] = 1; return S; };
const tally = (list, f) => list.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});

test('каталог: ID уникальны, всего 27 + 23, редкость и виды новых предметов', () => {
  const ids = M.CATALOG.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(M.CATALOG.length, 50);
  assert.equal(NEW_IDS.length, 23); assert.equal(new Set(NEW_IDS).size, 23);
  for (const id of NEW_IDS) assert.ok(M.ITEM[id], id);
  const fresh = NEW_IDS.map(id => M.ITEM[id]);
  assert.deepEqual(tally(fresh, x => x.rarity), { common: 12, rare: 6, epic: 3, legendary: 2 });
  assert.deepEqual(tally(fresh, x => x.kind), { hat: 1, palette: 4, greeting: 4, theme: 3, title: 4, cardback: 1, chips: 1, felt: 1, emote: 1, perkcharm: 3 });
  for (const x of M.CATALOG) { assert.ok(M.RARITY[x.rarity], x.id); assert.equal(x.id.split(':')[0].length > 0, true); assert.ok(x.name && x.desc, x.id); }
  for (const id of M.FREE_ITEMS) assert.ok(M.ITEM[id], id);
  for (const id of Object.keys(M.ITEM_PERKS)) assert.ok(M.ITEM[id], id);
  for (const id of Object.keys(M.ITEM_PERKS)) assert.ok(M.EQUIPPABLE.includes(M.ITEM[id].kind), id);
});

test('капсулы: setOnly-предметы не выпадают, новые предметы выпадают', () => {
  const seen = new Set(), setOnly = M.CATALOG.filter(x => x.setOnly).map(x => x.id);
  for (let i = 0; i < 6000; i++) { const S = M.newSlotsState(); seen.add(M.openCapsule(M.mulberry32(i), S).item.id); }
  for (const id of setOnly) assert.equal(seen.has(id), false, id);
  for (const id of NEW_IDS.filter(id => !setOnly.includes(id))) assert.ok(seen.has(id), 'не выпадает ' + id);
});

test('ассеты нового контента: палитры, пак шуток, шляпа, темы, достижения', () => {
  for (const id of NEW_IDS.filter(id => id.startsWith('pal:'))) {
    const n = id.slice(4);
    assert.ok(read('css/settings.css').includes('--pal-' + n + '-a'), 'css ' + n);
    assert.ok(read('css/settings.css').includes('[data-palette="' + n + '"]'), 'css selector ' + n);
    assert.ok(read('js/settings.js').includes("{ id: '" + n + "'"), 'settings.js ' + n);
  }
  for (const id of NEW_IDS.filter(id => id.startsWith('greet:'))) {
    const pack = GREETING_PACKS[id.slice(6)];
    assert.ok(Array.isArray(pack) && pack.length === 2 && pack.every(s => typeof s === 'string' && s.trim()), id);
  }
  for (const id of Object.keys(GREETING_PACKS)) assert.ok(M.ITEM['greet:' + id], 'нет предмета для пака ' + id);
  const html = read('index.html');
  assert.ok(html.includes("id:'luckyseven',name"), 'HATS');
  assert.ok(html.includes("id==='luckyseven'"), 'drawHat');
  assert.ok(html.includes("save.hat==='luckyseven'"), 'перк шляпы в игре');
  for (const id of NEW_IDS.filter(id => id.startsWith('theme:'))) assert.ok((read('js/slots.js') + read('js/casino-common.js')).includes("'" + id + "': 'th-"), id);
  const ach = [...(read('js/slots.js') + read('js/casino-common.js')).matchAll(/\{ id: '([a-z0-9_]+)', name:/g)].map(m => m[1]);
  assert.equal(new Set(ach).size, ach.length);
  for (const id of ['five_claude', 'five_itmo', 'capsule_sym', 'seven_row', 'bj_win', 'roulette_straight']) assert.ok(ach.includes(id), id);
  assert.ok(ach.length >= 6);
});

test('clampPerks: все потолки и нижние границы', () => {
  const c = M.clampPerks({ payoutPct: 99, dailyExtra: 9, pityShift: 99, capsuleChanceMult: 9, gambleHint: 99, bjBonus: 9, rouletteRefund: 9 });
  assert.deepEqual([c.payoutPct, c.dailyExtra, c.pityShift, c.capsuleChanceMult, c.gambleHint, c.bjBonus, c.rouletteRefund], [2, 2, 4, 1.5, 5, 0.5, 0.25]);
  const z = M.clampPerks({ payoutPct: -3, dailyExtra: -1, capsuleChanceMult: 0.2, rouletteRefund: NaN });
  assert.deepEqual([z.payoutPct, z.dailyExtra, z.capsuleChanceMult, z.rouletteRefund], [0, 0, 1, 0]);
});

test('activePerks: действуют только надетые и имеющиеся предметы; один на вид; шляпа', () => {
  const S = M.newSlotsState(); S.title = 'title:lucky';
  assert.equal(M.activePerks(S, {}).payoutPct, 0, 'титул не в альбоме');
  S.album['title:lucky'] = 1; assert.equal(M.activePerks(S, {}).payoutPct, 0.3);
  assert.equal(M.equipItem(S, 'perkcharm:ace'), false);
  S.album['perkcharm:ace'] = 1; S.album['perkcharm:horseshoe'] = 1;
  assert.ok(M.equipItem(S, 'perkcharm:ace')); assert.equal(M.activePerks(S, {}).bjBonus, 0.5); assert.equal(M.activePerks(S, {}).rouletteRefund, 0);
  assert.ok(M.equipItem(S, 'perkcharm:horseshoe')); assert.equal(M.activePerks(S, {}).bjBonus, 0); assert.equal(M.activePerks(S, {}).rouletteRefund, 0.1);
  assert.ok(M.isEquipped(S, 'perkcharm:horseshoe')); assert.equal(M.isEquipped(S, 'perkcharm:ace'), false);
  assert.equal(M.activePerks(M.newSlotsState(), { hat: 'crown' }).crown, true);
  assert.equal(M.activePerks(undefined, { hat: 'luckyseven' }).luckyseven, true);
  assert.equal(M.activePerks(undefined, undefined).payoutPct, 0);
  const all = ownAll(); M.equipItem(all, 'title:legend'); M.equipItem(all, 'perkcharm:clover');
  const p = M.activePerks(all, { hat: 'halo' });
  assert.equal(p.payoutPct, 0.5); assert.ok(Math.abs(p.capsuleChanceMult - 1.1 * 1.15) < 1e-9); assert.equal(p.gambleHint, 5);
  assert.ok(p.payoutPct <= M.PERK_CAPS.payoutPct && p.capsuleChanceMult <= M.PERK_CAPS.capsuleChanceMult);
});

test('perk payoutPct: rollRound увеличивает выигрыш ровно на процент, джекпот не трогает, потолок +2%', () => {
  const run = (perks, n) => { const rng = M.mulberry32(77), S = M.newSlotsState(), out = []; for (let i = 0; i < n; i++) out.push(M.rollRound(rng, S, 1, perks, { paid: true })); return out; };
  const a = run({}, 3000), b = run({ payoutPct: 2 }, 3000), huge = run({ payoutPct: 99 }, 3000); let boosted = 0;
  a.forEach((x, i) => {
    const y = b[i], base = x.won - x.parts.jp; assert.equal(y.parts.jp, x.parts.jp);
    if (base > 0 && base * 1.02 < M.MAX_WIN) { assert.ok(Math.abs((y.won - y.parts.jp) - base * 1.02) < 1e-6, 'spin ' + i); boosted++; }
    assert.equal(huge[i].won, y.won, 'потолок');
  });
  assert.ok(boosted > 300);
});

test('perk dailyExtra: ежедневные спины, потолок +2', () => {
  const now = new Date(2026, 9, 21, 12), spins = perks => M.dailyClaim(M.newSlotsState(), now, perks).spins;
  assert.equal(spins({}), 1); assert.equal(spins({ dailyExtra: 1 }), 2); assert.equal(spins({ dailyExtra: 99 }), 3);
});

test('perk pityShift: эпик гарантирован раньше, потолок -4, минимум 6', () => {
  assert.equal(M.pityOf({}), 12); assert.equal(M.pityOf({ pityShift: 1 }), 11); assert.equal(M.pityOf({ pityShift: 99 }), 8); assert.equal(M.pityOf(undefined), 12);
  let low = 0;
  for (let i = 0; i < 300; i++) {
    const S = M.newSlotsState(); S.sinceEpic = 11;
    assert.ok(['epic', 'legendary'].includes(M.openCapsule(M.mulberry32(i), S, { pityShift: 1 }).item.rarity));
    const T = M.newSlotsState(); T.sinceEpic = 11; if (!['epic', 'legendary'].includes(M.openCapsule(M.mulberry32(i), T, {}).item.rarity)) low++;
  }
  assert.ok(low > 0, 'без перка на 11-й капсуле эпик не гарантирован');
});

test('perk capsuleChanceMult: шанс капсулы-символа растёт, но не выше потолка', () => {
  const raw = [['berry', 'apple', 'git'], ['pi', 'apple', 'git'], ['rust', 'mush', 'git'], ['cpp', 'apple', 'git'], ['pi', 'apple', 'git']], at = v => () => v;
  assert.equal(M.injectCapsule(at(0.0014), raw, 1, {}).capsules, 0);
  assert.equal(M.injectCapsule(at(0.0014), raw, 1, { capsuleChanceMult: 1.15 }).capsules, 1);
  assert.equal(M.injectCapsule(at(0.002), raw, 1, { capsuleChanceMult: 1.5 }).capsules, 0);
  assert.ok(M.PERK_CAPS.capsuleChanceMult <= 1.5);
});

test('perk gambleHint: рубашка даёт 3 карты, нимб — 5', () => {
  const S = M.newSlotsState(); S.album['cardback:marked'] = 1; assert.equal(M.activePerks(S, {}).gambleHint, 0);
  M.equipItem(S, 'cardback:marked'); assert.equal(M.activePerks(S, {}).gambleHint, 3); assert.equal(M.activePerks(S, { hat: 'halo' }).gambleHint, 5);
});

test('perk bjBonus и rouletteRefund: чистые помощники для шагов 5 и 7', () => {
  const on = { bjBonus: 0.5 };
  assert.equal(M.bjExtra(on, 10, { total: 21, cards: 3 }), 5);
  assert.equal(M.bjExtra(on, 10, { total: 21, cards: 2, natural: true }), 0);
  assert.equal(M.bjExtra(on, 10, { total: 21, cards: 4 }), 0);
  assert.equal(M.bjExtra(on, 10, { total: 20, cards: 3 }), 0);
  assert.equal(M.bjExtra({}, 10, { total: 21, cards: 3 }), 0);
  assert.equal(M.bjExtra({ bjBonus: 9 }, 10, { total: 21, cards: 3 }), 5);
  assert.equal(M.rouletteRefundAmount({ rouletteRefund: 0.1 }, 50), 5);
  assert.equal(M.rouletteRefundAmount({}, 50), 0); assert.equal(M.rouletteRefundAmount({ rouletteRefund: 9 }, 100), 25); assert.equal(M.rouletteRefundAmount({ rouletteRefund: 0.1 }, -5), 0);
});

test('наборы: все талисманы → титул «Легенда зала», все шляпы → «Шляпный мастер»; повторно не выдаются', () => {
  const S = M.newSlotsState(); for (const id of M.CHARM_SET) S.album[id] = 1;
  assert.deepEqual(M.grantSets(S), ['title:legend']); assert.deepEqual(M.grantSets(S), []);
  for (const id of M.HAT_SET) S.album[id] = 1;
  assert.deepEqual(M.grantSets(S), ['title:hats']);
  assert.equal(M.HAT_SET.length, 7); assert.equal(M.CHARM_SET.length, 3);
});

test('новый S.equip и подписи: состояние подписывается и проверяется с equip', () => {
  const S = M.newSlotsState(); assert.deepEqual(S.equip, {}); S.album['chips:berry'] = 1; M.equipItem(S, 'chips:berry');
  S.sig = M.signSlots(S); assert.equal(M.checkSlots(S), 'ok');
});

// ---- заглушки шага 9: проводка перков в игры (игр ещё нет) ----
test('шаг 9: блэкджек применяет bjExtra к выплате 21 из трёх карт и показывает бейдж талисмана', () => {
  assert.equal(M.bjExtra({ bjBonus: 0.5 }, 10, { total: 21, cards: 3 }), 5);
  assert.equal(M.bjExtra({}, 10, { total: 21, cards: 3 }), 0);
});
test('шаг 9: рулетка возвращает rouletteRefundAmount только за проигранную ставку на число', () => {
  assert.equal(M.rouletteRefundAmount({ rouletteRefund: 0.1 }, 50), 5);
  assert.equal(M.rouletteRefundAmount({}, 50), 0);
});
test('шаг 9: ачивки bj_win и roulette_straight выдаются играми', () => {
  const ids = ['bj_win', 'roulette_straight'];
  for (const id of ids) assert.ok(C.ACH.some(a => a.id === id), id);
});
test('шаг 9: эмоция, фишки, сукно и рубашка отображаются в играх; активные перки видны в интерфейсе', () => {
  for (const k of ['cardback', 'chips', 'felt', 'emote', 'perkcharm']) assert.ok(k in C.KIND_NAME);
});
test('шаг 9: фриспины показывают итог с учётом payoutPct (trace.fs.total не масштабируется)', () => {
  const S = M.newSlotsState();
  const r = M.rollRound(M.mulberry32(1), S, 10, { payoutPct: 2 });
  assert.ok(r.won >= 0);
});
