/* casino:step2 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';

// Шаг 2 казино: новые символы, capsule, ряд из seven. Только проверки формы и правил, без измерения RTP.
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, a + ' vs ' + b + ' (±' + eps + ')');

test('новые символы: ярусы выплат, ленты, capsule не попадает на ленты', () => {
  for (let k = 0; k < 3; k++) {
    assert.ok(M.PAY.claude[k] > M.PAY.apple[k] && M.PAY.claude[k] < M.PAY.mush[k], 'claude ' + k);
    assert.ok(M.PAY.itmo[k] >= M.PAY.orange[k] && M.PAY.itmo[k] <= M.PAY.cpp[k] * 1.25, 'itmo ' + k);
    assert.ok(M.PAY.seven[k] > M.PAY.hog[k] && M.PAY.seven[k] < M.PAY.king[k], 'seven ' + k);
  }
  for (const s of ['claude', 'itmo', 'seven', 'capsule']) assert.ok(M.SYMBOLS.includes(s), s);
  for (const set of ['cold', 'warm', 'fs']) M.STRIPS[set].forEach((strip, i) => {
    assert.equal(strip.includes('capsule'), false, set + ' capsule r' + i);
    for (const s of ['claude', 'itmo', 'seven']) assert.ok(strip.includes(s), set + ' ' + s + ' r' + i);
  });
  assert.equal(M.STRIPS.cold.map(s => s.length).join(), M.STRIPS.warm.map(s => s.length).join());
});

test('capsuleChance: монотонна, ≈0.13% на минимальной ставке, ≈0.8% от 1000, не выше 1%', () => {
  near(M.capsuleChance(1), 0.0013, 1e-9);
  near(M.capsuleChance(1000), 0.008, 1e-9);
  assert.equal(M.capsuleChance(100000), M.capsuleChance(1000));
  let prev = 0;
  for (const b of [1, 2, 3, 4, 5, 10, 25, 50, 100, 250, 500, 1000, 2500]) { const p = M.capsuleChance(b); assert.ok(p >= prev && p <= 0.01, 'bet ' + b); prev = p; }
  assert.equal(M.capsuleChance(0), M.capsuleChance(1));
  assert.equal(M.capsuleChance(NaN), M.capsuleChance(1));
});

test('injectCapsule: перезаписывает одну обычную ячейку, спецсимволы не трогает, перк ограничен 1.2%', () => {
  const raw = [['wild', 'berry', 'scatter'], ['bonus', 'apple', 'mush'], ['git', 'orange', 'cpp'], ['rust', 'pi', 'hog'], ['king', 'seven', 'claude']];
  const copy = JSON.stringify(raw), fixed = v => () => v;
  const hit = M.injectCapsule(fixed(0), raw, 10);
  assert.equal(hit.capsules, 1); assert.deepEqual(hit.at, [0, 1]); assert.equal(hit.raw[0][1], 'capsule');
  assert.equal(JSON.stringify(raw), copy, 'исходный массив не изменён');
  assert.deepEqual([hit.raw[0][0], hit.raw[0][2], hit.raw[1][0]], ['wild', 'scatter', 'bonus']);
  const miss = M.injectCapsule(fixed(0.999), raw, 10); assert.equal(miss.capsules, 0); assert.equal(miss.raw, raw);
  // 0.011 между базовым потолком 0.8% и перковым 1.2% на ставке 1000
  assert.equal(M.injectCapsule(fixed(0.011), raw, 1000).capsules, 0);
  assert.equal(M.injectCapsule(fixed(0.011), raw, 1000, { capsuleChanceMult: 100 }).capsules, 1);
  assert.equal(M.injectCapsule(fixed(0.0125), raw, 1000, { capsuleChanceMult: 100 }).capsules, 0);
});

test('evaluate: capsule не участвует в линиях, вертикалях и scatter; считается в capsules', () => {
  const raw = [['capsule', 'git', 'mush'], ['git', 'mush', 'capsule'], ['apple', 'capsule', 'git'], ['mush', 'git', 'apple'], ['git', 'apple', 'mush']];
  const r = M.evaluate(raw);
  assert.equal(r.capsules, 3); assert.equal(r.scatter, 0); assert.equal(r.bonus, false);
  assert.ok(r.lines.every(l => l.sym !== 'capsule'));
  const col = M.evaluate([['capsule', 'capsule', 'capsule'], ['git', 'apple', 'mush'], ['apple', 'mush', 'git'], ['mush', 'git', 'apple'], ['git', 'apple', 'mush']]);
  assert.equal(col.lines.some(l => l.col === 0), false);
  assert.equal(M.evaluate([['berry', 'apple', 'git'], ['pi', 'apple', 'git'], ['rust', 'mush', 'git'], ['cpp', 'apple', 'git'], ['pi', 'apple', 'git']]).capsules, 0);
});

test('ряд из пяти seven (Wild считаются) ставит sevenRow; старое правило трёх расширенных Wild цело', () => {
  const sevens = c => Array.from({ length: 5 }, () => c.slice());
  assert.equal(M.evaluate(sevens(['seven', 'berry', 'apple'])).sevenRow, true);
  assert.equal(M.evaluate(sevens(['berry', 'seven', 'apple'])).sevenRow, true);
  const four = sevens(['seven', 'berry', 'apple']); four[4] = ['berry', 'berry', 'apple'];
  assert.equal(M.evaluate(four).sevenRow, false);
  const withWild = sevens(['seven', 'berry', 'apple']); withWild[2] = ['wild', 'berry', 'apple'];
  assert.equal(M.evaluate(withWild).sevenRow, true);
  const three = M.evaluate([['berry', 'apple', 'git'], ['wild', 'apple', 'git'], ['wild', 'mush', 'git'], ['wild', 'cpp', 'git'], ['pi', 'apple', 'git']]);
  assert.deepEqual(three.expanded, [1, 2, 3]); assert.equal(three.jackpotRoll, true); assert.equal(three.sevenRow, false);
});

test('джекпот: seven-ряд бросает с большим коэффициентом, без флагов не бросает, jackpotHit совместим со старым вызовом', () => {
  assert.ok(M.JP_SEVEN_COEF > M.JP_COEF);
  const r = v => () => v, bet = 10;
  assert.ok(0.2 < M.JP_SEVEN_COEF * bet && 0.2 > M.JP_COEF * bet, 'тест рассчитан на эти коэффициенты');
  assert.equal(M.jackpotTrigger(r(0.2), { sevenRow: true }, bet), true);
  assert.equal(M.jackpotTrigger(r(0.2), { jackpotRoll: true }, bet), false);
  assert.equal(M.jackpotTrigger(r(0), {}, bet), false);
  assert.equal(M.jackpotHit(() => 0, 10), true); assert.equal(M.jackpotHit(() => 0.999, 10), false);
});

test('rollRound зачисляет капсулы-символы: S.capsules, S.stats.capsuleSyms, parts.capsules, trace', () => {
  const rng = M.mulberry32(2026), S = M.newSlotsState(); let sum = 0, partsSum = 0; const n = 4000;
  assert.equal(S.stats.capsuleSyms, 0);
  for (let i = 0; i < n; i++) {
    const R = M.rollRound(rng, S, 1000, {}, { paid: true });
    sum += R.res.capsules; partsSum += R.parts.capsules; assert.equal(R.trace.capsules, R.res.capsules);
  }
  assert.ok(sum > 0); assert.equal(partsSum, sum); assert.equal(S.capsules, sum); assert.equal(S.stats.capsuleSyms, sum);
  assert.ok(sum / n > 0.002 && sum / n < 0.02, 'доля капсул ' + sum / n);
});
