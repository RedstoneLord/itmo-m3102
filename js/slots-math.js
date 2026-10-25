/*
  «Колючий куш» — чистая математика слотов. Без DOM и без Math-генератора: ГСЧ внедряется (crypto или seed).
  Числа RTP/частоты существуют только здесь, в тестах и в tools/slots-tune.mjs — в интерфейсе их нет.
  Допуск по перкам шляп (≤ +0.3% RTP суммарно) проверяется в tests/slots.mjs.
*/
export const SEED_POOL = 500, POOL_RATE = 0.015, /* casino:step9 POOL_RATE 1.5% */ MAX_WIN = 5000, HEAT_MAX = 10, DAILY_BET = 5;
export const BETS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 10000000, 100000000];
export const ROWS = 3, REELS = 5;
export const SYMBOLS = ['berry', 'apple', 'claude', 'mush', 'git', 'orange', 'itmo', 'cpp', 'rust', 'pi', 'hog', 'seven', 'king', 'wild', 'scatter', 'bonus', 'capsule']; /* casino:step2 SYMBOLS — capsule на ленты не ставится: его вставляет injectCapsule */
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [0, 2, 0, 2, 0],
];

// выплаты за 3/4/5 в линии — в долях ставки на линию (общая ставка = 20 линий)
export const PAY = {
  berry: [1, 3, 10], apple: [1, 3, 10], mush: [1.5, 5, 15], git: [1.5, 5, 15],
  orange: [4, 14, 55], cpp: [4, 14, 55], rust: [6, 20, 80], pi: [6, 20, 80],
  hog: [12, 45, 220], king: [30, 150, 800],
  claude: [1.2, 4, 12], itmo: [4.5, 16, 60], seven: [20, 80, 400], /* casino:step2 PAY — провизорно */
};
export const LINE_SCALE = 1.02; /* casino:step9 LINE_SCALE откалиброван под 101–105% */
export const COLUMN_SCALE = 1; // выплата за 3 одинаковых символа в одном барабане = PAY[символ][0] × COLUMN_SCALE (по вертикали)
export const SCATTER_PAY = { 3: 2, 4: 10, 5: 50 };
export const FS_SPINS = { 3: 8, 4: 12, 5: 20 }, FS_RETRIGGER = 5, FS_CAP = 10;
export const WARM_SCALE = 1.08; /* casino:step9 WARM_SCALE откалиброван для коридора 101–105% и стратегии smart player */ // множитель тёплых выигрышей; после изменения символов RTP нужно перекалибровать
export const JP_COEF = 0.008; // шанс розыгрыша джекпота при 3 расширенных Wild = min(1, JP_COEF × ставка)
export const LOSS_X = 1; // выигрыш ≤ LOSS_X × ставки считается проигрышем (жар, множитель фриспинов, уровень празднования)

/* ---------- ГСЧ ---------- */
export function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cryptoRng() {
  const c = globalThis.crypto;
  if (!c || !c.getRandomValues) return mulberry32(Date.now() ^ 0x9e3779b9);
  const buf = new Uint32Array(64);
  let i = 64;
  return () => {
    if (i >= 64) {
      c.getRandomValues(buf);
      i = 0;
    }
    return buf[i++] / 4294967296;
  };
}

const pickW = (rng, weights) => {
  let t = 0;
  for (const w of weights) t += w;
  let r = rng() * t;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
};

/* ---------- ленты барабанов ---------- */
// количества символов на ленте по барабанам; «тёплый» набор — для горячей серии
const COUNTS = {
  cold: [
    { berry: 8, apple: 8, mush: 7, git: 7, orange: 5, cpp: 4, rust: 3, pi: 3, hog: 2, king: 1, scatter: 1, bonus: 3 },
    { berry: 8, apple: 8, mush: 7, git: 6, orange: 5, cpp: 4, rust: 3, pi: 3, hog: 2, king: 1, wild: 1, scatter: 2 },
    { berry: 7, apple: 7, mush: 6, git: 6, orange: 5, cpp: 4, rust: 3, pi: 3, hog: 2, king: 1, wild: 2, scatter: 2, bonus: 3 },
    { berry: 8, apple: 8, mush: 7, git: 6, orange: 5, cpp: 4, rust: 3, pi: 3, hog: 2, king: 1, wild: 1, scatter: 2 },
    { berry: 8, apple: 8, mush: 7, git: 7, orange: 5, cpp: 4, rust: 3, pi: 3, hog: 2, king: 1, scatter: 1, bonus: 3 },
  ],
};

/* casino:step2 COUNTS — провизорно */
// Новые символы: claude (низкий ярус), itmo (средний), seven (между ёжиком и королём). Длина каждой холодной ленты +2.
const NEW_SYMBOL_DELTA = { claude: 3, itmo: 2, seven: 2, berry: -1, apple: -1, git: -1, orange: -1, hog: -1 };
COUNTS.cold = COUNTS.cold.map(c => { const n = { ...c }; for (const [k, d] of Object.entries(NEW_SYMBOL_DELTA)) n[k] = (n[k] || 0) + d; return n; });
// «тёплые» ленты: та же длина и те же Scatter/Bonus/Wild, но меньше крупных символов (seven, rust, pi) — выигрыши чаще и мельче
COUNTS.warm = COUNTS.cold.map(c => ({ ...c, seven: c.seven - 1, rust: c.rust - 1, pi: c.pi - 1, berry: c.berry + 1, apple: c.apple + 1, mush: c.mush + 1 }));COUNTS.fs = COUNTS.cold.map((c, i) => ({
  ...c,
  wild: (c.wild || 0) + (i >= 1 && i <= 3 ? 2 : 0),
  bonus: 0
})); // фриспины: больше Wild

const SPECIAL = new Set(['wild', 'scatter', 'bonus']);

export function buildStrip(counts, seed) {
  const rng = mulberry32(seed), plain = [], special = [];

  for (const sym of SYMBOLS) {
    for (let i = 0; i < (counts[sym] || 0); i++) {
      (SPECIAL.has(sym) ? special : plain).push(sym);
    }
  }

  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  shuffle(plain);
  shuffle(special);

  const L = plain.length + special.length;
  const out = new Array(L).fill(null);

  special.forEach((s, k) => {
    let p = Math.floor((k + 0.5) * L / special.length);
    while (out[p]) p = (p + 1) % L;
    out[p] = s;
  });

  let j = 0;
  for (let i = 0; i < L; i++) {
    if (!out[i]) out[i] = plain[j++];
  }

  return out;
}

export const STRIPS = {
  cold: COUNTS.cold.map((c, i) => buildStrip(c, 1000 + i * 17)),
  warm: COUNTS.warm.map((c, i) => buildStrip(c, 2000 + i * 17)),
  fs: COUNTS.fs.map((c, i) => buildStrip(c, 3000 + i * 17)),
};

/* ---------- вращение и оценка ---------- */
export function spinGrid(rng, set = 'cold') {
  const strips = STRIPS[set], stops = [], raw = [];

  for (let i = 0; i < REELS; i++) {
    const s = strips[i], at = Math.floor(rng() * s.length);
    stops.push(at);
    raw.push([s[at], s[(at + 1) % s.length], s[(at + 2) % s.length]]);
  }

  return { stops, raw };
}

const isLine = s => s !== 'scatter' && s !== 'bonus' && s !== 'capsule'; /* casino:step2 ISLINE */
const countCapsules = raw => raw.reduce((n, col) => n + col.filter(s => s === 'capsule').length, 0);
// пять seven в одном горизонтальном ряду; Wild (в том числе расширенные) засчитываются, но хотя бы один seven обязателен
const sevenRowOf = grid => [0, 1, 2].some(row => grid.every(col => col[row] === 'seven' || col[row] === 'wild') && grid.some(col => col[row] === 'seven'));

// raw: 5×3 символов; mult0 — глобальный множитель (в фриспинах), расширенные Wild добавляют +1 каждый
export function evaluate(raw, mult0 = 1, scale = 1) {
  const grid = raw.map(r => r.slice()), expanded = [];

  for (let i = 1; i <= 3; i++) {
    if (raw[i].includes('wild')) {
      expanded.push(i);
      grid[i] = raw[i].map(s => (isLine(s) ? 'wild' : s));
    }
  }

  const lines = [];
  let units = 0;

  // Серия одинаковых символов (Wild заменяют) на соседних барабанах вдоль линии считается с ЛЮБОГО барабана,
  // а не только с первого. Каждая серия платит один раз: её считают от самого левого барабана,
  // откуда она продолжается (левее нет такого же символа или Wild).
  const runFrom = (cells, s) => {
    let target = '', n = 0;

    for (let i = s; i < cells.length; i++) {
      const sym = cells[i];

      if (!isLine(sym)) break;
      if (sym === 'wild') {
        n++;
        continue;
      }

      if (!target) target = sym;
      else if (sym !== target) break;

      n++;
    }

    return { target, n };
  };

  for (let li = 0; li < LINES.length; li++) {
    const L = LINES[li], cells = L.map((row, i) => grid[i][row]);

    for (let s = 0; s <= REELS - 3; s++) {
      const { target, n } = runFrom(cells, s);
      if (!target || n < 3) continue;

      const left = s > 0 ? cells[s - 1] : null;

      if (left && isLine(left) && (left === 'wild' || left === target)) {
        continue;
      }

      const pay = PAY[target][n - 3] * LINE_SCALE * scale;
      units += pay;

      lines.push({
        line: li,
        start: s,
        sym: target,
        count: n,
        pay: pay / 20,
        cells: L.slice(s, s + n).map((row, k) => [s + k, row])
      });
    }
  }

  // Вертикаль: три одинаковых символа в одном барабане (Wild заменяют; барабан только из Wild не платит)
  for (let r = 0; r < REELS; r++) {
    const col = grid[r];
    let target = '', ok = col.every(isLine);

    for (const s of col) {
      if (!ok) break;
      if (s === 'wild') continue;
      if (!target) target = s;
      else if (s !== target) ok = false;
    }

    if (ok && target) {
      const pay = PAY[target][0] * COLUMN_SCALE * LINE_SCALE * scale;
      units += pay;

      lines.push({
        line: -1,
        col: r,
        sym: target,
        count: 3,
        pay: pay / 20,
        cells: [0, 1, 2].map(row => [r, row])
      });
    }
  }

  lines.sort((x, y) => y.pay - x.pay);

  let scatter = 0;
  const bonusReels = [];

  for (let i = 0; i < REELS; i++) {
    for (const s of raw[i]) {
      if (s === 'scatter') scatter++;
    }
    if (raw[i].includes('bonus')) bonusReels.push(i);
  }

  const scatterPay = SCATTER_PAY[Math.min(scatter, 5)] || 0;
  const mult = mult0 + expanded.length;
  const lineWin = units / 20;
  const total = Math.min(MAX_WIN, lineWin * mult + scatterPay);

  return {
    raw,
    grid,
    expanded,
    lines,
    lineWin,
    scatter,
    scatterPay,
    mult,
    win: total,
    fsSpins: scatter >= 3 ? FS_SPINS[Math.min(scatter, 5)] : 0,
    bonus: [0, 2, 4].every(r => bonusReels.includes(r)), jackpotRoll: expanded.length >= 3, sevenRow: sevenRowOf(grid), capsules: countCapsules(raw) }; /* casino:step2 EVALRET */
}

// розыгрыш джекпота при 3 расширенных Wild: шанс растёт со ставкой
/* casino:step2 JPHIT */
export const JP_SEVEN_COEF = 0.03; // шанс джекпота при пяти seven в ряд = min(1, JP_SEVEN_COEF × ставка); провизорно
export const jackpotHit = (rng, bet, coef = JP_COEF) => rng() < Math.min(1, coef * bet);
// Один бросок на спин: при ряде из seven берётся больший коэффициент, иначе действует старое правило трёх расширенных Wild
export const jackpotTrigger = (rng, res, bet) => Boolean(res.jackpotRoll || res.sevenRow) && jackpotHit(rng, bet, res.sevenRow ? Math.max(JP_SEVEN_COEF, JP_COEF) : JP_COEF);

/* ---------- capsule: бонусный символ-капсула (не лента, а вставка поверх готового экрана) ---------- */
export const CAPSULE_MIN = 0.0013, CAPSULE_MAX = 0.008, CAPSULE_CAP = 0.01, CAPSULE_PERK_CAP = 0.012;
// Шанс на спин: логарифмический рост от ≈0.13% (ставка 1) до ≈0.8% (ставка 1000 и выше); ≤ 1%
export function capsuleChance(bet) {
  const b = Number(bet); if (!(b > 1)) return CAPSULE_MIN;
  return Math.min(CAPSULE_CAP, CAPSULE_MIN + (CAPSULE_MAX - CAPSULE_MIN) * Math.min(1, Math.log10(b) / 3));
}
// Возвращает { raw, capsules, at }: raw — копия с одной перезаписанной обычной ячейкой (не wild/scatter/bonus) либо исходный массив
export function injectCapsule(rng, raw, bet, perks = {}) {
  const mult = Number(perks.capsuleChanceMult) > 0 ? Number(perks.capsuleChanceMult) : 1;
  if (!(rng() < Math.min(CAPSULE_PERK_CAP, capsuleChance(bet) * mult))) return { raw, capsules: 0, at: null };
  const cells = []; raw.forEach((col, r) => col.forEach((s, row) => { if (!SPECIAL.has(s) && s !== 'capsule') cells.push([r, row]); }));
  if (!cells.length) return { raw, capsules: 0, at: null };
  const [r, row] = cells[Math.floor(rng() * cells.length)], out = raw.map(col => col.slice()); out[r][row] = 'capsule';
  return { raw: out, capsules: 1, at: [r, row] };
}

/* ---------- фриспины ---------- */
export const fsStart = (n, perks = {}) => ({
  left: n,
  mult: 1,
  total: 0,
  played: 0,
  cap: FS_CAP + (perks.foil ? 1 : 0),
  retriggers: 0
});

// один фриспин; ходит по тем же лентам; множитель растёт на 1 после каждого выигрышного спина
export function fsStep(rng, fs) {
  const { raw } = spinGrid(rng, 'fs'), res = evaluate(raw, fs.mult);
  const win = Math.min(MAX_WIN - fs.total, res.win);

  fs.total += win;
  fs.played++;
  fs.left--;

  if (res.scatter >= 3) {
    fs.left += FS_RETRIGGER;
    fs.retriggers++;
  }

  const startMult = fs.mult;
  if (res.win > LOSS_X) fs.mult = Math.min(fs.cap, fs.mult + 1);

  return { res, win, startMult, mult: fs.mult, done: fs.left <= 0 };
}

/* ---------- бонус «Ягодная поляна» ---------- */
export const PICK_PRIZES = [1, 1, 2, 2, 3, 4, 5, 8, 10, 15];
export const PICK_GOLD = 0.004; // шанс, что на поляне есть золотой куст (джекпот)

export function pickInit(rng, perks = {}) {
  const cells = ['segfault', 'extra', 'extra', 'm2', 'm3'];
  const prizes = PICK_PRIZES.slice();

  for (let i = prizes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
  }

  while (cells.length < 12) cells.push('p' + prizes[cells.length - 5]);
  if (rng() < PICK_GOLD) cells[5 + Math.floor(rng() * 7)] = 'gold';

  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return {
    cells,
    revealed: [],
    picks: 3,
    wz: Boolean(perks.wizard),
    prizes: 0,
    mult: 1,
    over: false,
    jackpot: false,
    segfault: false
  };
}

// Колпак мага: один дополнительный «магический» куст с небольшим призом (в RTP это ≈ +0.15%)
export const WIZARD_PRIZE = 0.3;

export function pickWizard(g) {
  if (!g.wz || g.segfault || g.jackpot) return null;
  g.wz = false;
  g.prizes += WIZARD_PRIZE;
  return WIZARD_PRIZE;
}

export const pickTotal = g => Math.min(MAX_WIN, g.prizes * g.mult);

export function pickReveal(g, idx) {
  if (g.over || g.revealed.includes(idx)) return null;

  const c = g.cells[idx];
  g.revealed.push(idx);
  g.picks--;

  if (c === 'segfault') {
    g.segfault = true;
    g.over = true;
  } else if (c === 'extra') {
    g.picks++;
  } else if (c === 'm2') {
    g.mult *= 2;
  } else if (c === 'm3') {
    g.mult *= 3;
  } else if (c === 'gold') {
    g.jackpot = true;
    g.over = true;
  } else {
    g.prizes += Number(c.slice(1));
  }

  if (g.picks <= 0 || g.revealed.length >= g.cells.length) g.over = true;
  return c;
}

/* ---------- расчёт в целых ягодах с переносом дробной части ---------- */
export function settle(frac, amount) {
  const raw = amount + frac;
  const whole = Math.floor(raw + 1e-9);
  return { whole, frac: Math.max(0, raw - whole) };
}

/* ---------- состояние и один платный/бесплатный спин ---------- */
export function newSlotsState() {
  return {
    v: 1,
    streak: 0,
    lastDay: '',
    free: 0,
    heat: 0,
    pool: SEED_POOL,
    frac: 0,
    sinceEpic: 0,
    capsules: 0,
    album: {},
    ach: {},
    stats: {
      spins: 0,
      wagered: 0,
      won: 0,
      biggest: 0,
      fs: 0,
      picks: 0,
      jackpots: 0,
      gambles: 0,
      gambleWins: 0,
      poked: 0, capsuleSyms: 0 /* casino:step2 STATS */
    },
    breakUntil: 0,
    wheelDay: '',
    title: '',
    theme: 'forest',
    hist: [], equip: {} /* casino:step3 EQUIP */
  };
}

// Базовый спин. S: {heat, pool}; paid=false для бесплатных (не питает пул и не копит «жар»)
export function baseSpin(rng, S, bet, { paid = true, perks = {} } = {}) { /* casino:step2 BASESIG */
  const warm = paid && S.heat >= HEAT_MAX;
  if (paid) S.pool += POOL_RATE * bet;

  const spun = spinGrid(rng, warm ? 'warm' : 'cold'), stops = spun.stops, inj = injectCapsule(rng, spun.raw, bet, perks), res = evaluate(inj.raw, 1, warm ? WARM_SCALE : 1); res.capsuleAt = inj.at; /* casino:step2 BASESPIN */

  res.stops = stops;
  res.warm = warm;
  res.jackpot = 0;

  if (jackpotTrigger(rng, res, bet)) { res.jackpot = S.pool; S.pool = SEED_POOL; } /* casino:step2 BASEJP */

  if (paid) S.heat = warm ? 0 : (res.win > LOSS_X ? 0 : S.heat + 1);
  return res;
}

// Полный раунд: база + фриспины + поляна + джекпот. Возвращает выигрыш в ягодах и трассу для анимации
// (интерфейс получает весь результат заранее, поэтому обновление страницы посреди бонуса ничего не отнимает).
export function rollRound(rng, S, bet, perks = {}, opts = {}) {
  const res = baseSpin(rng, S, bet, { ...opts, perks }), parts = { base: res.win * bet, fs: 0, pick: 0, jp: res.jackpot, fsN: 0, capsules: res.capsules | 0 }, trace = { res, fsSteps: [], fs: null, pick: null, pickJp: 0, capsules: res.capsules | 0, capsuleAt: res.capsuleAt || null }; /* casino:step2 ROLLROUND */

  if (res.fsSpins) {
    const fs = fsStart(res.fsSpins, perks);
    parts.fsN = res.fsSpins;

    while (fs.left > 0) {
      const st = fsStep(rng, fs);
      let jp = 0;

      if (jackpotTrigger(rng, st.res, bet) /* casino:step2 FSJP */) {
        jp = S.pool;
        parts.jp += jp;
        S.pool = SEED_POOL;
      }

      trace.fsSteps.push({ ...st, jp, left: fs.left, total: fs.total });
    }

    parts.fs = Math.min(MAX_WIN, fs.total) * bet;
    trace.fs = fs;
  }

  if (res.bonus) {
    const g = pickInit(rng, perks), seq = [];
    let k = 0;

    while (!g.over) {
      pickReveal(g, k);
      seq.push(g.cells[k]);
      k++;
    }

    const wz = pickWizard(g);
    parts.pick = pickTotal(g) * bet;

    if (g.jackpot) {
      trace.pickJp = S.pool;
      parts.jp += S.pool;
      S.pool = SEED_POOL;
    }

    trace.pick = { g, seq, wz, total: pickTotal(g) };
  }

  if (parts.capsules) { S.capsules = (S.capsules | 0) + parts.capsules; S.stats.capsuleSyms = (S.stats.capsuleSyms | 0) + parts.capsules; } /* casino:step2 TOTAL: капсулы-символы только в базовом спине */
  { const pk = 1 + Math.min(PERK_CAPS.payoutPct, Math.max(0, Number(perks.payoutPct) || 0)) / 100; /* casino:step3 PAYOUT */
    if (pk > 1) { res.win = Math.min(MAX_WIN, res.win * pk); parts.base = res.win * bet; parts.fs = Math.min(MAX_WIN * bet, parts.fs * pk); parts.pick = Math.min(MAX_WIN * bet, parts.pick * pk); } }
  parts.total = parts.base + parts.fs + parts.pick + parts.jp;
  return { res, parts, won: parts.total, trace };
}

export const playRound = rollRound;

/* ---------- «Удвоить или ничего» ---------- */
export const GAMBLE_MAX_ROUNDS = 3, GAMBLE_MAX_X = 25;
export const gambleAllowed = (winBerries, bet, round) =>
  winBerries > 0 && winBerries <= GAMBLE_MAX_X * bet && round < GAMBLE_MAX_ROUNDS;

export function gambleRound(rng, choice) {
  const card = rng() < 0.5 ? 'red' : 'black';
  return { card, won: card === choice };
}

/* ---------- ежедневные спины ---------- */
export const DAILY_SPINS = [1, 1, 2, 2, 3, 3, 5];

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDay = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  x.setDate(x.getDate() + n);
  return x;
};

export function dailyPreview(S, now = new Date()) {
  const today = dayKey(now);
  const can = S.lastDay !== today;
  const streak = S.lastDay === dayKey(addDay(now, -1)) ? (S.streak % 7) + 1 : 1;
  return { can, streak: can ? streak : S.streak, today };
}

// perks.crown: +1 спин на 7-й день. Возвращает null, если сегодня уже забрано
export function dailyClaim(S, now = new Date(), perks = {}) {
  const p = dailyPreview(S, now);
  if (!p.can) return null;

  const spins = DAILY_SPINS[p.streak - 1] + (perks.crown && p.streak === 7 ? 1 : 0) + Math.min(PERK_CAPS.dailyExtra, Math.max(0, Math.floor(Number(perks.dailyExtra) || 0))) /* casino:step3 DAILY */, capsule = p.streak === 7;

  S.streak = p.streak;
  S.lastDay = p.today;
  S.free += spins;
  if (capsule) S.capsules++;

  return { spins, capsule, streak: p.streak };
}

// доступно ли колесо: нужны все 3 цели дня ёжика и неиспользованный день
export const wheelReady = (S, hhSave, now = new Date()) => {
  const d = hhSave && hhSave.daily;
  return Boolean(
    d &&
    d.date === dayKey(now) &&
    Array.isArray(d.goals) &&
    d.goals.length >= 3 &&
    d.goals.every(g => g.done) &&
    S.wheelDay !== dayKey(now)
  );
};

export const WHEEL = [
  { k: 'b', v: 5, w: 26 },
  { k: 'b', v: 10, w: 22 },
  { k: 'b', v: 15, w: 14 },
  { k: 'cap', w: 9 },
  { k: 'b', v: 25, w: 10 },
  { k: 'spin', w: 8 },
  { k: 'b', v: 50, w: 5 },
  { k: 'b', v: 10, w: 20 },
  { k: 'cap', w: 4 },
  { k: 'b', v: 100, w: 2 },
];

export const wheelPick = rng => pickW(rng, WHEEL.map(s => s.w));

/* ---------- альбом и капсулы ---------- */
export const RARITY = {
  common: { name: 'Обычная', dup: 10, w: 60 },
  rare: { name: 'Редкая', dup: 30, w: 28 },
  epic: { name: 'Эпическая', dup: 80, w: 10 },
  legendary: { name: 'Легендарная', dup: 250, w: 2 }
};

export const PITY_CAPSULES = 12;

const it = (id, kind, name, rarity, desc, setOnly = false) => ({
  id, kind, name, rarity, desc, setOnly
});

export const CATALOG = [
  it('hat:itmocap', 'hat', 'Кепка студента ИТМО', 'rare', 'Игра: сонливость растёт на 15% медленнее'),
  it('hat:goldtop', 'hat', 'Золотой цилиндр', 'epic', 'Игра: ягоды дают вдвое больше очков трюков'),
  it('hat:crabgear', 'hat', 'Шлем краба-шестерёнки', 'epic', 'Игра: старт со щитом и 3 секунды неуязвимости'),
  it('hat:orangepeel', 'hat', 'Апельсиновая кожура', 'common', 'Игра: яблоки бодрят сильнее'),
  it('hat:cpphelm', 'hat', 'Шлем C++', 'rare', 'Игра: быстрее старт и короткий буст'),
  it('hat:foilpro', 'hat', 'Фольга-ПРО', 'legendary', 'Игра: бонусы действуют вдвое дольше'),
  it('pal:gold', 'palette', 'Палитра «Золото»', 'epic', 'Цвета сайта в настройках'),
  it('pal:neon', 'palette', 'Палитра «Неон»', 'epic', 'Цвета сайта в настройках'),
  it('pal:aurora', 'palette', 'Палитра «Аврора»', 'legendary', 'Цвета сайта в настройках'),
  it('greet:cat', 'greeting', 'Пак «Кошачий»', 'common', 'Две новые шутки на главной'),
  it('greet:rust', 'greeting', 'Пак «Растаманский»', 'common', 'Две новые шутки на главной'),
  it('greet:matan', 'greeting', 'Пак «Матан»', 'rare', 'Две новые шутки на главной'),
  it('greet:orange', 'greeting', 'Пак «Апельсиновый»', 'rare', 'Две новые шутки на главной'),
  it('greet:casino', 'greeting', 'Пак «Казино»', 'rare', 'Две новые шутки на главной'),
  it('boost:shield', 'boost', 'Бонус: щит на старт', 'common', 'Расходуется в начале забега'),
  it('boost:coffee', 'boost', 'Бонус: кофе на старт', 'common', 'Расходуется в начале забега'),
  it('boost:magnet', 'boost', 'Бонус: магнит на старт', 'common', 'Расходуется в начале забега'),
  it('boost:berrystart', 'boost', 'Бонус: «Ягодный старт»', 'rare', '+25% ягод за один забег'),
  it('title:newbie', 'title', 'Титул: Новичок казино', 'common', 'Рядом с именем на странице'),
  it('title:thorn', 'title', 'Титул: Колючий игрок', 'rare', 'Рядом с именем на странице'),
  it('title:master', 'title', 'Титул: Мастер-теорема', 'rare', 'Рядом с именем на странице'),
  it('title:orange', 'title', 'Титул: Вы Апельсин?', 'epic', 'Рядом с именем на странице'),
  it('title:king', 'title', 'Титул: Король ёжиков', 'legendary', 'Рядом с именем на странице'),
  it('title:hats', 'title', 'Титул: Шляпный мастер', 'epic', 'Награда за полный набор шляп', true),
  it('theme:forest', 'theme', 'Тема барабанов: Лес', 'common', 'Рамка автомата'),
  it('theme:night', 'theme', 'Тема барабанов: Звёздная ночь', 'rare', 'Рамка автомата'),
  it('theme:server', 'theme', 'Тема барабанов: Серверная', 'epic', 'Рамка автомата'),
  /* casino:step3 CATALOG — 23 новых предмета: 12 обычных, 6 редких, 3 эпических, 2 легендарных */
  it('hat:luckyseven', 'hat', 'Шляпа счастливой семёрки', 'legendary', 'Игра: каждая седьмая ягода забега — двойная'),
  it('pal:graphite', 'palette', 'Палитра «Графит»', 'common', 'Цвета сайта в настройках'),
  it('pal:sakura', 'palette', 'Палитра «Сакура»', 'rare', 'Цвета сайта в настройках'),
  it('pal:ruby', 'palette', 'Палитра «Рубин»', 'rare', 'Цвета сайта в настройках'),
  it('pal:tropic', 'palette', 'Палитра «Тропики»', 'epic', 'Цвета сайта в настройках'),
  it('greet:linux', 'greeting', 'Пак «Линуксоид»', 'common', 'Две новые шутки на главной'),
  it('greet:deadline', 'greeting', 'Пак «Дедлайн»', 'common', 'Две новые шутки на главной'),
  it('greet:sleep', 'greeting', 'Пак «Недосып»', 'common', 'Две новые шутки на главной'),
  it('greet:algo', 'greeting', 'Пак «Алгоритмы»', 'rare', 'Две новые шутки на главной'),
  it('theme:velvet', 'theme', 'Тема барабанов: Бархат', 'common', 'Рамка автомата'),
  it('theme:arcade', 'theme', 'Тема барабанов: Аркада', 'rare', 'Рамка автомата'),
  it('theme:vault', 'theme', 'Тема барабанов: Хранилище', 'epic', 'Рамка автомата'),
  it('title:lucky', 'title', 'Титул: Везунчик', 'common', 'Эффект: +0,3% к выплатам слотов'),
  it('title:patient', 'title', 'Титул: Терпеливый', 'common', 'Эффект: эпическая капсула гарантирована на одну капсулу раньше'),
  it('title:early', 'title', 'Титул: Ранняя пташка', 'rare', 'Эффект: +1 к ежедневным спинам'),
  it('title:legend', 'title', 'Титул: Легенда зала', 'legendary', 'Эффект: +0,5% к выплатам и +10% к шансу капсулы-символа. Награда за три талисмана', true),
  it('cardback:marked', 'cardback', 'Меченая рубашка', 'rare', 'Эффект: показывает вероятность того, что закрытая карта крупье — десятка'),
  it('chips:berry', 'chips', 'Ягодные фишки', 'common', 'Оформление фишек за столом', true),
  it('felt:burgundy', 'felt', 'Бордовое сукно', 'common', 'Оформление игрового стола', true),
  it('emote:fyr', 'emote', 'Эмоция «Фыр!»', 'common', 'Реплика ёжика за столами казино'),
  it('perkcharm:clover', 'perkcharm', 'Клевер', 'common', 'Эффект: +15% к шансу капсулы-символа'),
  it('perkcharm:horseshoe', 'perkcharm', 'Подкова', 'common', 'Эффект: рулетка возвращает 10% проигранной ставки на число'),
  it('perkcharm:ace', 'perkcharm', 'Туз в рукаве', 'epic', 'Эффект: блэкджек платит 3:2 за 21 из трёх карт'),
  /* content-pack: +25 предметов (5 рубашек, 5 фишек, 5 сукон, 5 эмоций, 5 талисманов) */
  it('cardback:hedgehog', 'cardback', 'Рубашка «Ёжик»', 'common', 'Оформление рубашки карт: тёплые колючки'),
  it('cardback:circuit', 'cardback', 'Рубашка «Плата»', 'common', 'Оформление рубашки карт: зелёные дорожки'),
  it('cardback:orange', 'cardback', 'Апельсиновая рубашка', 'rare', 'Оформление рубашки карт. Вы Апельсин?'),
  it('cardback:starry', 'cardback', 'Звёздная рубашка', 'rare', 'Оформление рубашки карт: ночное небо'),
  it('cardback:gilded', 'cardback', 'Золочёная рубашка', 'epic', 'Оформление рубашки карт: золотая сетка'),
  it('chips:gold', 'chips', 'Золотые фишки', 'rare', 'Эффект: +0,1% к выплатам слотов'),
  it('chips:neon', 'chips', 'Неоновые фишки', 'rare', 'Эффект: +5% к шансу капсулы-символа'),
  it('chips:ice', 'chips', 'Ледяные фишки', 'common', 'Эффект: рулетка возвращает ещё 3% проигранной ставки на число'),
  it('chips:mint', 'chips', 'Мятные фишки', 'common', 'Эффект: 21 из трёх карт в блэкджеке платит +0,1 ставки'),
  it('chips:rainbow', 'chips', 'Радужные фишки', 'epic', 'Эффект: +0,15% к выплатам слотов и +3% к шансу капсулы-символа'),
  it('felt:midnight', 'felt', 'Полуночное сукно', 'common', 'Оформление игрового стола'),
  it('felt:sand', 'felt', 'Песчаное сукно', 'common', 'Оформление игрового стола'),
  it('felt:royal', 'felt', 'Королевское сукно', 'rare', 'Оформление игрового стола'),
  it('felt:emerald', 'felt', 'Изумрудное сукно', 'rare', 'Оформление игрового стола'),
  it('felt:aurora', 'felt', 'Сукно «Аврора»', 'epic', 'Оформление игрового стола'),
  it('emote:meow', 'emote', 'Эмоция «Мяу»', 'common', 'Реплика ёжика за столами казино'),
  it('emote:cheer', 'emote', 'Эмоция «Ура!»', 'common', 'Реплика ёжика за столами казино'),
  it('emote:think', 'emote', 'Эмоция «Хм…»', 'common', 'Реплика ёжика за столами казино'),
  it('emote:cmon', 'emote', 'Эмоция «Ну давай!»', 'rare', 'Реплика ёжика за столами казино'),
  it('emote:flip', 'emote', 'Эмоция «Кувырок»', 'epic', 'Реплика ёжика за столами казино'),
  it('perkcharm:rabbit', 'perkcharm', 'Заячья лапка', 'common', 'Эффект: +10% к шансу капсулы-символа'),
  it('perkcharm:coin', 'perkcharm', 'Счастливая монета', 'common', 'Эффект: +0,2% к выплатам слотов'),
  it('perkcharm:crystal', 'perkcharm', 'Хрустальный шар', 'rare', 'Эффект: «Удвоить или ничего» показывает 2 прошлые карты'),
  it('perkcharm:lantern', 'perkcharm', 'Фонарик', 'rare', 'Эффект: эпическая капсула гарантирована на одну капсулу раньше'),
  it('perkcharm:ladybug', 'perkcharm', 'Божья коровка', 'epic', 'Эффект: +1 к ежедневным спинам'),
];

export const ITEM = Object.fromEntries(CATALOG.map(x => [x.id, x]));
export const FREE_ITEMS = ['theme:forest', 'title:newbie', 'chips:berry', 'felt:burgundy']; /* casino:step3 FREE — стартовые фишки и сукно */ // выдаются сразу

// плата за набор: все 6 шляп → титул (выдаётся интерфейсом через grantSets)
export const SETS = [{ reward: 'title:hats', need: () => HAT_SET }, { reward: 'title:legend', need: () => CHARM_SET }]; /* casino:step3 SETS */
export const grantSets = S => { const got = []; for (const set of SETS) { if (!S.album[set.reward] && set.need().every(id => S.album[id])) { S.album[set.reward] = 1; got.push(set.reward); } } return got; };

export const HAT_SET = CATALOG.filter(x => x.kind === 'hat').map(x => x.id);
export const CHARM_SET = ['perkcharm:clover', 'perkcharm:horseshoe', 'perkcharm:ace']; /* casino:step3 CHARM_SET */
export const albumProgress = S => ({
  have: CATALOG.filter(x => (S && S.album && S.album[x.id]) || FREE_ITEMS.includes(x.id)).length,
  total: CATALOG.length
});

/* casino:step3 PERKS ---------- перки предметов: один центральный объект с жёсткими потолками ---------- */
export const EQUIP_KINDS = ['cardback', 'chips', 'felt', 'emote', 'perkcharm'];
export const EQUIPPABLE = ['title', 'theme', ...EQUIP_KINDS]; // что можно «надеть» (по одному на вид)
export const PERK_CAPS = { payoutPct: 2.0, dailyExtra: 2, pityShift: 4, capsuleChanceMult: 1.5, gambleHint: 5, bjBonus: 0.5, rouletteRefund: 0.25 };
export const PITY_MIN = 6;
// Эффекты предметов; действуют только надетые (титул, рубашка, фишки, сукно, эмоция, талисман)
export const ITEM_PERKS = {
  'title:lucky': { payoutPct: 0.3 },
  'title:patient': { pityShift: 1 },
  'title:early': { dailyExtra: 1 },
  'title:legend': { payoutPct: 0.5, capsuleChanceMult: 1.1 },
  'cardback:marked': { gambleHint: 3 },
  'perkcharm:clover': { capsuleChanceMult: 1.15 },
  'perkcharm:horseshoe': { rouletteRefund: 0.1 },
  'perkcharm:ace': { bjBonus: 0.5 },
  /* content-pack */
  'chips:gold': { payoutPct: 0.1 },
  'chips:neon': { capsuleChanceMult: 1.05 },
  'chips:ice': { rouletteRefund: 0.03 },
  'chips:mint': { bjBonus: 0.1 },
  'chips:rainbow': { payoutPct: 0.15, capsuleChanceMult: 1.03 },
  'perkcharm:rabbit': { capsuleChanceMult: 1.1 },
  'perkcharm:coin': { payoutPct: 0.2 },
  'perkcharm:crystal': { gambleHint: 2 },
  'perkcharm:lantern': { pityShift: 1 },
  'perkcharm:ladybug': { dailyExtra: 1 },
};
export function clampPerks(p = {}) {
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d), C = PERK_CAPS;
  return { ...p,
    payoutPct: Math.min(C.payoutPct, Math.max(0, num(p.payoutPct))),
    dailyExtra: Math.min(C.dailyExtra, Math.max(0, Math.floor(num(p.dailyExtra)))),
    pityShift: Math.min(C.pityShift, Math.max(0, Math.floor(num(p.pityShift)))),
    capsuleChanceMult: Math.min(C.capsuleChanceMult, Math.max(1, num(p.capsuleChanceMult, 1))),
    gambleHint: Math.min(C.gambleHint, Math.max(0, Math.floor(num(p.gambleHint)))),
    bjBonus: Math.min(C.bjBonus, Math.max(0, num(p.bjBonus))),
    rouletteRefund: Math.min(C.rouletteRefund, Math.max(0, num(p.rouletteRefund))) };
}
// id надетых и при этом имеющихся в альбоме предметов
export function equippedIds(S) {
  S = S || {}; const album = S.album || {}, eq = S.equip || {}, out = [];
  if (S.title && (album[S.title] || FREE_ITEMS.includes(S.title))) out.push(S.title);
  for (const k of EQUIP_KINDS) { const id = eq[k]; if (id && (album[id] || FREE_ITEMS.includes(id)) && ITEM[id] && ITEM[id].kind === k) out.push(id); }
  return out;
}
// S — состояние слотов, H — общее сохранение (шляпа). Вызывается без S — вернёт только перки шляпы
export function activePerks(S, H) {
  H = H || {}; const ids = equippedIds(S), hat = H.hat;
  const p = { wizard: hat === 'wizard', crown: hat === 'crown', foil: hat === 'foil', halo: hat === 'halo', luckyseven: hat === 'luckyseven',
    payoutPct: 0, dailyExtra: 0, pityShift: 0, capsuleChanceMult: 1, gambleHint: 0, bjBonus: 0, rouletteRefund: 0, sources: ids };
  for (const id of ids) {
    const e = ITEM_PERKS[id]; if (!e) continue;
    p.payoutPct += e.payoutPct || 0; p.dailyExtra += e.dailyExtra || 0; p.pityShift += e.pityShift || 0;
    p.capsuleChanceMult *= e.capsuleChanceMult || 1; p.gambleHint = Math.max(p.gambleHint, e.gambleHint || 0);
    p.bjBonus += e.bjBonus || 0; p.rouletteRefund += e.rouletteRefund || 0;
  }
  if (p.halo) p.gambleHint = Math.max(p.gambleHint, 5);
  return clampPerks(p);
}
export function equipItem(S, id) {
  const x = ITEM[id];
  const owned = (S && S.album && S.album[id]) || FREE_ITEMS.includes(id);
  if (!x || !owned) return false;
  if (x.kind === 'title') S.title = id; else if (x.kind === 'theme') S.theme = id;
  else if (EQUIP_KINDS.includes(x.kind)) (S.equip || (S.equip = {}))[x.kind] = id; else return false;
  return true;
}
export const isEquipped = (S, id) => { const x = ITEM[id]; return Boolean(x) && (x.kind === 'title' ? S.title === id : x.kind === 'theme' ? S.theme === id : Boolean(S.equip) && S.equip[x.kind] === id); };
// капсулы: эпик гарантирован не позже pityOf(perks)-й капсулы без него
export const pityOf = perks => Math.max(PITY_MIN, PITY_CAPSULES - Math.min(PERK_CAPS.pityShift, Math.max(0, Math.floor(Number(perks && perks.pityShift) || 0))));
// блэкджек: надбавка к ставке за 21 из ровно трёх карт без натурала (обычно 1:1, с талисманом 3:2 → +0.5 ставки). Дроби — через settle()
export const bjExtra = (perks, bet, { total, cards, natural = false } = {}) => (total === 21 && cards === 3 && !natural ? bet * Math.min(PERK_CAPS.bjBonus, Math.max(0, Number(perks && perks.bjBonus) || 0)) : 0);
// рулетка: возврат доли проигранной ставки НА ОДНО ЧИСЛО (straight-up); вызывающий применяет только к проигранным прямым ставкам
export const rouletteRefundAmount = (perks, lostStraightStake) => Math.max(0, Number(lostStraightStake) || 0) * Math.min(PERK_CAPS.rouletteRefund, Math.max(0, Number(perks && perks.rouletteRefund) || 0));


// Открывает одну капсулу; меняет S.album/S.sinceEpic. Возвращает {item, dup, berries}
export function openCapsule(rng, S, perks = {}) { /* casino:step3 OC-SIG */
  const rar = ['common', 'rare', 'epic', 'legendary'];

  let r = S.sinceEpic >= pityOf(perks) /* casino:step3 OC-PITY */ ? 2 + pickW(rng, [RARITY.epic.w, RARITY.legendary.w])
    : pickW(rng, rar.map(k => RARITY[k].w));

  const pool = CATALOG.filter(x => x.rarity === rar[r] && !x.setOnly);
  const item = pool[Math.floor(rng() * pool.length)];

  S.sinceEpic = r >= 2 ? 0 : S.sinceEpic + 1;

  const had = S.album[item.id] || 0;
  const dup = had > 0 && item.kind !== 'boost';
  S.album[item.id] = had + 1;

  return { item, dup, berries: dup ? RARITY[item.rarity].dup : 0 };
}

/* ---------- контрольные суммы (лёгкая защита от случайных правок, не криптография) ---------- */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const stable = v => (
  Array.isArray(v)
    ? '[' + v.map(stable).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
      : JSON.stringify(v)
);

const SALT = 'kolyuchiy-kush-v1';

export const signSlots = S => {
  const { sig, ...rest } = S;
  return cyrb53(SALT + stable(rest), 1);
};

export const signShared = save =>
  cyrb53(
    SALT + stable({
      b: Math.max(0, Math.floor(Number(save.berries) || 0)),
      o: [...(save.owned || [])].sort(),
      s: save.bonusSpins | 0,
      x: save.boosts || {}
    }),
    2
  );

// ok — подпись верна; legacy — подписи ещё нет (принимаем и подписываем); bad — данные правили руками
export const checkSlots = S => (!S.sig ? 'legacy' : S.sig === signSlots(S) ? 'ok' : 'bad');
export const checkShared = save => (!save.bsig ? 'legacy' : save.bsig === signShared(save) ? 'ok' : 'bad');

/* ---------- мелочи для интерфейса ---------- */
export const payMult = (sym, n) => (PAY[sym][n - 3] * LINE_SCALE) / 20; // для таблицы выплат: доля общей ставки за линию
export const winTier = x => (x >= 100 ? 'epic' : x >= 40 ? 'mega' : x >= 15 ? 'big' : x >= 5 ? 'good' : x > LOSS_X ? 'small' : 'none');

// плашка на старте игры «Ёжик»: сколько бесплатных спинов ждёт
export function slotsChipText(save, rawSlots, now = new Date()) {
  let S = null;
  try {
    S = rawSlots ? JSON.parse(rawSlots) : null;
  } catch {
    S = null;
  }

  const free = (save.bonusSpins | 0) + (S ? S.free | 0 : 0);
  const daily = !S || S.lastDay !== dayKey(now);

  return daily
    ? 'ежедневный спин готов'
    : free > 0
      ? `${free} бесплатных`
      : wheelReady(S || newSlotsState(), save, now)
        ? 'колесо заряжено'
        : '';
}
