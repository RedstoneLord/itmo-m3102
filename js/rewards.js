/*
  Награды ягодами (общий баланс игры «Ёжик» и «Колючего куша», ключ hh_save_v1).

  ЧТЕНИЕ. Конспект делится на блоки верхнего уровня. Блок засчитывается прочитанным, только если он
  накопил «время внимания»: он находится в центральной полосе экрана, страница видима и в фокусе,
  недавно были действия пользователя, а страницу не мотают быстрее экрана в секунду.
  Нужное время блока — число слов / 7 с (≈420 слов в минуту максимум). Дополнительно за всю заметку
  нужно набрать активное время не меньше 0.9 × слов / 6 с. Быстрая прокрутка, оставленная вкладка и
  «показать всё сразу» наград не дают. Награда за каждый конспект — один раз навсегда.

  ТЕСТЫ. Награждается только ПЕРВАЯ попытка по каждому вопросу за всё время: после ответа вопрос
  записывается в журнал сразу, поэтому ни «Пройти заново», ни «Повторить ошибки», ни перезагрузка
  страницы не дают второй попытки. Ответ быстрее quizMinMs не считается. Выплата в конце прохождения,
  только если среди новых вопросов не меньше quizMinFresh и верно ≥ quizPass с первой попытки.

  Журнал подписан (как сохранения слотов): при ручной правке дневные лимиты на сегодня сгорают.
*/
import { cyrb53, signShared, checkShared, dayKey } from './slots-math.js';

export const CFG = {
  readMinWords: 250, readWordsPerBerry: 120, readMin: 3, readMax: 25, readCapDay: 1000,
  readWPS: 7, readTotalWPS: 6, readDoneShare: 0.9, band: [0.1, 0.9], idleMs: 20000,
  quizPer: 2, quizPerfect: 3, quizPass: 0.7, quizMinFresh: 3, quizMinMs: 4000, quizCapDay: 1000,
};
const KEY = 'm3102-rewards-v1', HHK = 'hh_save_v1', SALT = 'm3102-rewards-v1';

/* ---------- журнал ---------- */
const sig = L => cyrb53(SALT + JSON.stringify([L.read, L.q, L.part, L.day]), 3);
function load() {
  let L = null;
  try { L = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { L = null; }
  if (!L || typeof L !== 'object') return { read: {}, q: {}, part: {}, day: { d: '', read: 0, test: 0 } };
  L.read = L.read || {}; L.q = L.q || {}; L.part = L.part || {}; L.day = L.day || { d: '', read: 0, test: 0 };
  if (L.sig && L.sig !== sig(L)) L.day = { d: dayKey(), read: CFG.readCapDay, test: CFG.quizCapDay };
  return L;
}
function save(L) { try { L.sig = sig(L); localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* приватный режим */ } }
function rollDay(L) { const t = dayKey(); if (L.day.d !== t) L.day = { d: t, read: 0, test: 0 }; }

/* ---------- ягоды ---------- */
function addBerries(n) {
  if (!(n > 0)) return false;
  let H = {};
  try { H = JSON.parse(localStorage.getItem(HHK) || '{}') || {}; } catch (e) { return false; }
  if (H.bsig && checkShared(H) === 'bad') return false; // не «отмываем» вручную правленое сохранение
  H.berries = (H.berries | 0) + n; H.bsig = signShared(H);
  try { localStorage.setItem(HHK, JSON.stringify(H)); return true; } catch (e) { return false; }
}
function grant(L, kind, want) {
  rollDay(L);
  const cap = kind === 'read' ? CFG.readCapDay : CFG.quizCapDay;
  const n = Math.max(0, Math.min(want, cap - L.day[kind]));
  if (n > 0) { if (!addBerries(n)) return 0; L.day[kind] += n; }
  return n;
}

/* ---------- интерфейс ---------- */
function injectStyles() {
  if (document.getElementById('rw-style')) return;
  const s = document.createElement('style'); s.id = 'rw-style';
  s.textContent = '.rw-pill{position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:940;max-width:min(300px,calc(100vw - 96px));padding:8px 12px;border:1px solid var(--border);border-radius:calc(11px * var(--rs,1));background:var(--card);color:var(--text);font-size:.76rem;box-shadow:0 10px 30px rgba(20,20,35,.18);pointer-events:none}'
    + '.rw-pill i{display:block;height:4px;margin-top:6px;border-radius:calc(999px * var(--rp,1));background:var(--border);overflow:hidden}'
    + '.rw-pill i b{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .4s}'
    + '.rw-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 90px);z-index:1500;max-width:calc(100vw - 24px);padding:10px 16px;border:1px solid var(--accent);border-radius:calc(999px * var(--rp,1));background:var(--card);color:var(--text);font-size:.84rem;font-weight:650;box-shadow:0 10px 30px rgba(0,0,0,.25)}'
    + '@media(max-width:760px){.rw-pill{bottom:calc(env(safe-area-inset-bottom,0px) + 84px)}}@media print{.rw-pill,.rw-toast{display:none}}';
  document.head.appendChild(s);
}
function toast(text) {
  injectStyles();
  const el = document.createElement('div'); el.className = 'rw-toast'; el.setAttribute('role', 'status'); el.textContent = text;
  document.body.appendChild(el); setTimeout(() => el.remove(), 5500);
}

/* ---------- чтение ---------- */
let stopTracking = null;
export function trackReading(path, body) {
  if (stopTracking) stopTracking();
  if (!body || load().read[path]) return;
  const items = [];
  for (const el of body.children) {
    if (el.matches('.quiz-block,.mermaid,.dgm,figure,hr,img,.img-figure')) continue;
    const c = el.cloneNode(true);
    c.querySelectorAll('.katex-mathml,.heading-anchor,.code-copy').forEach(n => n.remove());
    let w = (c.textContent.match(/\S+/g) || []).length;
    if (!w) continue;
    if (el.tagName === 'PRE') w *= 0.5;
    items.push({ el, w, need: Math.max(2, w / CFG.readWPS), d: 0 });
  }
  const W = items.reduce((s, it) => s + it.w, 0);
  if (W < CFG.readMinWords) return;
  const reward = Math.min(CFG.readMax, Math.max(CFG.readMin, Math.round(W / CFG.readWordsPerBerry)));
  const P = load().part[path];
  let active = 0;
  if (P && P.n === items.length && Array.isArray(P.d)) { items.forEach((it, i) => { it.d = Math.min(it.need, +P.d[i] || 0); }); active = +P.t || 0; }

  injectStyles();
  const pill = document.createElement('div'); pill.className = 'rw-pill';
  const label = document.createElement('span'), bar = document.createElement('i'), fill = document.createElement('b');
  bar.appendChild(fill); pill.append(label, bar); document.body.appendChild(pill);

  const ac = new AbortController();
  let lastInput = Date.now(), lastY = scrollY, ticks = 0, finished = false, timer = 0;
  const bump = () => { lastInput = Date.now(); };
  for (const t of ['scroll', 'wheel', 'keydown', 'pointerdown', 'pointermove', 'touchstart', 'touchmove']) window.addEventListener(t, bump, { passive: true, signal: ac.signal });
  window.addEventListener('hashchange', () => end(), { signal: ac.signal });

  const progress = () => items.reduce((s, it) => s + it.w * Math.min(1, it.d / it.need), 0) / W;
  const savePart = () => { const L = load(); L.part[path] = { n: items.length, d: items.map(it => Math.round(it.d)), t: Math.round(active) }; save(L); };
  function paint(msg) {
    const p = progress();
    label.textContent = msg || ('📖 Вдумчивое чтение: ' + Math.round(p * 100) + '% · награда +' + reward + ' 🍓');
    fill.style.width = Math.round(p * 100) + '%';
  }
  function end(claimed) {
    if (finished) return; finished = true;
    clearInterval(timer); ac.abort(); if (!claimed) savePart();
    setTimeout(() => pill.remove(), claimed ? 0 : 0);
    if (stopTracking === end) stopTracking = null;
  }
  function claim() {
    const L = load();
    if (L.read[path]) return end(true);
    const n = grant(L, 'read', reward);
    if (n > 0) {
      L.read[path] = { t: Date.now(), b: n }; delete L.part[path]; save(L);
      toast('+' + n + ' 🍓 за вдумчивое чтение конспекта'); end(true);
    } else {
      save(L); savePart();
      label.textContent = 'Конспект прочитан, но награду сейчас начислить нельзя (дневной лимит). Открой его завтра.';
      clearInterval(timer); ac.abort(); finished = true; setTimeout(() => pill.remove(), 8000);
      if (stopTracking === end) stopTracking = null;
    }
  }
  function tick() {
    if (!body.isConnected) return end();
    const y = scrollY, fast = Math.abs(y - lastY) > innerHeight; lastY = y;
    const ok = document.visibilityState === 'visible' && document.hasFocus() && Date.now() - lastInput < CFG.idleMs && !fast;
    if (ok) {
      const top = innerHeight * CFG.band[0], bot = innerHeight * CFG.band[1]; let any = false;
      for (const it of items) {
        const r = it.el.getBoundingClientRect();
        if (r.bottom > top && r.top < bot) { any = true; if (it.d < it.need) it.d = Math.min(it.need, it.d + 1); }
      }
      if (any) active++;
    }
    paint();
    if (++ticks % 10 === 0) savePart();
    if (progress() >= CFG.readDoneShare && active >= CFG.readDoneShare * W / CFG.readTotalWPS) claim();
  }
  stopTracking = end; paint(); timer = setInterval(tick, 1000);
}

/* ---------- тесты ---------- */
export const quizReward = {
  quizId(Q) { return cyrb53(Q.map(q => q.q).join('\n'), 5); },
  // Вызывается при каждой проверке ответа. Возвращает запись только для самой первой попытки по вопросу.
  attempt(id, q, ok, ms) {
    const L = load(), key = id + ':' + cyrb53(q.q, 6);
    if (key in L.q) return null;
    L.q[key] = ok ? 1 : 0; save(L);
    return { ok: !!ok, valid: ms >= CFG.quizMinMs };
  },
  // Вызывается на экране результата. fresh — первые попытки, сделанные в этом прохождении.
  settle(fresh) {
    if (!fresh || !fresh.length) return null;
    const total = fresh.length, good = fresh.filter(f => f.ok && f.valid).length;
    let n = 0, note = '';
    if (total < CFG.quizMinFresh) note = 'Награда выдаётся за первое прохождение: нужно не меньше ' + CFG.quizMinFresh + ' новых вопросов.';
    else if (good / total < CFG.quizPass) note = 'Награда не начислена: нужно не меньше ' + Math.round(CFG.quizPass * 100) + '% верных ответов с первой попытки. Повторные попытки не награждаются.';
    else {
      const L = load();
      n = grant(L, 'test', good * CFG.quizPer + (good === total ? CFG.quizPerfect : 0)); save(L);
      if (!n) note = 'Дневной лимит наград за тесты исчерпан.';
    }
    if (n) toast('+' + n + ' 🍓 за тест');
    const html = n ? '<div class="quiz-result-sub">+' + n + ' 🍓 за верные ответы с первой попытки</div>' : '<div class="quiz-result-sub">' + note + '</div>';
    return { berries: n, html };
  },
};
