/* casino:step7 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../js/blackjack-math.js';

// Шаг 7: правила, бонусы, стратегия блэкджека. Быстрые проверки; полная калибровка — node tools/apply-casino.mjs --calibrate.
const c = (r, s = 0) => ({ r, s });
const rig = (...cards) => ({ cards, pos: 0 }); // порядок выдачи: игрок, дилер(открытая), игрок, дилер(закрытая), затем добор
const rng0 = () => 0.5;

test('handValue: мягкие/жёсткие руки и перебор', () => {
  assert.deepEqual(B.handValue([c(1), c(6)]), { total: 17, soft: true, bust: false });
  assert.deepEqual(B.handValue([c(1), c(6), c(10)]), { total: 17, soft: false, bust: false });
  assert.deepEqual(B.handValue([c(1), c(1), c(9)]), { total: 21, soft: true, bust: false });
  assert.equal(B.handValue([c(10), c(12), c(5)]).bust, true);
  assert.ok(B.isNatural([c(1), c(13)]) && !B.isNatural([c(7), c(7), c(7)]));
});

test('шу: 312 карт по 24 каждого ранга, перетасовка при ≤25% остатка', () => {
  const shoe = B.newShoe(B.mulberry32(1));
  assert.equal(shoe.cards.length, 312);
  for (let r = 1; r <= 13; r++) assert.equal(shoe.cards.filter(x => x.r === r).length, 24);
  assert.equal(B.needsShuffle(shoe), false);
  shoe.pos = 312 - 79; assert.equal(B.needsShuffle(shoe), false);
  shoe.pos = 312 - 78; assert.equal(B.needsShuffle(shoe), true);
  const R = B.dealRound(shoe, B.mulberry32(2), 10);
  assert.equal(R.reshuffled, true); assert.ok(B.cardsLeft(shoe) >= 312 - 4 - 1);
});

test('выплаты: блэкджек 3:2, мастевой 2:1, пуш, победа, проигрыш, перебор', () => {
  let R = B.dealRound(rig(c(1, 1), c(9), c(13, 2), c(7)), rng0, 10);
  assert.equal(R.outcome, 'blackjack'); assert.equal(R.ret, 25);
  R = B.dealRound(rig(c(1, 1), c(9), c(13, 1), c(7)), rng0, 10);
  assert.equal(R.outcome, 'suited-blackjack'); assert.equal(R.ret, 30);
  R = B.dealRound(rig(c(10), c(10), c(9), c(8)), rng0, 10); B.stand(R, rig()); // 19 против 18
  assert.equal(R.outcome, 'win'); assert.equal(R.ret, 20);
  R = B.dealRound(rig(c(10), c(10), c(8), c(8)), rng0, 10); B.stand(R, rig());
  assert.equal(R.outcome, 'push'); assert.equal(R.ret, 10);
  R = B.dealRound(rig(c(10), c(10), c(7), c(10)), rng0, 10); B.stand(R, rig());
  assert.equal(R.outcome, 'lose'); assert.equal(R.ret, 0);
  R = B.dealRound(rig(c(10), c(10), c(6), c(7), c(10)), rng0, 10); B.hit(R, rig(c(10)));
  assert.equal(R.outcome, 'bust'); assert.equal(R.ret, 0);
});

test('блэкджек дилера вскрывается сразу: проигрыш или пуш с блэкджеком игрока', () => {
  let R = B.dealRound(rig(c(10), c(1), c(9), c(13)), rng0, 10);
  assert.equal(R.done, true); assert.equal(R.outcome, 'dealer-blackjack'); assert.equal(R.ret, 0);
  R = B.dealRound(rig(c(1), c(1), c(13), c(12)), rng0, 10);
  assert.equal(R.outcome, 'push'); assert.equal(R.ret, 10);
});

test('дилер стоит на 17 (в т.ч. мягких) и добирает до 17', () => {
  let R = B.dealRound(rig(c(10), c(1), c(8), c(6)), rng0, 10); // дилер A+6 = мягкие 17
  B.stand(R, rig()); assert.equal(R.dealer.length, 2); assert.equal(R.outcome, 'win');
  R = B.dealRound(rig(c(10), c(10), c(9), c(6), c(5)), rng0, 10); const sh = rig(c(5));
  B.stand(R, sh); assert.equal(R.dealer.length, 3); assert.equal(B.handValue(R.dealer).total, 21); assert.equal(R.outcome, 'lose');
});

test('бонусы: 5-карточный Чарли 2:1, 7-7-7 3:1 мгновенно', () => {
  let R = B.dealRound(rig(c(2), c(10), c(2), c(7), c(2), c(2), c(2)), rng0, 10); const sh = rig(c(2), c(2), c(2));
  sh.cards = [c(2), c(2), c(2)];
  B.hit(R, sh); B.hit(R, sh); assert.equal(R.done, false); B.hit(R, sh);
  assert.equal(R.outcome, 'charlie'); assert.equal(R.ret, 30); assert.equal(R.player.length, 5);
  R = B.dealRound(rig(c(7), c(10), c(7, 1), c(8)), rng0, 10); B.hit(R, rig(c(7, 2)));
  assert.equal(R.outcome, 'triple7'); assert.equal(R.ret, 40);
  assert.ok(B.CHARLIE_PAY === 2 && B.TRIPLE7_PAY === 3 && B.BJ_PAY === 1.5);
});

test('перк bjBonus: 21 ровно из трёх карт (не блэкджек) добавляет ставка × bjBonus', () => {
  const perks = { bjBonus: 0.5 };
  let R = B.dealRound(rig(c(5), c(10), c(6), c(7)), rng0, 10, perks); B.hit(R, rig(c(10)));
  assert.equal(R.player.length, 3); B.stand(R, rig());
  assert.equal(R.extra, 5); assert.equal(R.ret, 25);
  R = B.dealRound(rig(c(5), c(10), c(6), c(7)), rng0, 10, {}); B.hit(R, rig(c(10))); B.stand(R, rig());
  assert.equal(R.extra, 0);
  R = B.dealRound(rig(c(1), c(9), c(13), c(7)), rng0, 10, perks); assert.equal(R.extra, 0); // блэкджек не считается
});

test('стратегия: ячейки таблицы', () => {
  const S = (cards, up) => B.basicStrategy(cards, up);
  assert.equal(S([c(10), c(2)], 4), 'hit'); assert.equal(S([c(10), c(2)], 5), 'stand'); assert.equal(S([c(10), c(2)], 10), 'hit');
  assert.equal(S([c(10), c(6)], 6), 'stand'); assert.equal(S([c(10), c(6)], 7), 'hit'); assert.equal(S([c(10), c(6)], 1), 'hit');
  assert.equal(S([c(10), c(7)], 10), 'stand'); assert.equal(S([c(5), c(6)], 6), 'hit');
  assert.equal(S([c(1), c(7)], 6), 'stand'); assert.equal(S([c(1), c(7)], 9), 'hit'); assert.equal(S([c(1), c(6)], 6), 'hit'); assert.equal(S([c(1), c(8)], 10), 'stand');
  assert.equal(S([c(1), c(2), c(3), c(5)], 10), 'hit'); // мягкие 4 карты: пятая карта = Чарли
  assert.equal(S([c(10), c(3), c(2), c(2)], 10), 'hit'); assert.equal(S([c(10), c(4), c(2), c(1)], 5), 'stand'); // жёсткие 17 из 4 карт: stand только против 5–6
  assert.equal(S([c(2), c(3), c(4)], 9), 'hit'); // 9 из трёх карт
});

test('моделирование 150k раундов (seed): RTP в разумных границах, без падений и без остатка в шу', () => {
  const rng = B.mulberry32(777), shoe = B.newShoe(rng); let sum = 0, charlie = 0;
  for (let i = 0; i < 150000; i++) { const R = B.playRound(shoe, rng, 1, {}); sum += R.ret; if (R.outcome === 'charlie') charlie++; assert.ok(R.done && Number.isFinite(R.ret)); }
  const rtp = 100 * sum / 150000;
  assert.ok(rtp > 98 && rtp < 108, 'RTP ' + rtp.toFixed(2)); assert.ok(charlie > 0);
});

test('settle: целая выплата и перенос дробной части', () => {
  let s = B.settle(0, 12.5); assert.deepEqual(s, { pay: 12, frac: 0.5 }); s = B.settle(s.frac, 12.5); assert.deepEqual(s, { pay: 13, frac: 0 });
});

test('calibrateBlackjack: небольшой прогон возвращает RTP и частоты (полный — через --calibrate)', () => {
  const lines = []; const r = B.calibrateBlackjack(20000, { log: s => lines.push(s) });
  assert.ok(r.rtp > 90 && r.rtp < 115); assert.ok(lines.some(l => l.includes('RTP')));
});
