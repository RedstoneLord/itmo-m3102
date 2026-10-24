/*
  Общий модуль казино: константы и сохранение (перенесены из slots.js без изменений), HUD, шаги ставок,
  глобальный перерыв, баланс, звук, награды, таймеры и частицы. Без DOM при импорте (грузится и в Node).
  Состояние — в существующих подписанных объектах: S = m3102-slots-v1 (signSlots), H = hh_save_v1 (signShared).
*/
import * as M from './slots-math.js';
import { makeSlotsAudio } from './slots-audio.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const KEY = 'm3102-slots-v1', SNAP = 'm3102-slots-snap-v1', HHK = 'hh_save_v1';
export const CANCEL = Symbol('cancel');
export const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmt = n => Math.round(n).toLocaleString('ru-RU');
export const readJson = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
export const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const KIND_EMOJI = { cardback: '🂠', chips: '⚪', felt: '🟩', emote: '🦔', perkcharm: '🍀', /* casino:step3 KIND_EMOJI */ hat: '🎩', palette: '🎨', greeting: '💬', boost: '🎁', title: '🏅', theme: '🖼' };
export const KIND_NAME = { cardback: 'Рубашки карт', chips: 'Фишки', felt: 'Сукно столов', emote: 'Эмоции ёжика', perkcharm: 'Талисманы', /* casino:step3 KIND_NAME */ hat: 'Шляпы', palette: 'Палитры', greeting: 'Шутки на главной', boost: 'Бонусы в забег', title: 'Титулы', theme: 'Темы барабанов' };
export const THEME_CLASS = { 'theme:velvet': 'th-velvet', 'theme:arcade': 'th-arcade', 'theme:vault': 'th-vault', /* casino:step3 THEME_CLASS */ 'theme:forest': 'th-forest', 'theme:night': 'th-night', 'theme:server': 'th-server' };

export const ACH = [
  { id: 'five_hogs', name: '5 ёжиков в линию', desc: 'Собери пять ёжиков (или королей) на одной линии' },
  { id: 'segfault', name: 'Сегфолт', desc: 'Попади на Сегфолт с первой попытки в «Ягодной поляне»' },
  { id: 'orange_king', name: 'Апельсиновый король', desc: 'Пять апельсинов на одной линии. Вы Апельсин?' },
  { id: 'dont_poke', name: 'Не тыкай ёжика', desc: 'Потыкай ёжика на шапке страницы 25 раз' },
  { id: 'exact42', name: 'Ровно 42', desc: 'Выиграй за раунд ровно 42 🍓' },
  { id: 'heat', name: 'Горячая серия', desc: 'Дождись «тёплого» спина после череды неудач' },
  { id: 'foil', name: 'Фольга спасла', desc: 'Выиграй от 10× ставки в шапочке из фольги' },
  { id: 'meow', name: 'Мяу', desc: 'Забери ежедневный спин 7 дней подряд' },
  { id: 'jackpot', name: 'Первый джекпот', desc: 'Сорви джекпот. Теорема Кантора одобряет' },
  { id: 'collector', name: 'Коллекционер', desc: 'Собери половину альбома' },
  { id: 'full', name: 'Целый альбом', desc: 'Собери все предметы альбома' },
  { id: 'first_fs', name: 'Фриспины!', desc: 'Запусти бесплатные вращения' },
  { id: 'big100', name: 'Эпический куш', desc: 'Выиграй за раунд от 100× ставки' },
  { id: 'picker', name: 'Ягодный сборщик', desc: 'Набери в поляне от 20× ставки' },
  /* casino:step3 ACH — достижения нового контента; bj_win и roulette_straight выдаёт шаг 6/8 */
  { id: 'five_claude', name: 'Умный помощник', desc: 'Собери пять символов Claude на одной линии' },
  { id: 'five_itmo', name: 'Студент ИТМО', desc: 'Собери пять символов ИТМО на одной линии' },
  { id: 'capsule_sym', name: 'Капсула в барабане', desc: 'Поймай символ-капсулу на барабанах' },
  { id: 'seven_row', name: 'Счастливая семёрка', desc: 'Собери пять семёрок в одном ряду' },
  { id: 'bj_win', name: 'Двадцать одно', desc: 'Выиграй раздачу в блэкджек' },
  { id: 'roulette_straight', name: 'Шарик на своём числе', desc: 'Выиграй ставку на одно число в рулетке' },
];

/* ---------- загрузка и сохранение (с лёгкой защитой от случайных правок) ---------- */
export function loadAll() {
  const notes = [], snap = readJson(SNAP) || {};
  const rawH = readJson(HHK) || {};
  const H = Object.assign({ berries: 0, owned: ['none'], hat: 'none', bonusSpins: 0, boosts: {} }, rawH);
  if (rawH.bsig && M.checkShared(rawH) === 'bad' && snap.shared) { Object.assign(H, snap.shared); notes.push('Мы бережно вернули ягоды и шляпы к последнему сохранению — похоже, данные поменялись «сами». Всё в порядке!'); }
  let rawS = readJson(KEY);
  if (rawS && M.checkSlots(rawS) === 'bad') { rawS = snap.slots || null; notes.push('Состояние автомата вернулось к последнему сохранению. Ничего страшного!'); }
  const base = M.newSlotsState(), S = Object.assign(base, rawS || {});
  S.stats = Object.assign(M.newSlotsState().stats, S.stats || {}); S.album = S.album || {}; S.ach = S.ach || {}; S.hist = Array.isArray(S.hist) ? S.hist : [];
  H.owned = Array.isArray(H.owned) ? H.owned : ['none']; if (!H.owned.includes('none')) H.owned.unshift('none');
  H.boosts = H.boosts && typeof H.boosts === 'object' ? H.boosts : {};
  for (const id of M.FREE_ITEMS) if (!S.album[id]) S.album[id] = 1;
  if (!S.title) S.title = 'title:newbie';
  return { S, H, notes };
}
export function saveAll(S, H) {
  delete S.sig; S.sig = M.signSlots(S); delete H.bsig; H.bsig = M.signShared(H);
  writeJson(KEY, S); writeJson(HHK, H);
  writeJson(SNAP, { slots: S, shared: { berries: H.berries, owned: H.owned, bonusSpins: H.bonusSpins | 0, boosts: H.boosts } });
}
// эффекты предмета в общем сохранении игры
export function applyItem(H, item) {
  if (item.kind === 'hat') { const id = item.id.slice(4); if (!H.owned.includes(id)) H.owned.push(id); }
  if (item.kind === 'boost') { const k = item.id.slice(6); H.boosts[k] = (H.boosts[k] | 0) + 1; }
}
export const perksOf = (H, S) => M.activePerks(S, H); /* casino:step3 PERKSOF — S нужен для перков предметов */

export const nextMidnight = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };
export const clock = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });


export const itemName = id => (M.ITEM[id] ? M.ITEM[id].name : id);

/* ---------- ставки и баланс ---------- */
/** Единый список ставок всех игр (то же, что M.BETS). */
export const betSteps = M.BETS;
/** Шаг ставки: dir = 1 | -1 | 'min' | 'max'; для 'max' cap — потолок (обычно баланс). Всегда возвращает элемент betSteps. */
export function stepBet(bet, dir, cap = Infinity) {
  const list = betSteps, exact = list.indexOf(bet);
  const at = exact >= 0 ? exact : (k => (k < 0 ? list.length - 1 : k))(list.findIndex(b => b >= bet));
  if (dir === 'min') return list[0];
  if (dir === 'max') return [...list].reverse().find(b => b <= cap) ?? list[0];
  if (dir === 1) return list[Math.min(list.length - 1, at + 1)];
  if (dir === -1) return list[Math.max(0, at - 1)];
  return list[at];
}
export const balance = H => Math.max(0, Math.floor(Number(H && H.berries) || 0));
export function adjustBalance(H, delta) { H.berries = Math.max(0, balance(H) + Math.trunc(Number(delta) || 0)); return H.berries; }

/* ---------- глобальный перерыв (общий для всех игр; хранится в S.breakUntil) ---------- */
export const isOnBreak = (S, now = Date.now()) => Number(S && S.breakUntil) > +now;
/** kind: '15' | 'day'. Действующий перерыв сократить нельзя. Вызывающий затем делает saveAll. */
export function setBreak(S, kind, now = Date.now()) {
  const t = +now, d = new Date(t);
  const until = kind === 'day' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() : t + 15 * 60000;
  S.breakUntil = Math.max(Number(S.breakUntil) || 0, until);
  return S.breakUntil;
}
export const breakText = S => `Перерыв до ${clock(S.breakUntil)}. Хороший ход — отдохнуть. Загляни к ёжику или конспектам.`;
/** Заполняет host (элемент-абзац) текстом перерыва и прячет, когда он закончился. */
export function renderBreakBanner(host, S) {
  host.classList.add('cs-break'); host.setAttribute('role', 'status');
  const update = () => { const on = isOnBreak(S); host.hidden = !on; host.textContent = on ? breakText(S) : ''; };
  const timer = typeof setInterval === 'function' ? setInterval(update, 1000) : 0;
  update();
  return { update, destroy() { if (timer) clearInterval(timer); } };
}

/* ---------- всплывающие сообщения ---------- */
let toastHost = null; const toastTimers = new Set();
export function toast(text, { ms = 4600 } = {}) {
  if (typeof document === 'undefined') return null;
  if (!toastHost || !toastHost.isConnected) {
    toastHost = document.createElement('div'); toastHost.className = 'cs-toasts';
    toastHost.setAttribute('role', 'status'); toastHost.setAttribute('aria-live', 'polite'); document.body.append(toastHost);
  }
  const el = document.createElement('div'); el.className = 'cs-toast'; el.textContent = text; toastHost.append(el);
  const t = setTimeout(() => { toastTimers.delete(t); el.remove(); }, ms); toastTimers.add(t);
  return el;
}
export function clearToasts() { toastTimers.forEach(clearTimeout); toastTimers.clear(); if (toastHost) toastHost.remove(); toastHost = null; }

/* ---------- общая шапка игр: баланс + ставка ---------- */
/** state: { S, H, bet, onBet(bet), locked }. Возвращает { update, destroy }. */
export function renderHud(host, state) {
  host.innerHTML = '<div class="cs-hud"><div class="cs-stat"><span>Ягоды</span><b data-cs="bal">0</b></div>'
    + '<div class="cs-bet" role="group" aria-label="Ставка"><button class="btn2" type="button" data-cs-bet="-1" aria-label="Уменьшить ставку">−</button>'
    + '<output data-cs="bet" aria-live="polite">0</output><button class="btn2" type="button" data-cs-bet="1" aria-label="Увеличить ставку">+</button>'
    + '<button class="btn2" type="button" data-cs-bet="max">Макс</button></div></div><p class="cs-break" data-cs="break" role="status" hidden></p>';
  const q = s => host.querySelector(s);
  const onClick = e => {
    const b = e.target.closest && e.target.closest('button[data-cs-bet]'); if (!b || state.locked) return;
    const v = b.dataset.csBet, next = v === 'max' ? stepBet(state.bet, 'max', balance(state.H)) : stepBet(state.bet, Number(v));
    if (next !== state.bet) { state.bet = next; if (state.onBet) state.onBet(next); update(); }
  };
  const update = () => {
    q('[data-cs=bal]').textContent = fmt(balance(state.H)); q('[data-cs=bet]').textContent = String(state.bet);
    host.querySelectorAll('button[data-cs-bet]').forEach(b => { b.disabled = Boolean(state.locked); });
    const br = q('[data-cs=break]'), on = isOnBreak(state.S); br.hidden = !on; br.textContent = on ? breakText(state.S) : '';
  };
  host.addEventListener('click', onClick); update();
  const timer = typeof setInterval === 'function' ? setInterval(update, 1000) : 0;
  return { update, destroy() { if (timer) clearInterval(timer); host.removeEventListener('click', onClick); } };
}

/* ---------- звук ---------- */
export const getAudio = () => makeSlotsAudio();

/* ---------- таймеры страницы: later/wait/guard с отменой при уходе ---------- */
export function makeTimers(isDead = () => false) {
  const timers = new Set(), aborts = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!isDead()) fn(); }, ms); timers.add(t); return t; };
  const wait = ms => new Promise((res, rej) => {
    if (isDead()) return rej(CANCEL);
    const k = reduce() ? Math.min(ms, 30) : ms, ab = () => { clearTimeout(t); timers.delete(t); rej(CANCEL); };
    const t = setTimeout(() => { timers.delete(t); aborts.delete(ab); res(); }, k); timers.add(t); aborts.add(ab);
  });
  const guard = p => Promise.resolve(p).catch(e => { if (e !== CANCEL) console.error(e); });
  const destroy = () => { aborts.forEach(f => f()); aborts.clear(); timers.forEach(clearTimeout); timers.clear(); };
  return { timers, aborts, later, wait, guard, destroy };
}

/* ---------- конфетти поверх страницы ---------- */
export function makeFx() {
  let cv = null, cx = null, parts = [], raf = 0, last = 0;
  const cols = ['#ffd84a', '#ff7fae', '#7cf0ff', '#9bff8a', '#c9a0ff'];
  const ensure = () => {
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'cs-fx'; cv.setAttribute('aria-hidden', 'true'); document.body.append(cv); cx = cv.getContext('2d'); }
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
  };
  const tick = now => {
    raf = 0; const dt = Math.min(0.05, (now - last) / 1000); last = now;
    cx.clearRect(0, 0, cv.width, cv.height); parts = parts.filter(p => p.y < cv.height + 20 && p.life < 6);
    for (const p of parts) {
      p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
      if (p.kind === 'berry') { cx.beginPath(); cx.arc(0, 0, p.s * 0.55, 0, 7); cx.fill(); } else cx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
      cx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(tick); else if (cv) { cv.remove(); cv = cx = null; }
  };
  return {
    burst(n, kind = 'confetti') {
      if (reduce() || typeof document === 'undefined') return;
      ensure();
      for (let i = 0; i < n; i++) parts.push({ x: Math.random() * cv.width, y: -12 - Math.random() * cv.height * 0.3, vx: (Math.random() - 0.5) * 90, vy: 90 + Math.random() * 180, g: 260, r: Math.random() * 6, vr: (Math.random() - 0.5) * 8, s: kind === 'berry' ? 8 + Math.random() * 7 : 5 + Math.random() * 5, c: kind === 'berry' ? '#e8467c' : cols[i % 5], kind, life: 0 });
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    },
    destroy() { if (raf) cancelAnimationFrame(raf); raf = 0; parts = []; if (cv) cv.remove(); cv = cx = null; },
  };
}

/* ---------- достижения и наборы (перенесено из slots.js) ---------- */
export function makeAwards({ S, toast: say = toast, audio, itemName: nameOf = itemName, onChange = () => {} }) {
  const toast = say, itemName = nameOf;
  const award = id => {
    if (S.ach[id]) return; const a = ACH.find(x => x.id === id); S.ach[id] = Date.now(); S.capsules++; toast(`🏆 «${a.name}» · +1 капсула`); audio.win('good'); onChange();
  };
  function checkAlbum() {
    for (const id of M.grantSets(S)) { toast(`🏅 Собран набор! Титул «${itemName(id)}»`); }
    const p = M.albumProgress(S); if (p.have * 2 >= p.total) award('collector'); if (p.have >= p.total) award('full');
  }

  return { award, checkAlbum };
}
