/* casino:step7 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/roulette-math.js';

// Шаг 7: ставки, выплаты, бонусы рулетки; RTP считается ТОЧНО перебором, моделирование короткое.
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' vs ' + b);

test('все ставки: число карманов × (выплата + 1) = 36, чистый RTP 97.30%', () => {
  const specs = R.allBetSpecs();
  for (const s of specs) { const b = R.makeBet(s.type, s.arg); assert.equal(b.pockets.length * (b.payout + 1), 36, s.type + ' ' + JSON.stringify(s.arg)); near(R.exactParts(s).base, 100 * 36 / 37, 1e-9); }
});

test('составы ставок: стрит, угол, сикслайн, колонка, дюжина, цвет, чёт, диапазон', () => {
  assert.deepEqual(R.makeBet('street', 2).pockets, [4, 5, 6]);
  assert.deepEqual(R.makeBet('corner', 5).pockets, [5, 6, 8, 9]);
  assert.deepEqual(R.makeBet('sixline', 1).pockets, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(R.makeBet('column', 3).pockets.slice(0, 3), [3, 6, 9]); assert.equal(R.makeBet('column', 1).pockets.length, 12);
  assert.deepEqual(R.makeBet('dozen', 3).pockets, [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]);
  assert.equal(R.makeBet('redblack', 'red').pockets.length, 18); assert.ok(R.makeBet('redblack', 'red').pockets.includes(1) && R.makeBet('redblack', 'black').pockets.includes(2));
  assert.equal(R.makeBet('oddeven', 'even').pockets.length, 18); assert.deepEqual(R.makeBet('lowhigh', 'high').pockets.slice(0, 2), [19, 20]);
  assert.deepEqual(R.makeBet('split', [0, 2]).pockets, [0, 2]); assert.deepEqual(R.makeBet('split', [9, 6]).pockets, [6, 9]);
  assert.throws(() => R.makeBet('split', [3, 4])); assert.throws(() => R.makeBet('split', [1, 5])); assert.throws(() => R.makeBet('corner', 3)); assert.throws(() => R.makeBet('straight', 37));
  assert.equal(R.allBetSpecs().length, 37 + 60 + 12 + 11 + 22 + 3 + 3 + 2 + 2 + 2);
});

test('выплаты: straight 35:1, зеро возвращает половину внешних, горячее число множит прибыль', () => {
  const st = R.makeBet('straight', 17, 10), out = R.makeBet('redblack', 'red', 10), inn = R.makeBet('street', 1, 10);
  let r = R.settleSpin({ n: 17, hot: 5 }, [st]); assert.equal(r.ret, 360);
  r = R.settleSpin({ n: 0, hot: 5 }, [st, out, inn]); assert.deepEqual(r.rows.map(x => x.ret), [0, 5, 0]); assert.equal(r.rows[1].status, 'zero-refund');
  r = R.settleSpin({ n: 17, hot: 17 }, [st]); assert.equal(r.ret, 10 * (1 + 35 * 3.5)); assert.equal(r.rows[0].hot, true);
  r = R.settleSpin({ n: 3, hot: 3 }, [R.makeBet('redblack', 'black', 10), R.makeBet('column', 3, 10)]); assert.equal(r.rows[0].ret, 0); assert.equal(r.rows[1].ret, 10 * (1 + 2 * 3.5));
});

test('перк rouletteRefund возвращает долю проигранной ставки на число (и только на число)', () => {
  const bets = [R.makeBet('straight', 5, 100), R.makeBet('straight', 6, 50), R.makeBet('dozen', 3, 100)];
  let r = R.settleSpin({ n: 6, hot: 1 }, bets, { rouletteRefund: 0.1 }); assert.equal(r.refund, 10);
  r = R.settleSpin({ n: 6, hot: 1 }, bets, {}); assert.equal(r.refund, 0);
  r = R.settleSpin({ n: 0, hot: 1 }, bets, { rouletteRefund: 0.5 }); assert.equal(r.refund, 150 * 0.25); // лимит перка 25%
});

test('точный RTP: средний по DEFAULT_BETS в коридоре 101–105, каждая ставка не ниже 100%', () => {
  const avg = R.averageRtp(); assert.ok(avg >= R.RTP_TARGET[0] && avg <= R.RTP_TARGET[1], 'avg ' + avg.toFixed(3));
  for (const s of R.DEFAULT_BETS) { const p = R.exactParts(s); assert.ok(p.total > 100 && p.total < 106, s.type + ' ' + p.total.toFixed(2)); near(p.base + p.zero + p.hot, p.total, 1e-9); }
  near(R.exactParts({ type: 'redblack', arg: 'red' }).zero, 100 * 0.5 / 37, 1e-9);
  near(R.exactParts({ type: 'straight', arg: 17 }).hot, 100 * 35 * (R.HOT_MULT - 1) / (37 * 36), 1e-9);
  assert.ok(R.exactRtp({ type: 'straight', arg: 0 }) < 97.31); // 0 никогда не горячий и не внешний
});

test('spinWheel: числа 0–36, горячий 1–36, детерминирован по seed', () => {
  const a = R.mulberry32(5), b = R.mulberry32(5), seen = new Set();
  for (let i = 0; i < 2000; i++) { const x = R.spinWheel(a), y = R.spinWheel(b); assert.deepEqual(x, y); assert.ok(x.n >= 0 && x.n <= 36 && x.hot >= 1 && x.hot <= 36); seen.add(x.n); }
  assert.equal(seen.size, 37);
});

test('calibrateRoulette: короткий прогон согласуется с точным значением', () => {
  const lines = []; const r = R.calibrateRoulette(60000, { log: s => lines.push(s) });
  assert.ok(Math.abs(r.simAvg - r.exAvg) < 2.5); assert.ok(lines.some(l => l.includes('Средний RTP')));
});
