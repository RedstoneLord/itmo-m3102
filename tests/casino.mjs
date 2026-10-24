/* casino:step5 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';
import * as C from '../js/casino-common.js';

test('casino-common: экспорты контракта', () => {
  for (const n of ['loadAll', 'saveAll', 'applyItem', 'perksOf', 'stepBet', 'betSteps', 'balance', 'adjustBalance', 'isOnBreak', 'setBreak', 'toast', 'renderBreakBanner', 'renderHud', 'getAudio', 'makeAwards', 'makeTimers', 'makeFx', 'ACH', 'esc', 'fmt', 'clock', 'KIND_NAME', 'THEME_CLASS', 'CANCEL'])
    assert.ok(n in C, `нет экспорта ${n}`);
  assert.equal(C.betSteps, M.BETS);
});

test('stepBet: шаги, границы, max с потолком, незнакомая ставка', () => {
  const L = C.betSteps;
  assert.equal(C.stepBet(L[0], -1), L[0]); assert.equal(C.stepBet(L.at(-1), 1), L.at(-1));
  assert.equal(C.stepBet(L[2], 1), L[3]); assert.equal(C.stepBet(L[2], -1), L[1]);
  assert.equal(C.stepBet(5, 'min'), L[0]); assert.equal(C.stepBet(5, 'max'), L.at(-1));
  assert.equal(C.stepBet(5, 'max', 12), [...L].reverse().find(b => b <= 12)); assert.equal(C.stepBet(5, 'max', 0), L[0]);
  for (const b of [0, 3.5, 7, 1e12]) { assert.ok(L.includes(C.stepBet(b, 1))); assert.ok(L.includes(C.stepBet(b, -1))); }
});

test('баланс: целые, не уходит в минус', () => {
  const H = { berries: 10.9 }; assert.equal(C.balance(H), 10);
  assert.equal(C.adjustBalance(H, 5), 15); assert.equal(C.adjustBalance(H, -100), 0); assert.equal(C.adjustBalance(H, NaN), 0);
  assert.equal(C.balance(null), 0);
});

test('перерыв: общий S.breakUntil, 15 минут / до завтра, сократить нельзя', () => {
  const S = M.newSlotsState(), t0 = new Date(2026, 9, 14, 22, 30).getTime();
  assert.equal(C.isOnBreak(S, t0), false);
  C.setBreak(S, '15', t0); assert.equal(S.breakUntil, t0 + 15 * 60000); assert.equal(C.isOnBreak(S, t0 + 14 * 60000), true); assert.equal(C.isOnBreak(S, t0 + 15 * 60000), false);
  C.setBreak(S, 'day', t0); assert.equal(S.breakUntil, new Date(2026, 9, 15).getTime());
  C.setBreak(S, '15', t0); assert.equal(S.breakUntil, new Date(2026, 9, 15).getTime());
});

test('slots.js: панели вынесены, обработчики снимаются, перерыв и награды — через casino-common', async () => {
  const { readFileSync } = await import('node:fs'), s = readFileSync(new URL('../js/slots.js', import.meta.url), 'utf8');
  assert.ok(/from '\.\/casino-common\.js'/.test(s));
  assert.ok(!/content\.addEventListener\('/.test(s), 'остались неснимаемые обработчики');
  assert.ok(s.includes('ac.abort()'));
  for (const gone of ['sl-panels', 'function renderAlbum', 'function renderWheel', 'async function openCapsuleUi', 'function claimDaily', 'function renderPanels'])
    assert.ok(!s.includes(gone), `в slots.js остался ${gone}`);
  assert.ok(s.includes('href="#/casino"') && s.includes('makeAwards(') && s.includes('isOnBreak(S)') && s.includes('setBreak(S'));
  for (const kept of ['window.__hhDestroy = destroy', 'function openPay', 'function doSpin']) assert.ok(s.includes(kept), kept);
  const c = readFileSync(new URL('../js/casino-collection.js', import.meta.url), 'utf8');
  for (const moved of ['function renderAlbum', 'function renderWheel', 'async function openCapsuleUi', 'function claimDaily', 'async function runWheel', 'function renderAch', 'function renderStats', 'function renderDaily']) assert.ok(c.includes(moved), moved);
});

test('index.html: маршруты казино, вкладка «Ещё», порядок вкладок', async () => {
  const { readFileSync } = await import('node:fs'), h = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const r of ['casino', 'blackjack', 'roulette']) { assert.ok(h.includes(`if(h==='${r}')return{mode:'${r}'`), r); assert.ok(h.includes(`mode==='${r}'`), r); assert.ok(new RegExp(`${r}:4`).test(h), r); }
  assert.ok(h.includes("h.startsWith('collection/')") && h.includes('renderCollectionPage(path)'));
  assert.ok(h.includes('./css/casino.css') && h.includes('./css/casino-themes.css') && h.indexOf('casino.css') > h.indexOf('slots.css'));
  assert.ok(h.includes('href="#/casino"') && h.includes('data-go="casino"') && h.includes('data-go="collection"'));
  assert.ok(!h.includes('href="#/slots">🎰'));
  const l = readFileSync(new URL('../js/lectures.js', import.meta.url), 'utf8');
  for (const p of ['#/casino', '#/collection', '#/blackjack', '#/roulette', '#/slots']) assert.ok(l.includes(`href: '${p}'`), p);
});

test('«smart player» strategy: сессии 500, 5000, 50000; возврат 100–105%, рост медианы ограничен, банкротства учтены', async () => {
  const BETS = [...M.BETS].sort((a, b) => a - b);
  function pickBet(balance) {
    const target = Math.floor(balance / 5);
    let chosen = 1;
    for (const b of BETS) { if (b <= target && b <= balance) chosen = b; else break; }
    return Math.max(1, chosen);
  }

  const bankrolls = [500, 5000, 50000];
  const results = {};
  const numSessions = 2000;
  const maxSpins = 300;
  const rng = M.mulberry32(2026);

  let grandTotalWagered = 0, grandTotalWon = 0;

  for (const initBal of bankrolls) {
    let totalWag = 0, totalWon = 0, bankrupt = 0;
    const balances = [];

    for (let s = 0; s < numSessions; s++) {
      let bal = initBal;
      const S = M.newSlotsState();

      for (let spin = 0; spin < maxSpins; spin++) {
        if (bal < 1) { bankrupt++; break; }
        const isWarm = S.heat >= M.HEAT_MAX;
        let bet = isWarm ? pickBet(bal) : 1;
        if (bet > bal) bet = bal;
        bal -= bet;
        totalWag += bet;
        const { parts } = M.rollRound(rng, S, bet, {}, { paid: true });
        bal += parts.total;
        totalWon += parts.total;
      }
      balances.push(bal);
    }

    balances.sort((a, b) => a - b);
    const median = balances[Math.floor(balances.length / 2)];
    const swRtp = 100 * totalWon / totalWag;
    const brRate = 100 * bankrupt / numSessions;
    const bound = Math.round(initBal * Math.max(1.5, 1 + (swRtp / 100) * (maxSpins / 10)));

    results[initBal] = { initBal, totalWag, totalWon, swRtp, median, bound, brRate };
    grandTotalWagered += totalWag;
    grandTotalWon += totalWon;

    assert.ok(median <= bound, 'Медиана ' + median + ' превысила границу ' + bound + ' для баланса ' + initBal);
  }

  const overallRtp = 100 * grandTotalWon / grandTotalWagered;
  assert.ok(overallRtp >= 100 && overallRtp <= 105, 'Взвешенный возврат ' + overallRtp.toFixed(2) + '% вне диапазона 100–105%');
});

test('капсулы: частота на ставке 1 ≈0.13%, на 1000 ≈0.8%, с перками ≤1.2%', () => {
  assert.ok(Math.abs(M.capsuleChance(1) - 0.0013) < 1e-4);
  assert.ok(Math.abs(M.capsuleChance(1000) - 0.008) < 1e-4);
  assert.ok(M.capsuleChance(10) > M.capsuleChance(1));
  assert.ok(M.capsuleChance(100) > M.capsuleChance(10));
  assert.ok(M.capsuleChance(1000) > M.capsuleChance(100));

  const fast = Boolean(process.env.SLOTS_FAST);
  const N = fast ? 50000 : 200000;
  const rng = M.mulberry32(777);
  const raw = [['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush']];
  let c1 = 0, c1000 = 0, cPerk = 0;
  for (let i = 0; i < N; i++) {
    if (M.injectCapsule(rng, raw, 1).capsules) c1++;
    if (M.injectCapsule(rng, raw, 1000).capsules) c1000++;
    if (M.injectCapsule(rng, raw, 1000, { capsuleChanceMult: 100 }).capsules) cPerk++;
  }
  const r1 = 100 * c1 / N, r1000 = 100 * c1000 / N, rPerk = 100 * cPerk / N;
  assert.ok(Math.abs(r1 - 0.13) <= 0.06, 'Частота при ставке 1: ' + r1 + '% (ожидалось ≈0.13% ±0.06%)');
  assert.ok(Math.abs(r1000 - 0.8) <= 0.12, 'Частота при ставке 1000: ' + r1000 + '% (ожидалось ≈0.8%)');
  assert.ok(rPerk <= 1.25, 'Частота с перком: ' + rPerk + '% не должна превышать 1.25%');
});
