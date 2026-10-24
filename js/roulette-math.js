/* casino:step7 */
/*
 * Рулетка казино: чистая математика (без DOM, ГСЧ внедряется). Страницу рисует js/roulette.js.
 *
 * ПРАВИЛА. Европейская рулетка, один зеро: 37 карманов 0–36. Ставки и выплаты (чистая прибыль к ставке):
 *   straight (число) 35:1 · split (2 соседних числа, в т.ч. 0 с 1/2/3) 17:1 · street (ряд из трёх) 11:1 · corner (квадрат из 4) 8:1 ·
 *   sixline (два соседних ряда) 5:1 · column (колонка) 2:1 · dozen (дюжина) 2:1 · redblack / oddeven / lowhigh (1–18, 19–36) 1:1.
 *   Чистый EV любой ставки = 36/37 = 97.30% (выигрышных карманов k × (выплата+1) / 37 = 36/37).
 * БОНУСЫ (две простые видимые механики, вместе ведут средний RTP к ≈103%):
 *   1) «Счастливый зеро» (ZERO_REFUND = 0.5): когда выпал 0, внешние ставки (column, dozen, redblack, oddeven, lowhigh)
 *      возвращают половину ставки. Прирост EV на внешней ставке: ZERO_REFUND / 37 = +1.35 п.п. Внутренние ставки на 0 проигрывают.
 *   2) «Горячее число» (HOT_MULT = 3.5): с каждым спином случайно (равномерно) выбирается один горячий карман 1–36. Если шар
 *      лёг на горячий карман, чистая прибыль КАЖДОЙ выигравшей ставки умножается на HOT_MULT (straight платит 35 × 3.5 = 122.5:1).
 *      Вероятность, что шар лёг на горячий карман, при ставке на карман n равна 1/37 · 1/36, поэтому прирост EV ставки:
 *      (HOT_MULT − 1) · E[W] / 36, где E[W] = выплата × покрытых карманов / 37 (чистая ожидаемая прибыль без бонусов).
 *      straight: +6.57 п.п. · street: +6.2 · corner: +6.0 · column/dozen: +4.5 · even-money: +3.4 (при HOT_MULT=3.5).
 *   ВАЖНО: горячий карман выбирается в spinWheel() ОДНОВРЕМЕННО с выпавшим числом, после закрытия ставок. Показывать его игроку
 *      до спина НЕЛЬЗЯ (иначе ставка на него даёт ≈ 334% RTP): показывайте после броска как «🔥 было горячим».
 *   Итог для набора DEFAULT_BETS (по одной единице на каждый вид ставки): средний RTP ≈ 97.30 + 0.675 (зеро, 5 из 10 ставок) + 5.0 (горячее) ≈ 103.0%.
 *   Точный расчёт перебором 37 × 36 исходов: exactRtp(ставка) / averageRtp(). calibrateRoulette(n) сверяет моделирование с точным значением.
 * ПЕРК шага 3: rouletteRefund — возврат доли проигранной ставки на число (rouletteRefundAmount, лимит 25%). В RTP калибровки перки не входят.
 */
import { mulberry32, cryptoRng, rouletteRefundAmount } from './slots-math.js';
export { mulberry32, cryptoRng, rouletteRefundAmount };

export const POCKETS = 37, ZERO_REFUND = 0.5, HOT_MULT = 3.5, MIN_BET = 1;
export const PAYOUT = { straight: 35, split: 17, street: 11, corner: 8, sixline: 5, column: 2, dozen: 2, redblack: 1, oddeven: 1, lowhigh: 1 };
export const OUTSIDE = ['column', 'dozen', 'redblack', 'oddeven', 'lowhigh'];
export const RTP_TARGET = [101, 105];
export const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export const colorOf = n => (n === 0 ? 'green' : RED.includes(n) ? 'red' : 'black');
export const BET_LABEL = { straight: 'Число', split: 'Сплит', street: 'Стрит', corner: 'Угол', sixline: 'Сикслайн', column: 'Колонка', dozen: 'Дюжина', redblack: 'Красное/чёрное', oddeven: 'Чёт/нечёт', lowhigh: 'Мало/много' };
/* набор «рекомендованных» ставок по умолчанию — по одной единице на вид; по нему считается средний RTP (ни одна не содержит 0) */
export const DEFAULT_BETS = [
  { type: 'straight', arg: 17 }, { type: 'split', arg: [8, 11] }, { type: 'street', arg: 5 }, { type: 'corner', arg: 14 }, { type: 'sixline', arg: 4 },
  { type: 'column', arg: 2 }, { type: 'dozen', arg: 2 }, { type: 'redblack', arg: 'red' }, { type: 'oddeven', arg: 'odd' }, { type: 'lowhigh', arg: 'low' },
];

const rowOf = n => Math.floor((n - 1) / 3), range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const int = (v, lo, hi, what) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error('roulette: ' + what + ' должно быть целым ' + lo + '–' + hi); return v; };
export function makeBet(type, arg, stake = 1) {
  if (!(type in PAYOUT)) throw new Error('roulette: неизвестный вид ставки ' + type);
  let pockets;
  if (type === 'straight') pockets = [int(arg, 0, 36, 'число')];
  else if (type === 'split') {
    if (!Array.isArray(arg) || arg.length !== 2) throw new Error('roulette: split = [a, b]');
    const a = Math.min(...arg), b = Math.max(...arg); int(a, 0, 36, 'число'); int(b, 0, 36, 'число');
    const ok = a === 0 ? b >= 1 && b <= 3 : b - a === 3 || (b - a === 1 && rowOf(a) === rowOf(b));
    if (!ok) throw new Error('roulette: числа ' + a + ' и ' + b + ' не соседние');
    pockets = [a, b];
  } else if (type === 'street') { const r = int(arg, 1, 12, 'ряд'); pockets = range(3 * r - 2, 3 * r); }
  else if (type === 'sixline') { const r = int(arg, 1, 11, 'ряд'); pockets = range(3 * r - 2, 3 * r + 3); }
  else if (type === 'corner') { int(arg, 1, 32, 'число'); if ((arg - 1) % 3 === 2) throw new Error('roulette: угол задаётся верхним левым числом (колонки 1–2)'); pockets = [arg, arg + 1, arg + 3, arg + 4]; }
  else if (type === 'column') { const c = int(arg, 1, 3, 'колонка'); pockets = range(1, 36).filter(n => (n - 1) % 3 === c - 1); }
  else if (type === 'dozen') { const d = int(arg, 1, 3, 'дюжина'); pockets = range(12 * d - 11, 12 * d); }
  else if (type === 'redblack') { if (arg !== 'red' && arg !== 'black') throw new Error("roulette: 'red' | 'black'"); pockets = range(1, 36).filter(n => colorOf(n) === arg); }
  else if (type === 'oddeven') { if (arg !== 'odd' && arg !== 'even') throw new Error("roulette: 'odd' | 'even'"); pockets = range(1, 36).filter(n => (n % 2 === 1) === (arg === 'odd')); }
  else { if (arg !== 'low' && arg !== 'high') throw new Error("roulette: 'low' | 'high'"); pockets = arg === 'low' ? range(1, 18) : range(19, 36); }
  return { type, arg, stake, pockets, payout: PAYOUT[type], outside: OUTSIDE.includes(type) };
}
/* все допустимые ставки (для тестов и таблицы выплат) */
export function allBetSpecs() {
  const L = [];
  for (let n = 0; n <= 36; n++) L.push({ type: 'straight', arg: n });
  for (const n of [1, 2, 3]) L.push({ type: 'split', arg: [0, n] });
  for (let n = 1; n <= 36; n++) { if (n % 3 !== 0) L.push({ type: 'split', arg: [n, n + 1] }); if (n <= 33) L.push({ type: 'split', arg: [n, n + 3] }); }
  for (let r = 1; r <= 12; r++) L.push({ type: 'street', arg: r }); for (let r = 1; r <= 11; r++) L.push({ type: 'sixline', arg: r });
  for (let n = 1; n <= 32; n++) if ((n - 1) % 3 !== 2) L.push({ type: 'corner', arg: n });
  for (const t of [['column', [1, 2, 3]], ['dozen', [1, 2, 3]], ['redblack', ['red', 'black']], ['oddeven', ['odd', 'even']], ['lowhigh', ['low', 'high']]]) for (const a of t[1]) L.push({ type: t[0], arg: a });
  return L;
}

/* ---------- спин и расчёт ---------- */
export function spinWheel(rng) { return { n: Math.floor(rng() * POCKETS), hot: 1 + Math.floor(rng() * 36) }; }
const CFG = { hotMult: HOT_MULT, zeroRefund: ZERO_REFUND };
export function betResult(bet, n, hot, cfg = CFG) {
  if (bet.pockets.includes(n)) { const hotHit = n === hot; return { status: 'win', hot: hotHit, ret: bet.stake * (1 + bet.payout * (hotHit ? cfg.hotMult : 1)) }; }
  if (n === 0 && bet.outside) return { status: 'zero-refund', hot: false, ret: bet.stake * cfg.zeroRefund };
  return { status: 'lose', hot: false, ret: 0 };
}
/* выплата с переносом дробной части (как settle в slots-math): {pay (целое), frac} */
export function settle(frac, amount) { const t = (Number(frac) || 0) + (Number(amount) || 0), pay = Math.floor(t + 1e-9); return { pay, frac: Math.max(0, t - pay) }; }
/* bets: массив ставок из makeBet; perks.rouletteRefund возвращает долю проигранных ставок на число (lost straight) */
export function settleSpin(result, bets, perks = {}) {
  const rows = bets.map(b => ({ bet: b, ...betResult(b, result.n, result.hot) }));
  const stake = rows.reduce((a, r) => a + r.bet.stake, 0), ret = rows.reduce((a, r) => a + r.ret, 0);
  const lostStraight = rows.filter(r => r.bet.type === 'straight' && r.status === 'lose').reduce((a, r) => a + r.bet.stake, 0);
  const refund = rouletteRefundAmount(perks, lostStraight);
  return { n: result.n, hot: result.hot, rows, stake, ret, refund, total: ret + refund };
}

/* ---------- точный RTP: перебор 37 исходов шара × 36 горячих карманов ---------- */
export function exactRtp(spec, cfg = CFG) {
  const bet = makeBet(spec.type, spec.arg, 1);
  let s = 0;
  for (let n = 0; n < POCKETS; n++) for (let h = 1; h <= 36; h++) s += betResult(bet, n, h, cfg).ret;
  return 100 * s / (POCKETS * 36);
}
export function exactParts(spec) {
  const base = exactRtp(spec, { hotMult: 1, zeroRefund: 0 }), withZero = exactRtp(spec, { hotMult: 1, zeroRefund: ZERO_REFUND }), full = exactRtp(spec);
  return { base, zero: withZero - base, hot: full - withZero, total: full };
}
export const averageRtp = (specs = DEFAULT_BETS, cfg = CFG) => specs.reduce((a, s) => a + exactRtp(s, cfg), 0) / specs.length;

/* ---------- калибровка: node tools/apply-casino.mjs --calibrate [--rounds=N] [--seed=N] ----------
   Крутит n спинов; на каждом спине ставится по 1 на каждую ставку DEFAULT_BETS. Сравнивает RTP моделирования с точным значением.
   По умолчанию 6 000 000 спинов. Ничего не пишет. */
export function calibrateRoulette(n = 6_000_000, opts = {}) {
  const seed = opts.seed ?? 20261022, target = opts.target ?? RTP_TARGET, out = opts.log ?? console.log, specs = opts.bets ?? DEFAULT_BETS;
  const rng = mulberry32(seed >>> 0), bets = specs.map(s => makeBet(s.type, s.arg, 1));
  const pad = (s, k) => String(s).padStart(k), f2 = x => x.toFixed(2);
  const sum = bets.map(() => 0), sq = bets.map(() => 0), hits = bets.map(() => 0), t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const { n: ball, hot } = spinWheel(rng);
    for (let k = 0; k < bets.length; k++) { const r = betResult(bets[k], ball, hot); sum[k] += r.ret; sq[k] += r.ret * r.ret; if (r.status === 'win') hits[k]++; }
  }
  out('Калибровка рулетки · ' + n.toLocaleString('ru-RU') + ' спинов · seed ' + seed + ' · зеро возвращает ' + ZERO_REFUND * 100 + '% внешних ставок · горячее ×' + HOT_MULT);
  out(pad('ставка', 18) + pad('точно%', 9) + pad('модель%', 10) + pad('±95%', 8) + pad('hit%', 8) + pad('база', 8) + pad('зеро', 7) + pad('горячее', 9) + '  сверка');
  let simAvg = 0, exAvg = 0, bad = 0;
  bets.forEach((b, k) => {
    const mean = sum[k] / n, ci = 196 * Math.sqrt(Math.max(0, sq[k] / n - mean * mean) / n), sim = 100 * mean, parts = exactParts(specs[k]), ok = Math.abs(sim - parts.total) <= 1.5 * ci + 1e-9;
    if (!ok) bad++; simAvg += sim / bets.length; exAvg += parts.total / bets.length;
    out(pad(b.type + ' ' + JSON.stringify(b.arg), 18) + pad(f2(parts.total), 9) + pad(f2(sim), 10) + pad(f2(ci), 8) + pad(f2(100 * hits[k] / n), 8) + pad(f2(parts.base), 8) + pad(f2(parts.zero), 7) + pad(f2(parts.hot), 9) + '  ' + (ok ? 'ок' : 'РАСХОЖДЕНИЕ'));
  });
  const ok = simAvg >= target[0] && simAvg <= target[1], mid = (target[0] + target[1]) / 2;
  const noHot = averageRtp(specs, { hotMult: 1, zeroRefund: ZERO_REFUND }), perM = (exAvg - noHot) / (HOT_MULT - 1), hint = perM > 0 ? Math.round((1 + (mid - noHot) / perM) * 100) / 100 : null;
  out('\nСредний RTP по набору: модель ' + f2(simAvg) + '% · точно ' + f2(exAvg) + '% · цель ' + target[0] + '–' + target[1] + '% · ' + (ok ? 'в коридоре' : 'ВНЕ') + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  out('Подсказка: HOT_MULT ≈ ' + hint + ' (сейчас ' + HOT_MULT + '; каждая +1.0 к множителю ≈ +' + f2(perM) + ' п.п. к среднему). Расхождений модели с точным значением: ' + bad + ' из ' + bets.length + ' (допускается 1–2 по статистике).');
  return { n, seed, simAvg, exAvg, ok, hint };
}
