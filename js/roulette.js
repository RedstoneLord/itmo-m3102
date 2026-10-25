/* casino:step8 */
/*
  Рулетка (#/roulette): европейская рулетка на виртуальные ягоды.
  Математика — js/roulette-math.js, HUD и звук — casino-common.js, темы — casino-themes.js.
  Дисциплина сохранения: результат спина считается и сохраняется СРАЗУ (H.berries, S.stats, S.capsules),
  затем запускается анимация колеса. window.__hhDestroy регистрирует очистку.
*/
import * as M from './slots-math.js';
import * as R from './roulette-math.js';
import { ic } from './icons.js';
import {
  esc, fmt, clock, reduce, CANCEL,
  loadAll, saveAll, perksOf,
  isOnBreak, setBreak, breakText,
  toast, clearToasts,
  renderHud, getAudio,
  makeTimers, makeFx, makeAwards,
  stepBet,
  ACH
} from './casino-common.js';
import { applyCasinoTheme, chipTier } from './casino-themes.js';

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const chipLabel = n => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1000 ? +(n / 1000).toFixed(1) + 'k' : String(n));

export function renderRoulettePage() {
  const content = document.querySelector('#content');
  if (!content) return;
  const { S, H } = loadAll();
  const audio = getAudio(), rng = M.cryptoRng();
  let dead = false, busy = false;
  let currentChip = 5;
  let bets = new Map();
  let lastBets = null;
  let rotorAngle = 0;
  let removeMode = false;

  const { later, wait, guard, destroy: stopTimers } = makeTimers(() => dead);
  const fx = makeFx(), burst = (n, kind) => fx.burst(n, kind);
  const save = () => saveAll(S, H);

  const $ = sel => content.querySelector(sel);

  content.innerHTML = `<section class="casino-page cs-game-page cs-game--roulette" data-no-icons>
    <div class="cs-topbar">
      <a class="cs-back" href="#/casino">${ic('arrowLeft', 16)}<span>Казино</span></a>
      <div class="cs-top-actions">
        <button class="btn2" id="ro-rules" type="button">Правила</button>
        <button class="btn2" id="ro-break" type="button">Перерыв</button>
        <button class="btn2" id="ro-sound" type="button" aria-pressed="${String(audio.on)}">Звук: ${audio.on ? 'вкл' : 'выкл'}</button>
      </div>
    </div>

    <div class="intro cs-intro">
      <span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span>
      <h1>Рулетка</h1>
      <p class="sub">Европейское колесо слева, шарик и ставки на числа и шансы.</p>
    </div>

    <div id="ro-hud-host"></div>

    <div class="ro-main-layout">
      <div class="ro-left-col">
        <div class="ro-wheel-box ct-felt">
          <div class="ro-wheel-wrap" id="ro-wheel-wrap">
            ${buildWheelSvg()}
            <div class="ro-wheel-center">
              <span class="ro-last-num" id="ro-last-num">—</span>
            </div>
          </div>
          <div class="ro-hot-badge" id="ro-hot-badge" hidden>
            <span class="ro-hot-txt" id="ro-hot-txt">🔥 Горячее число: —</span>
          </div>
        </div>

        <div class="ro-hist-box">
          <span class="ro-hist-title">Последние 10 чисел:</span>
          <div class="ro-hist-list" id="ro-hist-list" role="region" aria-label="История выпавших чисел"></div>
        </div>
        <div class="ro-perks-bar" id="ro-perks-bar"></div>
      </div>

      <div class="ro-right-col">
        <p class="ro-hint"><span><b>1</b> Выберите фишку</span><span><b>2</b> Нажмите на поле стола</span><span><b>3</b> Крутите колесо</span></p>
        <div class="ro-table ct-felt" id="ro-table" role="grid" aria-label="Игровой стол рулетки">
          ${buildTableHtml()}
        </div>

        <div class="ro-controls-row">
          <div class="ro-chip-selector" id="ro-chips" role="radiogroup" aria-label="Номинал фишки">
            <span class="ro-chip-label">Фишка:</span>
            ${[1, 5, 25, 100, 500].map(val => `<button type="button" class="ct-chip ro-chip-btn ${val === currentChip ? 'is-selected' : ''}" data-tier="${chipTier(val)}" data-chip-val="${val}" aria-label="Фишка ${val}">${val >= 1000 ? (val/1000) + 'k' : val}</button>`).join('')}
          </div>

          <div class="ro-stake-stat">
            <span>Ставок на столе:</span>
            <b id="ro-total-stake">0 🍓</b>
          </div>

          <div class="ro-btns">
            <button class="btn2 ro-mode-btn" id="ro-mode-remove" type="button" aria-pressed="false">Снять ставку</button>
            <button class="btn2" id="ro-rebet" type="button" disabled>Повторить</button>
            <button class="btn2" id="ro-clear" type="button" disabled>Очистить</button>
            <button class="btn2 btn-primary ro-spin-btn" id="ro-spin" type="button" disabled>Крутить колесо</button>
          </div>
        </div>

        <div class="ro-summary" id="ro-summary" role="status" aria-live="polite" hidden></div>
      </div>
    </div>

    <dialog id="ro-dlg" class="app-dialog ro-dlg"></dialog>
  </section>`;

  const dlg = $('#ro-dlg');
  applyCasinoTheme(content.querySelector('.cs-game--roulette'), S);

  const { award } = makeAwards({
    S, toast, audio,
    onChange: () => {}
  });

  const hudState = {
    S, H, bet: currentChip, locked: false,
    onBet: newBet => {
      currentChip = newBet;
      updateChipsSelector();
    }
  };
  const hud = renderHud($('#ro-hud-host'), hudState);

  function totalStake() {
    let sum = 0;
    for (const b of bets.values()) sum += b.stake;
    return sum;
  }

  function updateChipsSelector() {
    $('#ro-chips').querySelectorAll('.ro-chip-btn').forEach(btn => {
      const v = Number(btn.dataset.chipVal);
      btn.classList.toggle('is-selected', v === currentChip);
    });
  }

  function renderPerks() {
    const perks = perksOf(H, S);
    const pills = [];
    if (perks.rouletteRefund > 0) {
      pills.push('<span class="ro-perk-pill">🍀 Талисман «Подкова»: возврат 10% проигранной ставки на число</span>');
    }
    if (S.equip && S.equip.felt === 'felt:burgundy') {
      pills.push('<span class="ro-perk-pill">🟩 Бордовое сукно</span>');
    }
    if (S.equip && S.equip.chips === 'chips:berry') {
      pills.push('<span class="ro-perk-pill">⚪ Ягодные фишки</span>');
    }
    if (S.equip && S.equip.emote === 'emote:fyr') {
      pills.push('<button class="btn2 ro-emote-btn" id="ro-emote-btn" type="button">🦔 «Фыр!»</button>');
    }
    $('#ro-perks-bar').innerHTML = pills.join('');
  }

  function renderHistory() {
    const hist = S.rouletteHist || [];
    const html = hist.slice(0, 10).map(n => {
      const c = R.colorOf(n);
      return `<span class="ro-hist-ball is-${c}" title="Число ${n} (${c})">${n}</span>`;
    }).join('');
    $('#ro-hist-list').innerHTML = html || "<span class='ro-hist-empty'>Колесо заряжено</span>";
  }

  function renderTableBets() {
    const tot = totalStake();
    $('#ro-total-stake').textContent = `${fmt(tot)} 🍓`;
    const br = isOnBreak(S);
    const spinBtn = $('#ro-spin'); if (spinBtn) spinBtn.disabled = Boolean(busy || br || tot <= 0 || H.berries < tot);
    const clearBtn = $('#ro-clear'); if (clearBtn) clearBtn.disabled = Boolean(busy || tot <= 0);
    const rebetBtn = $('#ro-rebet'); if (rebetBtn) rebetBtn.disabled = Boolean(busy || br || !lastBets || lastBets.size === 0);

    // Обновляем фишки на всех ячейках стола
    content.querySelectorAll('[data-chip-key]').forEach(anchor => {
      const key = anchor.dataset.chipKey;
      const b = bets.get(key);
      if (b && b.stake > 0) {
        anchor.innerHTML = `<span class="ct-chip ro-chip-badge" data-tier="${chipTier(b.stake)}">${chipLabel(b.stake)}</span>`;
      } else {
        anchor.innerHTML = '';
      }
    });
  }

  function addBet(type, arg) {
    if (busy || isOnBreak(S)) return;
    const key = `${type}:${Array.isArray(arg) ? arg.join('-') : arg}`;
    const existing = bets.get(key);
    const curStake = existing ? existing.stake : 0;
    const curTot = totalStake();

    let nextStake = 0;
    if (curStake === 0) {
      nextStake = currentChip;
    } else {
      nextStake = typeof stepBet === 'function' ? stepBet(curStake, 1) : curStake + currentChip;
    }

    const delta = nextStake - curStake;
    if (curTot + delta > H.berries) {
      audio.nope();
      toast('Недостаточно ягод на балансе!');
      return;
    }

    bets.set(key, { type, arg, stake: nextStake });
    audio.chip();
    renderTableBets();
  }

  function removeBet(type, arg) {
    if (busy || isOnBreak(S)) return;
    const key = `${type}:${Array.isArray(arg) ? arg.join('-') : arg}`;
    const existing = bets.get(key);
    if (!existing) return;
    const nextStake = typeof stepBet === 'function' ? stepBet(existing.stake, -1) : existing.stake - currentChip;
    if (nextStake <= 0) {
      bets.delete(key);
    } else {
      bets.set(key, { type, arg, stake: nextStake });
    }
    audio.chip();
    renderTableBets();
  }

  async function doSpin() {
    const tot = totalStake();
    if (busy || isOnBreak(S) || tot <= 0) return;
    if (H.berries < tot) {
      audio.nope();
      toast('Недостаточно ягод для ставок!');
      return;
    }

    busy = true;
    /* ui-fix */ { const wheelBox = $('#ro-wheel-wrap'); if (wheelBox && typeof wheelBox.scrollIntoView === 'function' && matchMedia('(max-width: 860px)').matches) wheelBox.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' }); }
    hudState.locked = true; hud.update();
    $('#ro-summary').hidden = true;
    content.querySelectorAll('.ro-cell.is-winner').forEach(el => el.classList.remove('is-winner'));

    // Запоминаем текущие ставки для кнопки «Повторить»
    lastBets = new Map(bets);

    // Снимаем ставки с баланса
    H.berries -= tot;

    // Чистый расчёт через roulette-math
    const betObjects = [];
    for (const b of bets.values()) {
      betObjects.push(R.makeBet(b.type, b.arg, b.stake));
    }
    const spinRes = R.spinWheel(rng);
    const settled = R.settleSpin(spinRes, betObjects, perksOf(H, S));
    const { pay, frac } = R.settle(S.frac, settled.total);
    S.frac = frac;

    // Стейт-сейвинг: зачисляем баланс и обновляем статистику СРАЗУ
    H.berries += pay;
    S.stats.rouletteSpins = (S.stats.rouletteSpins | 0) + 1;
    S.stats.rouletteWagered = (S.stats.rouletteWagered | 0) + tot;
    S.stats.rouletteWon = (S.stats.rouletteWon | 0) + pay;
    S.stats.rouletteBiggest = Math.max(S.stats.rouletteBiggest | 0, pay);
    if (pay > 0) S.stats.rouletteWins = (S.stats.rouletteWins | 0) + 1;
    if (spinRes.n === 0) S.stats.rouletteZeros = (S.stats.rouletteZeros | 0) + 1;
    if (spinRes.n === spinRes.hot) S.stats.rouletteHotHits = (S.stats.rouletteHotHits | 0) + 1;

    S.stats.wagered = (S.stats.wagered | 0) + tot;
    S.stats.won = (S.stats.won | 0) + pay;
    S.stats.biggest = Math.max(S.stats.biggest | 0, pay);

    // Проверяем выигрыш на прямое число
    const hasStraightWin = settled.rows.some(r => r.bet.type === 'straight' && r.status === 'win');
    if (hasStraightWin) {
      award('roulette_straight');
      S.capsules = (S.capsules | 0) + 1;
      toast(`🎁 Выигрыш на число ${spinRes.n}! Получена капсула.`);
      burst(50);
    }

    // История
    S.rouletteHist = Array.isArray(S.rouletteHist) ? S.rouletteHist : [];
    S.rouletteHist.unshift(spinRes.n);
    if (S.rouletteHist.length > 10) S.rouletteHist.pop();

    // Сохраняем немедленно!
    save();

    // Показываем горячее число перед началом вращения!
    const hotEl = $('#ro-hot-badge');
    const hotTxt = $('#ro-hot-txt');
    if (hotEl && hotTxt) {
      hotEl.hidden = false;
      hotEl.classList.remove('is-hit');
      hotTxt.textContent = `🔥 Горячее число: ${spinRes.hot}`;
    }

    // Анимация вращения колеса: абсолютное совмещение сектора со стрелкой
    const rotor = $('#ro-wheel-rotor');
    const numIdx = WHEEL_ORDER.indexOf(spinRes.n);
    const step = 360 / 37;
    const currentTurns = Math.floor((rotorAngle || 0) / 360);
    const targetMod = (360 - numIdx * step) % 360;
    rotorAngle = (currentTurns + 6) * 360 + targetMod;

    if (reduce()) {
      if (rotor) rotor.style.transform = `rotate(${rotorAngle}deg)`;
      await wait(60);
    } else {
      if (rotor) {
        rotor.style.transition = 'transform 3.2s cubic-bezier(0.12, 0.8, 0.25, 1)';
        rotor.style.transform = `rotate(${rotorAngle}deg)`;
      }
      // Звуки тиков колеса
      for (let t = 0; t < 12; t++) {
        later(() => audio.ballTick(), t * 240);
      }
      await wait(3200);
    }

    audio.ballDrop();

    // Отображаем выпавшее число
    const winCol = R.colorOf(spinRes.n);
    const numEl = $('#ro-last-num');
    if (numEl) {
      numEl.textContent = String(spinRes.n);
      numEl.className = `ro-last-num is-${winCol}`;
    }

    // Обновляем статус горячего числа
    if (hotEl && hotTxt) {
      const isHotHit = spinRes.n === spinRes.hot;
      hotTxt.textContent = `🔥 Горячее число: ${spinRes.hot}${isHotHit ? ' — СЫГРАЛО (выплаты ×3.5)!' : ''}`;
      hotEl.classList.toggle('is-hit', isHotHit);
    }

    // Подсветка на столе
    content.querySelectorAll(`[data-cell="straight"][data-arg="${spinRes.n}"]`).forEach(el => el.classList.add('is-winner'));

    // Звуки выигрыша
    if (pay > 0) {
      audio.win(pay >= tot * 5 ? 'big' : 'good');
      if (pay >= tot * 5) burst(40);
    } else {
      audio.nope();
    }

    // Сводка выплат
    renderSummary(settled, pay, tot, spinRes);
    renderHistory();

    busy = false;
    hudState.locked = false;
    hud.update();
    renderTableBets();
  }

  function renderSummary(settled, pay, tot, spinRes) {
    const sumEl = $('#ro-summary');
    if (!sumEl) return;
    const wins = settled.rows.filter(r => r.ret > 0);
    const colName = spinRes.n === 0 ? 'Зеро' : R.colorOf(spinRes.n) === 'red' ? 'красное' : 'чёрное';

    let html = '<div class="ro-sum-header">'
      + `<strong>Выпало: ${spinRes.n} (${colName})${spinRes.n === spinRes.hot ? ' 🔥 Горячее число!' : ''}</strong>`
      + `<span class="ro-sum-total ${pay >= tot ? 'is-plus' : 'is-minus'}">${pay >= tot ? '+' : ''}${fmt(pay - tot)} 🍓 (выплата: ${fmt(pay)} 🍓)</span>`
      + '</div>';

    if (wins.length) {
      html += '<ul class="ro-sum-list">';
      for (const w of wins) {
        const lbl = R.BET_LABEL[w.bet.type] || w.bet.type;
        const argStr = Array.isArray(w.bet.arg) ? w.bet.arg.join('/') : String(w.bet.arg);
        html += `<li><span>${lbl} (${argStr}): ставка ${w.bet.stake} 🍓</span><b>+${fmt(w.ret)} 🍓${w.hot ? ' (🔥 ×3.5)' : ''}</b></li>`;
      }
      if (settled.refund > 0) {
        html += `<li class="is-perk"><span>Талисман «Подкова» (возврат на число):</span><b>+${fmt(settled.refund)} 🍓</b></li>`;
      }
      html += '</ul>';
    } else if (settled.refund > 0) {
      html += `<p class="ro-sum-empty">Ставки не сыграли. Талисман «Подкова» вернул <b>+${fmt(settled.refund)} 🍓</b>.</p>`;
    } else {
      html += '<p class="ro-sum-empty">Ставки не сыграли. Попробуйте ещё раз!</p>';
    }

    sumEl.innerHTML = html;
    sumEl.hidden = false;
  }

  function openRules() {
    dlg.innerHTML = '<div class="panel-head"><h2>Правила рулетки</h2><button class="btn2" type="button" data-close-dialog aria-label="Закрыть">✕</button></div>'
      + '<div class="app-dialog-body"><p>Европейская рулетка: 37 карманов (от 0 до 36). Нажмите на поле стола, чтобы поставить выбранную фишку. Повторное нажатие увеличивает ставку.</p>'
      + '<ul class="ro-rules-list">'
      + '<li><b>Число (Straight)</b>: выплата <b>35:1</b>.</li>'
      + '<li><b>Дюжины и Колонки (2:1)</b>: выплата <b>2:1</b>.</li>'
      + '<li><b>Равные шансы (Красное/Чёрное, Чёт/Нечёт, 1–18/19–36)</b>: выплата <b>1:1</b>.</li>'
      + '<li><b>🔥 Горячее число</b>: каждый спин случайно выбирается горячий карман. Если шарик лёг на него — чистая прибыль всех сыгравших ставок умножается на <b>3.5×</b>!</li>'
      + '<li><b>🟢 Счастливый зеро</b>: при выпадении 0 внешние ставки (цвет, чёт, дюжины) возвращают <b>50%</b> ставки.</li>'
      + '<li><b>🍀 Талисман «Подкова»</b>: возвращает 10% проигранной ставки на число.</li>'
      + '</ul><p class="plan-hint">Правый клик или Shift+клик по фишке на столе уменьшает или убирает ставку.</p></div>'
      + '<div class="sl-row"><button class="btn2 btn-primary" type="button" data-close-dialog>Понятно</button></div>';
    dlg.showModal();
  }

  function openBreak() {
    dlg.innerHTML = '<div class="panel-head"><h2>Глобальный перерыв</h2><button class="btn2" type="button" data-close-dialog aria-label="Закрыть">✕</button></div>'
      + '<div class="app-dialog-body"><p>Нужно сделать паузу? Перерыв блокирует ставки во всех играх казино на выбранный срок. Отменить перерыв нельзя.</p>'
      + '<div class="sl-row"><button class="btn2 btn-primary" type="button" data-break="15">15 минут</button>'
      + '<button class="btn2" type="button" data-break="day">До завтра</button></div></div>';
    dlg.showModal();
  }

  const ac = new AbortController(), listen = (type, fn) => content.addEventListener(type, fn, { signal: ac.signal });

  listen('click', e => {
    const btn = e.target.closest && e.target.closest('button');
    if (btn && btn.dataset.closeDialog !== undefined && dlg.open) dlg.close();

    // Клик по фишке в селекторе номинала
    const chipBtn = e.target.closest && e.target.closest('[data-chip-val]');
    if (chipBtn) {
      currentChip = Number(chipBtn.dataset.chipVal);
      hudState.bet = currentChip;
      hud.update();
      updateChipsSelector();
      audio.click();
      return;
    }

    // Клик по ячейке стола
    const cell = e.target.closest && e.target.closest('[data-cell]');
    if (cell && !busy) {
      const type = cell.dataset.cell;
      let arg = cell.dataset.arg;
      if (type === 'straight' || type === 'column' || type === 'dozen') arg = Number(arg);
      if (removeMode || e.shiftKey) removeBet(type, arg);
      else addBet(type, arg);
      return;
    }

    if (!btn || dead) return;
    const id = btn.id;
    if (id === 'ro-rules') { audio.click(); openRules(); }
    else if (id === 'ro-break') { audio.click(); openBreak(); }
    else if (id === 'ro-sound') {
      audio.set(!audio.on);
      btn.setAttribute('aria-pressed', String(audio.on));
      btn.textContent = `Звук: ${audio.on ? 'вкл' : 'выкл'}`;
    }
    else if (id === 'ro-spin') { audio.click(); guard(doSpin()); }
    else if (id === 'ro-mode-remove') {
      removeMode = !removeMode;
      btn.classList.toggle('is-remove', removeMode);
      btn.setAttribute('aria-pressed', String(removeMode));
      btn.textContent = removeMode ? 'Режим: Снятие' : 'Снять ставку';
      audio.click();
    }
    else if (id === 'ro-clear') {
      audio.click();
      if (bets.size > 0) lastBets = new Map(bets);
      bets.clear();
      renderTableBets();
    }
    else if (id === 'ro-rebet') {
      if (!lastBets || lastBets.size === 0) return;
      bets = new Map(lastBets);
      audio.chip();
      renderTableBets();
    }
    else if (id === 'ro-emote-btn') {
      audio.click();
      toast('🦔 Крупье-ёжик довольно фырчит: «Фыр-фыр!»');
    }
    else if (btn.dataset.break) {
      setBreak(S, btn.dataset.break); save(); hud.update(); if (dlg.open) dlg.close();
      toast('Перерыв активирован.'); renderTableBets();
    }
  });

  // Правый клик по ячейке стола — уменьшение ставки
  listen('contextmenu', e => {
    const cell = e.target.closest && e.target.closest('[data-cell]');
    if (cell && !busy) {
      e.preventDefault();
      const type = cell.dataset.cell;
      let arg = cell.dataset.arg;
      if (type === 'straight' || type === 'column' || type === 'dozen') arg = Number(arg);
      removeBet(type, arg);
    }
  });

  function destroy() {
    if (dead) return;
    dead = true;
    try { if (dlg.open) dlg.close(); } catch {}
    ac.abort();
    stopTimers();
    fx.destroy();
    hud.destroy();
    clearToasts();
    audio.destroy();
    try { save(); } catch {}
  }
  window.__hhDestroy = destroy;

  renderPerks();
  renderHistory();
  renderTableBets();
}

function buildWheelSvg() {
  const cx = 150, cy = 150, rOuter = 142, rInner = 94, step = 360 / 37;
  const wedges = WHEEL_ORDER.map((num, i) => {
    const a1 = (i - 0.5) * step - 90, a2 = (i + 0.5) * step - 90;
    const rad1 = a1 * Math.PI / 180, rad2 = a2 * Math.PI / 180;
    const x1 = (cx + rOuter * Math.cos(rad1)).toFixed(1), y1 = (cy + rOuter * Math.sin(rad1)).toFixed(1);
    const x2 = (cx + rOuter * Math.cos(rad2)).toFixed(1), y2 = (cy + rOuter * Math.sin(rad2)).toFixed(1);
    const xi1 = (cx + rInner * Math.cos(rad1)).toFixed(1), yi1 = (cy + rInner * Math.sin(rad1)).toFixed(1);
    const xi2 = (cx + rInner * Math.cos(rad2)).toFixed(1), yi2 = (cy + rInner * Math.sin(rad2)).toFixed(1);
    const path = `M${xi1} ${yi1}L${x1} ${y1}A${rOuter} ${rOuter} 0 0 1 ${x2} ${y2}L${xi2} ${yi2}A${rInner} ${rInner} 0 0 0 ${xi1} ${yi1}Z`;
    const col = R.colorOf(num);
    const fill = col === 'green' ? '#188038' : col === 'red' ? '#c4232f' : '#1a1a24';
    const textAngle = i * step;
    const textRad = (textAngle - 90) * Math.PI / 180;
    const tx = (cx + 118 * Math.cos(textRad)).toFixed(1);
    const ty = (cy + 118 * Math.sin(textRad)).toFixed(1);
    return `<path d="${path}" fill="${fill}" stroke="#c9a24a" stroke-width="0.8"/>`
      + `<text x="${tx}" y="${ty}" font-size="10.5" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" transform="rotate(${textAngle} ${tx} ${ty})">${num}</text>`;
  }).join('');

  return '<svg viewBox="0 0 300 300" class="ro-wheelsvg" id="ro-wheelsvg" role="img" aria-label="Колесо рулетки">'
    + '<circle cx="150" cy="150" r="148" fill="#14181f" stroke="#c9a24a" stroke-width="4"/>'
    + `<g id="ro-wheel-rotor" style="transform-origin: 150px 150px">${wedges}</g>`
    + '<circle cx="150" cy="150" r="48" fill="#c9a24a" stroke="#1d1a10" stroke-width="3"/>'
    + '<circle cx="150" cy="150" r="18" fill="#14181f"/>'
    + '<polygon points="150,4 144,18 156,18" fill="#ffd84a" stroke="#1d1a10" stroke-width="1.5"/>'
    + '</svg>';
}

function buildTableHtml() {
  // Zero row
  let html = '<div class="ro-grid-zero">'
    + '<button type="button" class="ro-cell ro-cell--zero is-green" data-cell="straight" data-arg="0" aria-label="Зеро 0">'
    + '<span class="ro-cell-num">0</span><span class="ro-chip-anchor" data-chip-key="straight:0"></span>'
    + '</button></div>';

  // 12 rows of 3 numbers
  html += '<div class="ro-grid-numbers">';
  for (let row = 0; row < 12; row++) {
    for (let col = 1; col <= 3; col++) {
      const num = row * 3 + col;
      const c = R.colorOf(num);
      html += `<button type="button" class="ro-cell is-${c}" data-cell="straight" data-arg="${num}" aria-label="${num} ${c === 'red' ? 'красное' : 'чёрное'}">`
        + `<span class="ro-cell-num">${num}</span>`
        + `<span class="ro-chip-anchor" data-chip-key="straight:${num}"></span>`
        + '</button>';
    }
  }
  html += '</div>';

  // Columns row
  html += '<div class="ro-grid-cols">';
  for (let col = 1; col <= 3; col++) {
    html += `<button type="button" class="ro-cell ro-cell--outside" data-cell="column" data-arg="${col}" aria-label="Колонка ${col}">`
      + `<span>2 к 1</span><span class="ro-chip-anchor" data-chip-key="column:${col}"></span>`
      + '</button>';
  }
  html += '</div>';

  // Dozens row
  html += '<div class="ro-grid-dozens">'
    + '<button type="button" class="ro-cell ro-cell--outside" data-cell="dozen" data-arg="1"><span>1–12 (1-я)</span><span class="ro-chip-anchor" data-chip-key="dozen:1"></span></button>'
    + '<button type="button" class="ro-cell ro-cell--outside" data-cell="dozen" data-arg="2"><span>13–24 (2-я)</span><span class="ro-chip-anchor" data-chip-key="dozen:2"></span></button>'
    + '<button type="button" class="ro-cell ro-cell--outside" data-cell="dozen" data-arg="3"><span>25–36 (3-я)</span><span class="ro-chip-anchor" data-chip-key="dozen:3"></span></button>'
    + '</div>';

  // Outside row (even money)
  html += '<div class="ro-grid-chances">'
    + '<button type="button" class="ro-cell ro-cell--outside" data-cell="lowhigh" data-arg="low"><span>1–18</span><span class="ro-chip-anchor" data-chip-key="lowhigh:low"></span></button>'
    + '<button type="button" class="ro-cell ro-cell--outside" data-cell="oddeven" data-arg="even"><span>Чёт</span><span class="ro-chip-anchor" data-chip-key="oddeven:even"></span></button>'
    + '<button type="button" class="ro-cell ro-cell--outside is-red" data-cell="redblack" data-arg="red"><span>Красное</span><span class="ro-chip-anchor" data-chip-key="redblack:red"></span></button>'
    + '<button type="button" class="ro-cell ro-cell--outside is-black" data-cell="redblack" data-arg="black"><span>Чёрное</span><span class="ro-chip-anchor" data-chip-key="redblack:black"></span></button>'
    + '<button type="button" class="ro-cell ro-cell--outside" data-cell="oddeven" data-arg="odd"><span>Нечёт</span><span class="ro-chip-anchor" data-chip-key="oddeven:odd"></span></button>'
    + '<button type="button" class="ro-cell ro-cell--outside" data-cell="lowhigh" data-arg="high"><span>19–36</span><span class="ro-chip-anchor" data-chip-key="lowhigh:high"></span></button>'
    + '</div>';

  return html;
}
