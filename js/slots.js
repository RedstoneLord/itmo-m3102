/*
  Страница «Колючий куш» (#/slots): автомат на виртуальные ягоды из игры «Ёжик».
  Математика — в js/slots-math.js (в интерфейсе нет ни RTP, ни шансов), рисунки — js/slots-art.js, звук — js/slots-audio.js.
  Весь результат раунда считается заранее и сразу записывается в сохранение: обновление страницы во время анимации ничего не отнимает.
*/
import * as M from './slots-math.js';
import { ensureSprite, sym, icon, LABELS } from './slots-art.js';
import { makeSlotsAudio } from './slots-audio.js';

import { ic } from './icons.js';
import { esc, KEY, SNAP, HHK, CANCEL, reduce, fmt, readJson, writeJson, KIND_EMOJI, KIND_NAME, THEME_CLASS, ACH, loadAll, saveAll, applyItem, perksOf, clock, isOnBreak, setBreak, makeAwards } from './casino-common.js';
export { ACH, loadAll, saveAll, applyItem, perksOf }; /* casino:step5 SPLIT: общие помощники теперь в casino-common.js */
const FILL = ['seven', 'itmo', 'claude', 'king', 'hog', 'rust', 'pi', 'orange', 'cpp', 'mush', 'git', 'apple', 'berry', 'scatter', 'wild', 'bonus'];
/* casino:step5 moved: KIND_EMOJI, KIND_NAME, THEME_CLASS → casino-common.js */
const QUIPS = ['Фыр!', 'Эй! Колется.', 'Не тыкай ёжика.', 'Сегфолт (core dumped)', 'Я при исполнении.', 'Мяу. (Это не я.)', 'Очевидно, что… ай!'];

/* casino:step5 moved: ACH, loadAll, saveAll, applyItem, perksOf → casino-common.js */
const cardHtml = (c, s = 'x') => `<span class="sl-card sl-card-${c}" aria-label="${c === 'red' ? 'красная' : 'чёрная'} карта">${c === 'red' ? '♥' : '♠'}</span>`;
/* casino:step5 moved: nextMidnight, clock → casino-common.js */
export function installSlots() { ensureSprite(); }

export function renderSlotsPage() {
  const content = document.querySelector('#content');
  ensureSprite();
  const { S, H, notes } = loadAll();
  const audio = makeSlotsAudio(), rng = M.cryptoRng();
  const timers = new Set(), aborts = new Set(), anims = new Set();
  let dead = false, busy = false, skip = false, turbo = false, auto = null, pending = 0, gambleRounds = 0, fxRaf = 0, rafId = 0, parts = [], breakTimer = 0, lastPool = Math.floor(S.pool);
  let bet = M.BETS.includes(S.bet) ? S.bet : 5; const sess = { spins: 0, net: 0 }; let shownBal = null, shownHeat = null;
  const autoOpts = { stopBig: true, stopFeature: true, below: 0 };
  const $ = sel => content.querySelector(sel);
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); return t; };
  const wait = ms => new Promise((res, rej) => {
    if (dead) return rej(CANCEL);
    const k = skip || reduce() ? Math.min(ms, 30) : ms * (turbo ? 0.45 : 1), ab = () => { clearTimeout(t); timers.delete(t); rej(CANCEL); };
    const t = setTimeout(() => { timers.delete(t); aborts.delete(ab); res(); }, k); timers.add(t); aborts.add(ab);
  });
  const guard = p => Promise.resolve(p).catch(e => { if (e !== CANCEL) console.error(e); });

  // Накопленная выдача «не пропала»: ожидающий выигрыш гэмбла при обновлении страницы просто засчитывается
  if (S.pending > 0) { H.berries += S.pending; notes.push(`Ожидавшие ${fmt(S.pending)} 🍓 зачислены на баланс.`); S.pending = 0; }
  const save = () => saveAll(S, H);
  save();

  content.innerHTML = `<section class="slots-page" data-no-icons>
    <div class="intro sl-intro"><div><a class="cs-back" href="#/casino">${ic('arrowLeft', 16)}<span>Казино</span></a><span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span><h1>Колючий куш</h1><p class="sub">Три ряда, двадцать линий, один ёжик и ни одной настоящей копейки.</p><p class="sl-notice" role="note">Виртуальные ягоды без реальной ценности. Просто весёлая игра.</p></div>
      <button class="sl-poke" id="sl-poke" type="button" aria-label="Ёжик (не тыкать)">${sym('hog', 76)}<span class="sl-quip" id="sl-quip" aria-hidden="true"></span></button></div>
    <div id="sl-note" class="sl-note" role="status" hidden></div>
    <div class="sl-hud">
      <div class="sl-stat"><span>Ягоды</span><b id="sl-bal">0</b></div>
      <div class="sl-stat"><span>Бесплатные спины</span><b id="sl-freecnt">0</b></div>
      <div class="sl-stat sl-jp"><span>Джекпот</span><b id="sl-pool">500</b><small>копится только на этом устройстве</small></div>
      <div class="sl-stat"><span>Титул</span><b id="sl-title" class="sl-titlechip"></b></div>
    </div>
    <div class="sl-machine th-forest" id="sl-machine">
      <div class="sl-cab">
        <div class="sl-controls sl-side">
          <div class="sl-bet" role="group" aria-label="Ставка">
            <button class="btn2" id="sl-bet-dn" type="button" aria-label="Уменьшить ставку">−</button>
            <output id="sl-bet" aria-live="polite">5</output>
            <button class="btn2" id="sl-bet-up" type="button" aria-label="Увеличить ставку">+</button>
            <button class="btn2" id="sl-bet-max" type="button">Макс</button>
          </div>
          <div class="sl-winbar">
            <span id="sl-winlabel">Выигрыш</span>
            <b id="sl-win">0</b>
            <small id="sl-frac" title="Доли ягод копятся и добавляются, когда набирается целая"></small>
            <div class="sl-ladder" id="sl-ladder" hidden aria-label="Множитель фриспинов"></div>
          </div>
          <div class="sl-heat" id="sl-heat">
            <span class="sl-heatlabel">Жар</span>
            <div class="sl-heatbar" id="sl-heatbar" role="img" aria-label="Шкала жара"></div>
            <small id="sl-heattxt"></small>
          </div>
          <div id="sl-gamble" class="sl-gamble" hidden></div>
          <button class="btn2" id="sl-free" type="button">Бесплатный спин</button>
          <button class="btn2" id="sl-stop" type="button" hidden>Стоп авто</button>
          <div class="sl-tools">
            <button class="btn2" id="sl-turbo" type="button" aria-pressed="false">Турбо</button>
            <select id="sl-auto-n" class="btn2" aria-label="Автоспин"><option value="0">Авто</option><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select>
            <button class="btn2" id="sl-pay" type="button">Выплаты</button>
            <button class="btn2" id="sl-sound" type="button" aria-pressed="false">Звук</button>
            <button class="btn2" id="sl-break" type="button">Сделать перерыв</button>
          </div>
          <details class="sl-autoopts"><summary>Условия остановки автоспина</summary>
            <label><input type="checkbox" id="sl-st-big" checked> крупный выигрыш (от 15×)</label>
            <label><input type="checkbox" id="sl-st-feat" checked> бонус или фриспины</label>
            <label>баланс ниже <input type="number" id="sl-st-below" min="0" step="10" value="0"> 🍓</label>
          </details>
        </div>

        <div class="sl-mid">
          <div class="sl-frame" id="sl-frame">
            <div class="sl-reels" id="sl-reels"></div>
            <svg class="sl-lines" id="sl-lines" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden="true"></svg>
            <canvas class="sl-fx" id="sl-fx" aria-hidden="true"></canvas>
            <div class="sl-banner" id="sl-banner" aria-hidden="true"></div>
            <div class="sl-over" id="sl-over" hidden></div>
          </div>
        </div>

        <div class="sl-leverbox">
          <button class="sl-lever" id="sl-spin" type="button" aria-label="Крутить: потяните рычаг">
            <span class="sl-lever-slot"></span>
            <span class="sl-lever-arm"></span>
            <span class="sl-lever-knob"></span>
            <span class="sl-lever-label">Крутить</span>
          </button>
        </div>
      </div>
      <p class="sl-sess" id="sl-sess" aria-live="off"></p>
      <p class="sl-breakmsg" id="sl-breakmsg" role="status" hidden></p>
    </div>
    <!-- casino:step5 панели: #/collection -->
    <dialog id="sl-dlg" class="app-dialog sl-dlg"></dialog>
    <div id="sl-toasts" class="sl-toasts"></div><p class="sr-only" id="sl-live" role="status" aria-live="polite"></p></section>`;

  const frame = $('#sl-frame'), reelsEl = $('#sl-reels'), overEl = $('#sl-over'), dlg = $('#sl-dlg');
  reelsEl.innerHTML = Array.from({ length: 5 }, () => '<div class="sl-reel"><div class="sl-strip"></div></div>').join('');
  const reelEls = [...reelsEl.children];
  const cellHtml = s => `<div class="sl-cell" data-s="${s}">${sym(s)}</div>`;
  const setReel = (i, col) => { const strip = reelEls[i].querySelector('.sl-strip'); strip.style.height = ''; strip.style.transform = ''; strip.innerHTML = col.map(cellHtml).join(''); };
  M.spinGrid(rng, 'cold').raw.forEach((col, i) => setReel(i, col));

  const say = text => { const el = $('#sl-live'); if (el) el.textContent = text; };
  const toast = text => { const el = document.createElement('div'); el.className = 'sl-toast'; el.textContent = text; $('#sl-toasts').append(el); later(() => el.remove(), 4600); say(text); };
  const setNote = text => { const el = $('#sl-note'); el.hidden = !text; el.textContent = text || ''; };
  const onBreak = () => isOnBreak(S);
  const freeLeft = () => S.free + (H.bonusSpins | 0);
  const itemName = id => (M.ITEM[id] ? M.ITEM[id].name : id);

  /* ---------- частицы: конфетти и ягодный дождь на canvas ---------- */
  const fx = $('#sl-fx'), fxc = fx.getContext('2d');
  function sizeFx() { const r = frame.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); fx.width = Math.round(r.width * d); fx.height = Math.round(r.height * d); fx.dataset.d = d; fx.dataset.w = r.width; fx.dataset.h = r.height; }
  function burst(n, kind = 'confetti') {
    if (reduce() || dead) return; sizeFx(); const w = Number(fx.dataset.w), h = Number(fx.dataset.h), cols = ['#ffd84a', '#ff7fae', '#7cf0ff', '#9bff8a', '#c9a0ff'];
    for (let i = 0; i < n; i++) parts.push({ x: Math.random() * w, y: -12 - Math.random() * h * 0.5, vx: (Math.random() - 0.5) * 90, vy: 90 + Math.random() * 180, g: 260, r: Math.random() * 6, vr: (Math.random() - 0.5) * 8, s: kind === 'berry' ? 8 + Math.random() * 7 : 5 + Math.random() * 5, c: kind === 'berry' ? '#e8467c' : cols[i % 5], kind, life: 0 });
    if (!fxRaf) { let last = performance.now(); const tick = now => { fxRaf = 0; const dt = Math.min(0.05, (now - last) / 1000); last = now; const d = Number(fx.dataset.d) || 1; fxc.setTransform(d, 0, 0, d, 0, 0); fxc.clearRect(0, 0, Number(fx.dataset.w), Number(fx.dataset.h));
      parts = parts.filter(p => p.y < Number(fx.dataset.h) + 20 && p.life < 6);
      for (const p of parts) { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; fxc.save(); fxc.translate(p.x, p.y); fxc.rotate(p.r); fxc.fillStyle = p.c;
        if (p.kind === 'berry') { fxc.beginPath(); fxc.arc(0, 0, p.s * 0.55, 0, 7); fxc.fill(); fxc.fillStyle = '#3aa655'; fxc.fillRect(-p.s * 0.25, -p.s * 0.7, p.s * 0.5, p.s * 0.25); } else fxc.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); fxc.restore(); }
      if (parts.length) fxRaf = requestAnimationFrame(tick); else fxc.clearRect(0, 0, Number(fx.dataset.w), Number(fx.dataset.h)); }; fxRaf = requestAnimationFrame(tick); }
  }
  const shake = () => { if (reduce()) return; frame.classList.add('sl-shake'); later(() => frame.classList.remove('sl-shake'), 520); };
  const pop = el => { if (!el) return; el.classList.remove('sl-pop'); void el.offsetWidth; el.classList.add('sl-pop'); };
  const pullLever = () => { const l = $('#sl-spin'); if (!l || reduce()) return; l.classList.remove('is-pulled'); void l.offsetWidth; l.classList.add('is-pulled'); };

  /* ---------- интерфейс: табло, кнопки, панели ---------- */
  function hud() {
    const shownNow = fmt(shownBal ?? H.berries); if ($('#sl-bal').textContent !== shownNow) { $('#sl-bal').textContent = shownNow; pop($('#sl-bal')); }
    $('#sl-freecnt').textContent = String(freeLeft());
    const pool = Math.floor(S.pool); if (pool !== lastPool) { lastPool = pool; pop($('#sl-pool')); } $('#sl-pool').textContent = `${fmt(pool)} 🍓`;
    $('#sl-frac').textContent = S.frac > 0.004 ? `в копилке долей: ${S.frac.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} 🍓` : '';
    $('#sl-title').textContent = itemName(S.title).replace(/^Титул: /, '');
    $('#sl-bet').textContent = String(bet);
    const heatVal = shownHeat ?? S.heat;
    const bar = $('#sl-heatbar'), full = heatVal >= M.HEAT_MAX;
    bar.innerHTML = Array.from({ length: M.HEAT_MAX }, (_, i) => `<i class="${i < heatVal ? 'on' : ''}">${icon('flame', 16)}</i>`).join(''); bar.classList.toggle('is-full', full);
    $('#sl-heattxt').textContent = full ? 'Следующий спин «тёплый»!' : 'Копится после неудач';
    const br = onBreak(); $('#sl-breakmsg').hidden = !br; if (br) $('#sl-breakmsg').textContent = `Перерыв до ${clock(S.breakUntil)}. Хороший ход — отдохнуть. Загляни к ёжику или конспектам.`;
    $('#sl-spin').disabled = busy || br || H.berries < bet; $('#sl-free').disabled = busy || br || freeLeft() < 1; $('#sl-free').textContent = freeLeft() ? `Бесплатный спин (${freeLeft()})` : 'Бесплатный спин';
    $('#sl-bet-dn').disabled = busy || bet <= M.BETS[0]; $('#sl-bet-up').disabled = busy || bet >= M.BETS.at(-1); $('#sl-bet-max').disabled = busy;
    $('#sl-stop').hidden = !auto; $('#sl-turbo').setAttribute('aria-pressed', String(turbo)); $('#sl-sound').setAttribute('aria-pressed', String(audio.on)); $('#sl-sound').textContent = audio.on ? 'Звук: вкл' : 'Звук: выкл';
    $('#sl-sess').textContent = `Сессия: ${sess.spins} спин. · ${sess.net >= 0 ? '+' : '−'}${fmt(Math.abs(sess.net))} 🍓`;
    /* casino:step5: подсказка про ёжика перенесена на хаб */
    const th = THEME_CLASS[S.theme] || 'th-forest'; $('#sl-machine').className = `sl-machine ${th}`;
  }
  const { award, checkAlbum } = makeAwards({ S, toast, audio, itemName }); /* casino:step5 AWARDS */
  /* casino:step5 moved → js/casino-collection.js: renderAch, renderStats, renderDaily, wheelSvg, renderWheel, renderAlbum */
  const refresh = () => { hud(); }; /* casino:step5 refresh */
  setNote(notes.join(' '));

  /* ---------- барабаны ---------- */
  const fw = n => (n >= 10 ? fmt(n) : n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
  const cellsOf = (r, rows) => rows.map(row => reelEls[r].querySelectorAll('.sl-cell')[row]).filter(Boolean);
  const showOver = html => { overEl.innerHTML = html; overEl.hidden = false; };
  const hideOver = () => { overEl.hidden = true; overEl.innerHTML = ''; };
  function clearWin() { $('#sl-lines').innerHTML = ''; frame.querySelectorAll('.is-win,.flip,.is-scatter,.is-bonusc,.is-near').forEach(el => el.classList.remove('is-win', 'flip', 'is-scatter', 'is-bonusc', 'is-near')); }
  async function animateTo(raw) {
    if (reduce() || skip) { raw.forEach((col, i) => { setReel(i, col); reelEls[i].classList.add('sl-fade'); }); await wait(60); reelEls.forEach(r => r.classList.remove('sl-fade')); return; }
    audio.lever(); audio.whirStart();
    const speed = turbo ? 0.4 : 1, cur = reelEls.map(r => [...r.querySelectorAll('.sl-cell')].map(c => c.dataset.s).slice(-3)), runs = []; let prev = 0, scatSoFar = 0;
    raw.forEach((col, i) => {
      const n = Math.max(4, Math.round((9 + i * 4) * (turbo ? 0.55 : 1))), all = [...cur[i], ...Array.from({ length: n }, () => FILL[Math.floor(rng() * FILL.length)]), ...col], N = all.length;
      const slow = (i >= 3 && scatSoFar === 2) || (i === 4 && raw[0].includes('bonus') && raw[2].includes('bonus'));
      let dur = (820 + i * 300) * speed + (slow ? 1200 * speed : 0); dur = Math.max(dur, prev + 200 * speed); prev = dur;
      scatSoFar += col.filter(s => s === 'scatter').length;
      const strip = reelEls[i].querySelector('.sl-strip'); strip.innerHTML = all.map(cellHtml).join(''); strip.style.height = `${N * 100 / 3}%`;
      const end = (N - 3) * 100 / N, over = 24 / N;
      const a = strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${end + over}%)`, offset: 0.9 }, { transform: `translateY(-${end}%)` }], { duration: dur, easing: 'cubic-bezier(.4,0,.25,1)', fill: 'forwards' });
      anims.add(a); reelEls[i].classList.add('is-spin');
      if (slow) { frame.classList.add('is-tense'); later(() => audio.heartbeat(), dur * 0.4); later(() => audio.heartbeat(), dur * 0.7); }
      runs.push(a.finished.catch(() => {}).then(() => { anims.delete(a); try { a.cancel(); } catch { /* уже снят */ } reelEls[i].classList.remove('is-spin'); if (dead) return; setReel(i, col); audio.thunk(i); if (col.includes('scatter')) audio.scatter(i); }));
    });
    await Promise.all(runs); frame.classList.remove('is-tense'); audio.whirStop();
  }
  async function expandWilds(res) {
    if (!res.expanded.length) return; audio.wild();
    res.expanded.forEach(i => { setReel(i, res.grid[i]); reelEls[i].classList.add('is-expand'); });
    await wait(560); res.expanded.forEach(i => reelEls[i].classList.remove('is-expand'));
  }
  const lineCells = l => l.cells || (l.col !== undefined ? [0, 1, 2].map(row => [l.col, row]) : M.LINES[l.line].slice(0, l.count).map((row, i) => [i, row]));
  async function showLines(res, quick) {
    const svg = $('#sl-lines'); clearWin(); const cols = ['#ffd84a', '#7cf0ff', '#ff7fae', '#9bff8a', '#c9a0ff'];
    if (res.scatter >= 3) res.raw.forEach((c, r) => c.forEach((s, row) => { if (s === 'scatter') cellsOf(r, [row])[0]?.classList.add('is-scatter'); }));
    if (res.bonus) [0, 2, 4].forEach(r => res.raw[r].forEach((s, row) => { if (s === 'bonus') cellsOf(r, [row])[0]?.classList.add('is-bonusc'); }));
    for (const [k, l] of res.lines.slice(0, 10).entries()) {
      const cells = lineCells(l), pts = (l.col !== undefined ? [[l.col, 0.1], [l.col, 2.9]] : cells).map(([r, row]) => `${r * 100 + 50},${row * 100 + 50}`).join(' ');
      svg.querySelectorAll('polyline').forEach(p => p.classList.add('old'));
      svg.insertAdjacentHTML('beforeend', `<polyline points="${pts}" fill="none" stroke="${cols[k % 5]}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);
      cells.forEach(([r, row]) => { const c = cellsOf(r, [row])[0]; if (c) { c.classList.add('is-win'); if (l.sym === 'hog' || l.sym === 'king') c.classList.add('flip'); } });
      audio.tick(k); if (!quick) await wait(520); else await wait(180);
    }
    if (res.lines.length > 10) res.lines.slice(10).forEach(l => lineCells(l).forEach(([r, row]) => cellsOf(r, [row])[0]?.classList.add('is-win')));
    if (res.scatterPay || res.bonus) await wait(quick ? 150 : 420);
  }
  async function countUp(to, from = 0, ms = 1100) {
    const el = $('#sl-win'); if (to <= from || skip || reduce()) { el.textContent = fw(to); return; }
    await new Promise((res, rej) => { const t0 = performance.now(); let lastTick = 0; const ab = () => rej(CANCEL); aborts.add(ab);
      const step = now => { if (dead) return rej(CANCEL); const p = Math.min(1, (now - t0) / (ms * (turbo ? 0.5 : 1))), e = 1 - Math.pow(1 - p, 3); el.textContent = fw(from + (to - from) * e); if (now - lastTick > 70) { lastTick = now; audio.tick(Math.floor(p * 20)); }
        if (p < 1 && !skip) rafId = requestAnimationFrame(step); else { el.textContent = fw(to); aborts.delete(ab); res(); } };
      rafId = requestAnimationFrame(step); });
  }
  async function celebrate(x) {
    const tier = M.winTier(x); if (tier === 'none') return; const lab = { small: '', good: 'Хорошо!', big: 'BIG WIN', mega: 'MEGA WIN', epic: 'EPIC WIN' }[tier], bn = $('#sl-banner');
    audio.win(tier); if (lab) { bn.textContent = lab; bn.className = `sl-banner show t-${tier}`; }
    if (tier === 'big' || tier === 'mega' || tier === 'epic') { burst(tier === 'epic' ? 160 : 90, 'berry'); burst(60); shake(); }
    await wait(tier === 'epic' ? 2600 : tier === 'mega' ? 2100 : tier === 'big' ? 1700 : tier === 'good' ? 800 : 250); bn.className = 'sl-banner';
  }
  const ladder = m => { const el = $('#sl-ladder'); el.innerHTML = Array.from({ length: 11 }, (_, i) => `<i class="${i + 1 <= m ? 'on' : ''}${i + 1 === m ? ' cur' : ''}">×${i + 1}</i>`).slice(0, Math.max(10, m)).join(''); };

  /* ---------- джекпот, фриспины, «Ягодная поляна» ---------- */
  let jpResolve = null;
  async function jackpotShow(amount) {
    S.stats.jackpots++; award('jackpot'); audio.fanfare(); shake();
    showOver(`<div class="sl-jackpot"><div class="sl-gold"></div><h2>ДЖЕКПОТ!</h2><b>${fmt(amount)} 🍓</b><p>Фыр-фыр-фыр! Ёжики в полном восторге.</p><div class="sl-fly" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<span style="--i:${i}">🦔</span>`).join('')}</div><button class="btn2 btn-primary" type="button" data-act="jp-close">Ура!</button></div>`);
    burst(200); burst(120, 'berry'); for (let i = 1; i < 6; i++) later(() => burst(80), i * 1100);
    await new Promise((res, rej) => { jpResolve = res; aborts.add(() => rej(CANCEL)); later(res, 9000); }); jpResolve = null; audio.stopFanfare(); hideOver();
  }
  async function runFS(R, betEff) {
    const tr = R.trace, steps = tr.fsSteps; award('first_fs'); S.stats.fs += steps.length;
    audio.feature(); showOver(`<div class="sl-curtain"><h2>Фриспины!</h2><p>${steps.length} вращений. Множитель растёт после каждого выигрыша, а расширенные Wild добавляют +1.</p></div>`); burst(80); await wait(1700); hideOver();
    const lad = $('#sl-ladder'); lad.hidden = false; let run = 0;
    for (const [i, st] of steps.entries()) {
      ladder(st.startMult); $('#sl-winlabel').textContent = `Фриспин ${i + 1} из ${steps.length}`; clearWin();
      await animateTo(st.res.raw); await expandWilds(st.res);
      if (st.res.lines.length || st.res.scatterPay) await showLines(st.res, true);
      const from = run; run += st.win * betEff; await countUp(run, from, 500); ladder(st.mult);
      if (st.res.scatter >= 3) toast('Ретригер: +5 вращений!');
      if (st.res.lines.some(l => l.count === 5 && (l.sym === 'hog' || l.sym === 'king'))) award('five_hogs');
      if (st.jp) await jackpotShow(st.jp);
      await wait(300);
    }
    lad.hidden = true; $('#sl-winlabel').textContent = 'Выигрыш'; toast(`Фриспины принесли ${fw(tr.fs.total * betEff)} 🍓`);
  }
  async function runPick(R, betEff) {
    const p = R.trace.pick, g = p.g, seq = p.seq; S.stats.picks++; let k = 0, picks = 3, prizes = 0, mul = 1, done = false;
    const label = c => (c === 'segfault' ? 'Сегфолт 💥' : c === 'extra' ? '+пик' : c === 'm2' ? '×2' : c === 'm3' ? '×3' : c === 'gold' ? 'ДЖЕКПОТ' : `+${c.slice(1)}×`);
    const paint = () => { $('#pk-picks').textContent = String(picks); $('#pk-sum').textContent = fw(prizes * betEff); $('#pk-mul').textContent = `×${mul}`; $('#pk-tot').textContent = `${fw(Math.min(M.MAX_WIN, prizes * mul) * betEff)} 🍓`; };
    audio.feature(); showOver(`<div class="sl-pick"><h2>Ягодная поляна</h2><p>Выбирай кусты: призы, множители, лишние пики… и берегись Сегфолта.</p><div class="sl-bushes">${Array.from({ length: 12 }, (_, i) => `<button class="sl-bush" type="button" data-bush="${i}" aria-label="Куст ${i + 1}"><span>🌿</span></button>`).join('')}</div>
      <div class="sl-pickbar"><span>Пики: <b id="pk-picks">${picks}</b></span><span>Призы: <b id="pk-sum">0</b></span><span>Множитель: <b id="pk-mul">×1</b></span><span>Итого: <b id="pk-tot">0</b></span></div>${p.wz !== null ? `<p class="sl-wiz">🪄 Колпак мага добавит в конце ещё ${p.wz}×.</p>` : ''}<div class="sl-row"><button class="btn2 btn-primary" type="button" data-act="pick-close" disabled>Забрать</button></div></div>`);
    const reveal = async el => {
      if (done || el.disabled) return; const c = seq[k++]; el.disabled = true; el.classList.add('open'); el.innerHTML = `<span>${label(c)}</span>`; picks--;
      if (c === 'segfault') { audio.segfault(); if (k === 1) award('segfault'); el.classList.add('bad'); shake(); } else if (c === 'extra') { picks++; audio.berry(2); } else if (c === 'm2') mul *= 2; else if (c === 'm3') mul *= 3; else if (c === 'gold') audio.fanfare(); else { prizes += Number(c.slice(1)); audio.berry(k); }
      if (c === 'm2' || c === 'm3') audio.win('good');
      paint();
      if (k >= seq.length) {
        done = true; if (p.wz !== null) prizes += p.wz; paint(); const btns = [...overEl.querySelectorAll('.sl-bush:not(.open)')];
        btns.forEach((b, j) => { b.disabled = true; b.classList.add('open', 'dim'); b.innerHTML = `<span>${label(g.cells[k + j] ?? '')}</span>`; });
        if (c === 'gold') { audio.stopFanfare(); const keep = overEl.innerHTML; await jackpotShow(R.trace.pickJp); showOver(keep); }
        overEl.querySelector('[data-act=pick-close]').disabled = false; if (p.total * 1 >= 20) award('picker'); audio.win(p.total >= 20 ? 'big' : 'good'); burst(40);
      }
    };
    overEl._reveal = reveal; paint();
    await new Promise((res, rej) => { overEl._close = res; aborts.add(() => rej(CANCEL));
      if (auto) { (async () => { try { for (const b of [...overEl.querySelectorAll('.sl-bush')]) { if (dead || !overEl._reveal) return; await wait(520); await reveal(b); if (done) break; } await wait(900); res(); } catch { /* страница закрыта */ } })(); } });
    overEl._reveal = null; overEl._close = null; hideOver();
  }

  /* ---------- «Удвоить или ничего» и копилка ---------- */
  let gambleBet = 5, gambleBusy = false;
  const closeGamble = () => { const b = $('#sl-gamble'); b.hidden = true; b.innerHTML = ''; };
  function collectPending() {
    if (pending > 0) { H.berries += pending; sess.net += pending; S.stats.won += pending; S.stats.biggest = Math.max(S.stats.biggest, pending); toast(`+${fmt(pending)} 🍓 в копилку`); audio.berry(3); }
    pending = 0; S.pending = 0; gambleRounds = 0; closeGamble(); save(); if (!dead) hud();
  }
  function renderGamble(msg) {
    const box = $('#sl-gamble'); box.hidden = false;
    box.innerHTML = `<div class="sl-gtxt"><b>Удвоить или ничего?</b><span>На кону ${fmt(pending)} 🍓 · раунд ${gambleRounds + 1} из ${M.GAMBLE_MAX_ROUNDS}</span>${msg ? `<em>${msg}</em>` : ''}</div>${perksOf(H, S).gambleHint > 0 && S.hist.length ? `<div class="sl-hist" aria-label="Последние карты">Подсказка — прошлые карты: ${S.hist.slice(-perksOf(H, S).gambleHint).map(cardHtml).join('')}</div>` : ''}<div class="sl-gbtns"><button class="btn2 sl-red" type="button" data-gamble="red">♥ Красное</button><button class="btn2 sl-black" type="button" data-gamble="black">♠ Чёрное</button><button class="btn2 btn-primary" type="button" data-gamble="collect">Забрать</button></div>`;
  }
  async function gambleChoose(choice) {
    if (pending <= 0 || gambleBusy || busy) return; gambleBusy = true;
    try {
      audio.flip(); const r = M.gambleRound(rng, choice); S.stats.gambles++; S.hist.push(r.card); if (S.hist.length > 20) S.hist.shift();
      $('#sl-gamble').innerHTML = `<div class="sl-flip">${cardHtml(r.card)}</div>`; await wait(650);
      if (r.won) { S.stats.gambleWins++; pending *= 2; S.pending = pending; gambleRounds++; save(); if (M.gambleAllowed(pending, gambleBet, gambleRounds)) renderGamble('Угадал! Ещё раз?'); else { toast(`Удвоено до ${fmt(pending)} 🍓`); collectPending(); } }
      else { audio.gambleLose(); pending = 0; S.pending = 0; gambleRounds = 0; closeGamble(); toast('Не угадал… ёжик сочувственно фыркает.'); save(); }
    } finally { gambleBusy = false; if (!dead) hud(); }
  }

  /* ---------- один спин (платный или бесплатный) ---------- */
  async function doSpin(kind) {
    if (busy || dead) return;
    if (onBreak()) { hud(); return; }
    collectPending(); const free = kind === 'free';
    if (free ? freeLeft() < 1 : H.berries < bet) { audio.nope(); toast(free ? 'Бесплатных спинов нет.' : 'Не хватает ягод — ёжик уже зовёт.'); hud(); return; }
    const betEff = free ? M.DAILY_BET : bet; gambleBet = betEff; busy = true; skip = false; pullLever(); clearWin(); closeGamble(); $('#sl-win').textContent = '0'; $('#sl-winlabel').textContent = 'Выигрыш'; hideOver();
    if (free) { if (S.free > 0) S.free--; else H.bonusSpins--; } else { H.berries -= bet; S.stats.wagered += bet; sess.net -= bet; }
    S.stats.spins++; sess.spins++; S.bet = bet; shownBal = H.berries; shownHeat = S.heat;
    const R = M.rollRound(rng, S, betEff, perksOf(H, S), { paid: !free }), res = R.res, tr = R.trace, x = R.won / betEff, set = M.settle(S.frac, R.won); S.frac = set.frac;
    let credit = set.whole; const gambleable = !res.fsSpins && !res.bonus && !R.parts.jp && credit > 0 && M.gambleAllowed(credit, betEff, 0);
    if (gambleable) { pending = credit; S.pending = credit; credit = 0; }
    H.berries += credit; sess.net += credit; S.stats.won += credit; S.stats.biggest = Math.max(S.stats.biggest, set.whole);
    let caps = 0; if (x >= 50) caps++; if (res.fsSpins) caps++; if (res.bonus) caps++; S.capsules += caps; save(); shownBal = H.berries - credit; hud();
    try {
      await animateTo(res.raw); await expandWilds(res);
      if (res.warm) { toast('🔥 Горячая серия: этот спин был «тёплым»'); audio.heat(); award('heat'); }
      await showLines(res, false);
      if ((res.scatter === 2 || [0, 2, 4].filter(r => res.raw[r].includes('bonus')).length === 2) && !res.fsSpins && !res.bonus) { frame.classList.add('is-near'); audio.heartbeat(); await wait(500); frame.classList.remove('is-near'); }
      if (res.win > 0) { await countUp(res.win * betEff); if (!tr.fs && !tr.pick) await celebrate(res.win); }
      if (res.lines.some(l => l.count === 5 && (l.sym === 'hog' || l.sym === 'king'))) award('five_hogs');
      if (res.lines.some(l => l.count === 5 && l.sym === 'orange')) award('orange_king');
      if (res.lines.some(l => l.count === 5 && l.sym === 'claude')) award('five_claude'); /* casino:step3 AWARDS */
      if (res.lines.some(l => l.count === 5 && l.sym === 'itmo')) award('five_itmo');
      if (res.sevenRow) award('seven_row');
      if (res.capsules) award('capsule_sym');
      if (res.jackpot) await jackpotShow(res.jackpot);
      if (res.fsSpins) { await runFS(R, betEff); }
      if (res.bonus) { await runPick(R, betEff); }
      if (R.won > res.win * betEff + 1e-9 || res.fsSpins || res.bonus) { await countUp(R.won, res.win * betEff, 900); await celebrate(x); }
      if (Math.abs(R.won - 42) < 1e-6) award('exact42');
      if ((H.hat === 'foil') && x >= 10) award('foil');
      if (x >= 100) award('big100');
      if (caps) toast(`🎁 +${caps} ${caps === 1 ? 'капсула' : 'капсулы'}`);
      say(R.won > 0 ? `Выигрыш: ${fw(R.won)} ягод` : 'Без выигрыша');
    } catch (e) { if (e !== CANCEL) console.error(e); }
    finally {
      busy = false; shownBal = null; shownHeat = null;
      if (!dead) {
        save(); checkAlbum(); refresh(); $('#sl-winlabel').textContent = 'Выигрыш';
        if (pending > 0 && !auto) renderGamble('Рискнёшь удвоить? Шансы — ровно пополам.'); else if (pending > 0) collectPending();
        if (auto) { auto.left--; const stop = (autoOpts.stopBig && x >= 15) || (autoOpts.stopFeature && (res.fsSpins || res.bonus || R.parts.jp > 0)) || (autoOpts.below > 0 && H.berries < autoOpts.below) || H.berries < bet || auto.left <= 0 || onBreak(); if (stop) { auto = null; hud(); } else later(() => guard(doSpin('paid')), 380); }
      }
    }
  }

  /* casino:step5 moved → js/casino-collection.js: runWheel, openCapsuleUi, claimDaily */

  /* ---------- диалоги ---------- */
  function openPay() {
    const pm = (s, n) => M.payMult(s, n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }), rows = ['seven', 'itmo', 'claude', 'king', 'hog', 'rust', 'pi', 'orange', 'cpp', 'mush', 'git', 'apple', 'berry'];
    dlg.innerHTML = `<div class="dialog-head"><h2>Таблица выплат</h2><button type="button" data-close-dialog aria-label="Закрыть">×</button></div><p class="dialog-hint">Выплаты — в долях общей ставки за каждую выигрышную линию. Три и более одинаковых символа подряд на соседних барабанах платят с любого барабана, не только с первого; Wild заменяют. 20 линий.</p>
      <div class="sl-pay"><div class="sl-payrow sl-payhead"><span></span><span></span><b>3</b><b>4</b><b>5</b></div>${rows.map(s => `<div class="sl-payrow">${sym(s, 44)}<span>${LABELS[s]}</span><b>×${pm(s, 3)}</b><b>×${pm(s, 4)}</b><b>×${pm(s, 5)}</b></div>`).join('')}</div>
      <h3>Особые символы</h3><ul class="sl-rules">
      <li>${sym('wild', 30)} <b>Wild</b> — на барабанах 2–4, заменяет всё, кроме Scatter, Bonus и капсулы. Расширяется на весь барабан и добавляет +1 к множителю спина.</li>
      <li>${sym('scatter', 30)} <b>Scatter</b> — 3, 4 или 5 где угодно платят ×2, ×10, ×50 ставки и запускают 8, 12 или 20 фриспинов. Во фриспинах множитель растёт после каждого выигрыша, а 3 Scatter добавляют +5 вращений.</li>
      <li>${sym('bonus', 30)} <b>Bonus</b> — корзины на барабанах 1, 3 и 5 разом открывают «Ягодную поляну».</li>
      <li>${sym('capsule', 30)} <b>Капсула</b> — редкий символ, дарит гарантированную капсулу с призом в коллекцию.</li>
      <li>7️⃣ <b>Семёрка</b> — пять семёрок в одном ряду дают огромный шанс сорвать джекпот!</li>
      <li><b>Вертикаль и диагонали</b> — три одинаковых символа в одном барабане платят как три в линии; диагонали, V-образные и зигзагообразные серии тоже считаются, с любого барабана.</li>
      <li>🔥 <b>Жар</b> — после серии неудач следующий спин «тёплый»: выигрыши чаще.</li>
      <li>💰 <b>Джекпот</b> — три расширенных Wild или пять семёрок дают шанс сорвать копилку; чем выше ставка, тем он больше. Копилка хранится на этом устройстве.</li>
      <li>🃏 <b>Удвоить или ничего</b> — после небольшого выигрыша можно до 3 раз угадать цвет карты: честные пополам.</li><li>Максимальный выигрыш за раунд — 5000× ставки.</li></ul>`;
    dlg.showModal();
  }
  function openBreak() {
    dlg.innerHTML = `<div class="dialog-head"><h2>Сделать перерыв</h2><button type="button" data-close-dialog aria-label="Закрыть">×</button></div><p class="dialog-hint">Вращение заблокируется. Отменить нельзя — в этом и смысл.</p><div class="dialog-actions"><button class="btn2" type="button" data-close-dialog>Передумал</button><button class="btn2" type="button" data-break="15">15 минут</button><button class="btn2 btn-primary" type="button" data-break="day">До завтра</button></div>`; dlg.showModal();
  }
  const quip = () => { const q = $('#sl-quip'); q.textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)]; q.classList.remove('show'); void q.offsetWidth; q.classList.add('show'); };

  /* ---------- события ---------- */
  const ac = new AbortController(), listen = (type, fn) => content.addEventListener(type, fn, { signal: ac.signal }); /* casino:step5 */
  const setBet = v => { bet = v; S.bet = v; hud(); };
  listen('click', e => {
    const t = e.target, btn = t.closest('button'), id = btn && btn.id;
    if (t.closest('#sl-over') && btn) {
      if (btn.dataset.bush !== undefined && overEl._reveal) guard(overEl._reveal(btn));
      if (btn.dataset.act === 'pick-close' && overEl._close) overEl._close();
      if (btn.dataset.act === 'jp-close' && jpResolve) jpResolve();
      return;
    }
    if (t.closest('#sl-frame') && busy && !t.closest('#sl-over')) { skip = true; anims.forEach(a => { try { a.finish(); } catch { /* уже закончена */ } }); }
    if (!btn) return;
    if (id === 'sl-spin' && leverDragged) { leverDragged = false; return; }
    if (btn.dataset.closeDialog !== undefined && dlg.open) dlg.close();
    if (id === 'sl-spin') { audio.click(); guard(doSpin('paid')); } else if (id === 'sl-free') { audio.click(); guard(doSpin('free')); }
    else if (id === 'sl-bet-dn') { audio.click(); setBet(M.BETS[Math.max(0, M.BETS.indexOf(bet) - 1)]); } else if (id === 'sl-bet-up') { audio.click(); setBet(M.BETS[Math.min(M.BETS.length - 1, M.BETS.indexOf(bet) + 1)]); }
    else if (id === 'sl-bet-max') { audio.click(); setBet([...M.BETS].reverse().find(b => b <= H.berries) || M.BETS[0]); }
    else if (id === 'sl-turbo') { turbo = !turbo; audio.click(); hud(); } else if (id === 'sl-stop') { auto = null; audio.click(); hud(); }
    else if (id === 'sl-pay') { audio.click(); openPay(); } else if (id === 'sl-break') { audio.click(); openBreak(); }
    else if (id === 'sl-sound') { audio.set(!audio.on); hud(); } /* casino:step5 collection actions moved */
    else if (id === 'sl-poke') { S.stats.poked++; quip(); audio.click(); if (S.stats.poked >= 25) award('dont_poke'); save(); }
    else if (btn.dataset.gamble) { if (btn.dataset.gamble === 'collect') collectPending(); else guard(gambleChoose(btn.dataset.gamble)); }
    /* casino:step5 equip → collection */
    else if (btn.dataset.break) { setBreak(S, btn.dataset.break); auto = null; save(); if (dlg.open) dlg.close(); refresh(); }
  });
  listen('change', e => {
    const t = e.target;
    if (t.id === 'sl-auto-n') { const n = Number(t.value); t.value = '0'; if (n > 0 && !busy) { autoOpts.stopBig = $('#sl-st-big').checked; autoOpts.stopFeature = $('#sl-st-feat').checked; autoOpts.below = Math.max(0, Number($('#sl-st-below').value) || 0); auto = { left: n }; hud(); guard(doSpin('paid')); } }
  });
  const onKey = e => {
    if (dead || dlg.open || !(e.code === 'Space' || e.code === 'Enter') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    e.preventDefault(); if (e.repeat) return; if (!busy) guard(doSpin('paid'));
  };
  let leverY = null, leverDragged = false;
  listen('pointerdown', e => { const l = e.target.closest('#sl-spin'); if (l && !l.disabled) { leverY = e.clientY; leverDragged = false; try { l.setPointerCapture(e.pointerId); } catch { /* не страшно */ } } });
  listen('pointermove', e => { if (leverY === null) return; const dy = Math.max(0, Math.min(70, e.clientY - leverY)); if (dy > 8) leverDragged = true; $('#sl-spin').style.setProperty('--pull', dy / 70); });
  listen('pointerup', e => { if (leverY === null) return; const dy = e.clientY - leverY; leverY = null; $('#sl-spin').style.removeProperty('--pull'); if (dy > 40) { audio.click(); guard(doSpin('paid')); } });
  window.addEventListener('keydown', onKey);
  breakTimer = setInterval(() => { if (dead) return; if (S.breakUntil && !onBreak()) { S.breakUntil = 0; save(); } if (S.breakUntil) hud(); }, 1000);

  function destroy() {
    if (dead) return; try { collectPending(); } catch { /* без паники */ }
    dead = true; auto = null; try { if (dlg.open) dlg.close(); } catch { /* уже закрыт */ }
    aborts.forEach(f => f()); aborts.clear(); timers.forEach(clearTimeout); timers.clear(); anims.forEach(a => { try { a.cancel(); } catch { /* снята */ } }); anims.clear();
    cancelAnimationFrame(fxRaf); cancelAnimationFrame(rafId); clearInterval(breakTimer); ac.abort(); window.removeEventListener('keydown', onKey); audio.destroy(); try { save(); } catch { /* квота */ }
  }
  window.__hhDestroy = destroy;
  hud(); checkAlbum(); save(); /* casino:step5 */
}
