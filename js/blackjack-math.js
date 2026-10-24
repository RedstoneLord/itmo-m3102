/* casino:step7 */
/*
 * Блэкджек казино: чистая математика (без DOM, ГСЧ внедряется: mulberry32(seed) в тестах/калибровке, cryptoRng() в игре).
 * Страницу рисует js/blackjack.js — здесь только правила, раздача, выплаты, стратегия и калибровка.
 *
 * ПРАВИЛА (упрощённые). Колода: 6 колод, 312 карт; тасуем заново перед раздачей, когда в шу осталось ≤ 25% карт.
 *   Действия игрока: Hit / Stand. Нет дабла, страховки и сплита. Дилер на 17 (в том числе на soft 17) стоит.
 *   Дилер заглядывает в закрытую карту, если открытая — туз или десятка: блэкджек дилера вскрывается сразу
 *   (игрок проигрывает ставку; своим блэкджеком получает пуш). Ничья (пуш) возвращает ставку.
 *   Блэкджек (туз + десятка-карта на первые две) платит 3:2.
 * БОНУСЫ (дом проигрывает слегка — это игра в плюс по замыслу, RTP цель 101–105%):
 *   • «5-карточный Чарли»: 5 карт и не перебор — сразу выплата CHARLIE_PAY:1 (2:1), дилер не важен.
 *   • «7-7-7»: три семёрки первыми тремя картами — сразу TRIPLE7_PAY:1 (3:1).
 *   • «Мастевой блэкджек»: туз + десятка-карта одной масти платит SUITED_BJ_PAY:1 (2:1) вместо 3:2.
 *   Раунд после Чарли и 7-7-7 заканчивается сразу; дилер добирает карты до конца для показа и для расчёта вклада бонуса.
 * ПЕРК шага 3: bjBonus — 21 ровно из трёх карт (не блэкджек) добавляет ставка × bjBonus (см. bjExtra в slots-math.js).
 *   В RTP калибровки перки не входят (perks = {}).
 *
 * СТРАТЕГИЯ (basicStrategy, ею играет калибровка). Получена точным динамическим программированием по бесконечной колоде
 * с учётом Чарли и без дабла/сплита; решение зависит от суммы, мягкости и числа карт на руках (n = 2, 3, 4):
 *   жёсткие, n=2: ≤11 hit; 12 stand против 5–6, иначе hit; 13–16 stand против 2–6, hit против 7–A; ≥17 stand.
 *   жёсткие, n=3: ≤13 hit; 14 hit против 2 и 7–A; 15–16 stand против 2–6, hit против 7–A; ≥17 stand.
 *   жёсткие, n=4: ≤16 hit; 17 hit против 2–4 и 7–A (stand против 5–6); ≥18 stand.
 *   мягкие,  n=2: ≤17 hit; 18 stand против 2–7, hit против 8–A; ≥19 stand.
 *   мягкие,  n=3: ≤19 hit; ≥20 stand.   мягкие, n=4: всегда hit (перебора нет, пятая карта = Чарли 2:1).
 * Идея: мягкая рука из 4 карт не может перебрать, поэтому пятая карта гарантирует Чарли. Это и делает бонус весомым.
 * ВЕСА: калибровка играет по этой таблице, значения констант провизорны — прогоните node tools/apply-casino.mjs --calibrate.
 * Ориентир: ставка по умолчанию в таблице — без перков. Расчёт на бесконечной колоде даёт ≈103% (6 колод ±0.3).
 */
import { mulberry32, cryptoRng, bjExtra } from './slots-math.js';
export { mulberry32, cryptoRng, bjExtra };

export const DECKS = 6, SHOE_SIZE = 52 * DECKS, RESHUFFLE_LEFT = 0.25, DEALER_STAND = 17, CHARLIE_CARDS = 5, MIN_BET = 1;
export const BJ_PAY = 1.5, SUITED_BJ_PAY = 2, CHARLIE_PAY = 2, TRIPLE7_PAY = 3;
export const RTP_TARGET = [101, 105];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const OUTCOME_LABEL = {
  'blackjack': 'Блэкджек 3:2', 'suited-blackjack': 'Мастевой блэкджек 2:1', 'charlie': '5 карт без перебора 2:1', 'triple7': '7-7-7 3:1',
  'win': 'Победа', 'push': 'Ничья', 'lose': 'Проигрыш', 'bust': 'Перебор', 'dealer-blackjack': 'Блэкджек дилера',
};

/* ---------- карты и руки ---------- */
export const card = (r, s = 0) => ({ r, s });
export const cardValue = c => Math.min(c.r, 10); // туз = 1 (счёт мягкой руки — в handValue)
export const rankLabel = r => (r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));
export function handValue(cards) {
  let sum = 0, aces = 0;
  for (const c of cards) { sum += cardValue(c); if (c.r === 1) aces++; }
  const soft = aces > 0 && sum + 10 <= 21;
  return { total: soft ? sum + 10 : sum, soft, bust: sum > 21 };
}
export const isNatural = cards => cards.length === 2 && handValue(cards).total === 21;
export const isSuitedNatural = cards => isNatural(cards) && cards[0].s === cards[1].s;
export const isTripleSeven = cards => cards.length === 3 && cards.every(c => c.r === 7);

/* ---------- шу ---------- */
export function shuffleShoe(shoe, rng) {
  const a = shoe.cards;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  shoe.pos = 0;
  return shoe;
}
export function newShoe(rng, decks = DECKS) {
  const cards = [];
  for (let d = 0; d < decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ r, s });
  return shuffleShoe({ cards, pos: 0 }, rng);
}
export const cardsLeft = shoe => shoe.cards.length - shoe.pos;
export const needsShuffle = shoe => cardsLeft(shoe) <= shoe.cards.length * RESHUFFLE_LEFT;
export function draw(shoe) {
  if (shoe.pos >= shoe.cards.length) throw new Error('blackjack: шу пуст (подготовьте раунд через dealRound)');
  return shoe.cards[shoe.pos++];
}
/* выплата с переносом дробной части (как settle в slots-math): возвращает {pay (целое), frac} */
export function settle(frac, amount) { const t = (Number(frac) || 0) + (Number(amount) || 0), pay = Math.floor(t + 1e-9); return { pay, frac: Math.max(0, t - pay) }; }

/* ---------- раунд ---------- */
function dealerPlay(R, shoe) { while (handValue(R.dealer).total < DEALER_STAND) R.dealer.push(draw(shoe)); }
function plainMult(R) { // что принесла бы рука при обычных правилах (стоим на текущей сумме): для атрибуции бонусов
  const p = handValue(R.player), d = handValue(R.dealer);
  if (p.bust) return -1;
  if (d.bust || p.total > d.total) return 1;
  return p.total === d.total ? 0 : -1;
}
function finish(R, shoe, kind, perks) {
  R.done = true;
  const p = handValue(R.player);
  R.bonus = null;
  if (kind === 'dealerbj') { R.mult = isNatural(R.player) ? 0 : -1; R.plainMult = R.mult; R.outcome = R.mult === 0 ? 'push' : 'dealer-blackjack'; }
  else if (kind === 'natural') {
    const suited = isSuitedNatural(R.player);
    R.mult = suited ? SUITED_BJ_PAY : BJ_PAY; R.plainMult = BJ_PAY; R.outcome = suited ? 'suited-blackjack' : 'blackjack'; R.bonus = suited ? 'suited-blackjack' : null;
  } else if (kind === 'bust') { R.mult = -1; R.plainMult = -1; R.outcome = 'bust'; }
  else {
    dealerPlay(R, shoe);
    R.plainMult = plainMult(R);
    if (kind === 'triple7') { R.mult = TRIPLE7_PAY; R.outcome = 'triple7'; R.bonus = 'triple7'; }
    else if (kind === 'charlie') { R.mult = CHARLIE_PAY; R.outcome = 'charlie'; R.bonus = 'charlie'; }
    else { R.mult = R.plainMult; R.outcome = R.mult > 0 ? 'win' : R.mult === 0 ? 'push' : 'lose'; }
  }
  R.extra = bjExtra(perks, R.bet, { total: p.total, cards: R.player.length, natural: isNatural(R.player) });
  R.ret = R.bet * (1 + R.mult) + R.extra; // всего вернуть игроку (ставка + выигрыш + бонус перка); дробь — через settle()
  return R;
}
export function dealRound(shoe, rng, bet, perks = {}) {
  const reshuffled = needsShuffle(shoe);
  if (reshuffled) shuffleShoe(shoe, rng);
  const R = { bet, perks, player: [], dealer: [], done: false, outcome: null, mult: 0, plainMult: 0, bonus: null, extra: 0, ret: 0, reshuffled };
  R.player.push(draw(shoe)); R.dealer.push(draw(shoe)); R.player.push(draw(shoe)); R.dealer.push(draw(shoe));
  const up = cardValue(R.dealer[0]);
  if ((up === 10 || up === 1) && isNatural(R.dealer)) return finish(R, shoe, 'dealerbj', perks);
  if (isNatural(R.player)) return finish(R, shoe, 'natural', perks);
  return R;
}
export const canHit = R => !R.done;
export function hit(R, shoe) {
  if (R.done) throw new Error('blackjack: раунд уже завершён');
  R.player.push(draw(shoe));
  if (isTripleSeven(R.player)) return finish(R, shoe, 'triple7', R.perks);
  if (handValue(R.player).bust) return finish(R, shoe, 'bust', R.perks);
  if (R.player.length >= CHARLIE_CARDS) return finish(R, shoe, 'charlie', R.perks);
  return R;
}
export function stand(R, shoe) {
  if (R.done) throw new Error('blackjack: раунд уже завершён');
  return finish(R, shoe, 'stand', R.perks);
}

/* ---------- базовая стратегия (таблицы — по ячейкам против открытой карты дилера 2,3,…,10,A) ---------- */
const ALL_H = 'HHHHHHHHHH', ALL_S = 'SSSSSSSSSS', S26 = 'SSSSSHHHHH';
const HARD = { 2: { 12: 'HHHSSHHHHH', 13: S26, 14: S26, 15: S26, 16: S26 }, 3: { 14: 'HSSSSHHHHH', 15: S26, 16: S26 }, 4: { 17: 'HHHSSHHHHH' } };
const HARD_STAND_FROM = { 2: 17, 3: 17, 4: 18 };
const SOFT = { 2: { 18: 'SSSSSSHHHH' } };
const SOFT_STAND_FROM = { 2: 19, 3: 20, 4: Infinity };
export function basicStrategy(cards, dealerUp) {
  const { total, soft } = handValue(cards), n = Math.min(4, Math.max(2, cards.length));
  const up = typeof dealerUp === 'number' ? dealerUp : cardValue(dealerUp), col = up === 1 || up === 11 ? 9 : Math.min(10, Math.max(2, up)) - 2;
  const row = ((soft ? SOFT : HARD)[n] || {})[total], from = (soft ? SOFT_STAND_FROM : HARD_STAND_FROM)[n];
  const act = row ? row[col] : total >= from ? 'S' : 'H';
  return act === 'S' ? 'stand' : 'hit';
}
export function playRound(shoe, rng, bet, perks = {}, strategy = basicStrategy) {
  const R = dealRound(shoe, rng, bet, perks);
  while (!R.done) { if (strategy(R.player, R.dealer[0]) === 'hit') hit(R, shoe); else stand(R, shoe); }
  return R;
}

/* ---------- калибровка: node tools/apply-casino.mjs --calibrate [--rounds=N] [--seed=N] ----------
   Играет n раундов по basicStrategy, ставка 1, перки {}. Считает RTP (со 95%-доверием), частоты исходов и вклад каждого бонуса
   (результат раунда минус результат тех же карт при обычных правилах). Ничего не пишет. По умолчанию 6 000 000 раундов. */
export function calibrateBlackjack(n = 6_000_000, opts = {}) {
  const seed = opts.seed ?? 20261021, target = opts.target ?? RTP_TARGET, out = opts.log ?? console.log;
  const rng = mulberry32(seed >>> 0), shoe = newShoe(rng);
  const pad = (s, k) => String(s).padStart(k), f2 = x => x.toFixed(2);
  const cnt = {}, contrib = {}; let sum = 0, sumSq = 0, bonusSum = 0, reshuffles = 0, wins = 0, pushes = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const R = playRound(shoe, rng, 1, {});
    const ret = 1 + R.mult; sum += ret; sumSq += ret * ret;
    cnt[R.outcome] = (cnt[R.outcome] || 0) + 1; contrib[R.outcome] = (contrib[R.outcome] || 0) + ret;
    if (R.bonus) bonusSum += R.mult - R.plainMult;
    if (R.reshuffled) reshuffles++;
    if (R.mult > 0) wins++; else if (R.mult === 0) pushes++;
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean)), ci = 1.96 * sd / Math.sqrt(n);
  const rtp = 100 * mean, bonus = 100 * bonusSum / n, ok = rtp >= target[0] && rtp <= target[1];
  out('Калибровка блэкджека · ' + n.toLocaleString('ru-RU') + ' раундов · seed ' + seed + ' · ' + DECKS + ' колод, перетасовка при ≤' + (RESHUFFLE_LEFT * 100) + '% · Чарли ' + CHARLIE_PAY + ':1 · 7-7-7 ' + TRIPLE7_PAY + ':1 · мастевой BJ ' + SUITED_BJ_PAY + ':1');
  out(pad('исход', 20) + pad('частота%', 11) + pad('вклад в RTP%', 14));
  for (const k of Object.keys(OUTCOME_LABEL)) if (cnt[k]) out(pad(k, 20) + pad(f2(100 * cnt[k] / n), 11) + pad(f2(100 * contrib[k] / n), 14));
  out('\nRTP ' + f2(rtp) + '% ± ' + f2(100 * ci) + ' (95%) · цель ' + target[0] + '–' + target[1] + '% · ' + (ok ? 'в коридоре' : 'ВНЕ'));
  out('  из них бонусы: ' + f2(bonus) + '%, обычные правила (тот же ход игры): ' + f2(rtp - bonus) + '% · побед ' + f2(100 * wins / n) + '% · пушей ' + f2(100 * pushes / n) + '% · перетасовок ' + reshuffles.toLocaleString('ru-RU') + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  const mid = (target[0] + target[1]) / 2, fc = (cnt.charlie || 0) / n, hint = fc > 0 ? Math.round((CHARLIE_PAY + (mid - rtp) / (100 * fc)) * 100) / 100 : null;
  out('Подсказка (первый порядок, каждые 0.1 к CHARLIE_PAY ≈ ' + f2(10 * fc) + '% RTP): CHARLIE_PAY ≈ ' + (hint === null ? '—' : hint) + ' (сейчас ' + CHARLIE_PAY + '). Затем при необходимости SUITED_BJ_PAY / TRIPLE7_PAY.');
  return { n, seed, rtp, ci: 100 * ci, bonus, ok, counts: cnt, hint };
}
