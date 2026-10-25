/* casino:step8 */
/*
  Блэкджек (#/blackjack): двадцать одно против крупье-ёжика.
  Математика — js/blackjack-math.js, HUD и звук — casino-common.js, темы — casino-themes.js.
  Дисциплина сохранения: результат раунда вычисляется и сохраняется СРАЗУ (H.berries, S.stats, S.capsules),
  затем идёт плавная анимация раздачи. window.__hhDestroy регистрирует очистку.
*/
import * as M from './slots-math.js';
import * as B from './blackjack-math.js';
import { ic } from './icons.js';
import {
  esc, fmt, clock, reduce, CANCEL,
  loadAll, saveAll, perksOf,
  isOnBreak, setBreak, breakText,
  toast, clearToasts,
  renderHud, getAudio,
  makeTimers, makeFx, makeAwards,
  ACH, EMOTES, extraPills
} from './casino-common.js';
import { applyCasinoTheme } from './casino-themes.js';

export function renderBlackjackPage() {
  const content = document.querySelector('#content');
  if (!content) return;
  const { S, H } = loadAll();
  const audio = getAudio(), rng = M.cryptoRng();
  let shoe = B.newShoe(rng);
  let dead = false, busy = false, inHand = false;
  let bet = M.BETS.includes(S.bet) ? S.bet : 5;
  let prevBet = bet;
  let currentRound = null;
  let dealerRevealed = false;
  let shownD = 0, shownP = 0, holeShown = false; // сколько карт уже на столе: анимируем только новые

  const { later, wait, guard, destroy: stopTimers } = makeTimers(() => dead);
  const fx = makeFx(), burst = (n, kind) => fx.burst(n, kind);
  const save = () => saveAll(S, H);

  const $ = sel => content.querySelector(sel);

  content.innerHTML = `<section class="casino-page cs-game-page cs-game--blackjack" data-no-icons>
    <div class="cs-topbar">
      <a class="cs-back" href="#/casino">${ic('arrowLeft', 16)}<span>Казино</span></a>
      <div class="cs-top-actions">
        <button class="btn2" id="bj-rules" type="button">Правила</button>
        <button class="btn2" id="bj-break" type="button">Перерыв</button>
        <button class="btn2" id="bj-sound" type="button" aria-pressed="${String(audio.on)}">Звук: ${audio.on ? 'вкл' : 'выкл'}</button>
      </div>
    </div>

    <div class="intro cs-intro">
      <span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span>
      <h1>Блэкджек</h1>
      <p class="sub">Двадцать одно против крупье-ёжика на виртуальные ягоды.</p>
    </div>

    <div id="bj-hud-host"></div>

    <div class="bj-stage">
      <aside class="bj-dealer-side" aria-label="Крупье">
        <div class="bj-dealer-art">
          <span class="bj-dealer-pic" aria-hidden="true">🦔</span>
          <span class="bj-dealer-title">Крупье-ёжик</span>
        </div>
        <div class="bj-dealer-bubble" id="bj-dealer-bubble" role="status">Фыр! Делайте ставку и погнали.</div>
      </aside>
      <div class="bj-table ct-felt" id="bj-table">
      <div class="bj-perks-bar" id="bj-perks-bar"></div>

      <div class="bj-hand-section bj-dealer-section">
        
        <div class="bj-hand-header">
          <span class="bj-hand-label">Карты дилера</span>
          <span class="bj-score" id="bj-dealer-score" aria-live="polite"></span>
        </div>
        <div class="bj-cards" id="bj-dealer-cards" role="region" aria-label="Карты дилера"></div>
        <div class="bj-dealer-hint" id="bj-dealer-hint" style="font-size:.8rem;color:#ffe97a;display:none;margin-top:4px"></div>
      </div>

      <div class="bj-status-wrap">
        <div class="bj-shoe-pill" id="bj-shoe-pill" title="Остаток карт в шу">
          <span class="bj-shoe-ic">🂠</span>
          <span id="bj-shoe-txt">Шу: 312 / 312</span>
        </div>
        <div class="bj-outcome" id="bj-outcome" role="status" aria-live="polite">Сделайте ставку и нажмите «Раздать»</div>
      </div>

      <div class="bj-hand-section bj-player-section">
        <div class="bj-hand-header">
          <span class="bj-hand-label">Ваши карты</span>
          <span class="bj-score" id="bj-player-score" aria-live="polite"></span>
        </div>
        <div class="bj-cards" id="bj-player-cards" role="region" aria-label="Ваши карты"></div>
      </div>

      <div class="bj-actions" id="bj-actions"></div>
    </div>
    </div>

    <dialog id="bj-dlg" class="app-dialog bj-dlg"></dialog>
  </section>`;

  const dlg = $('#bj-dlg');
  applyCasinoTheme(content.querySelector('.cs-game--blackjack'), S);

  const { award } = makeAwards({
    S, toast, audio,
    onChange: () => {}
  });

  const hudState = {
    S, H, bet, locked: false,
    onBet: newBet => {
      bet = newBet; S.bet = newBet; prevBet = newBet; save();
    }
  };
  const hud = renderHud($('#bj-hud-host'), hudState);

  function updateShoePill() {
    const left = B.cardsLeft(shoe);
    const txt = $('#bj-shoe-txt');
    if (txt) {
      txt.textContent = `Шу: ${left} / ${B.SHOE_SIZE}${B.needsShuffle(shoe) ? ' (скоро перетасовка)' : ''}`;
    }
  }

  function dealerSay(msg) {
    const el = $('#bj-dealer-bubble');
    if (el) {
      el.textContent = msg;
      el.classList.remove('sl-pop');
      void el.offsetWidth;
      el.classList.add('sl-pop');
    }
  }

  function renderCard(card, faceDown = false, isNew = false) {
    if (faceDown) {
      return '<div class="bj-card is-facedown ct-cardback' + (isNew ? ' is-dealing' : '') + '" role="img" aria-label="Закрытая карта"></div>';
    }
    const r = card.r, s = card.s;
    const rank = B.rankLabel(r), suit = B.SUITS[s] || '♠';
    const isRed = s === 1 || s === 2;
    return `<div class="bj-card ${isRed ? 'is-red' : ''} ${isNew ? 'is-dealing' : ''}" role="img" aria-label="${rank} ${suit}">`
      + `<div class="bj-card-corner top"><b>${rank}</b><i>${suit}</i></div>`
      + `<div class="bj-card-center">${r >= 11 ? rank : suit}</div>`
      + `<div class="bj-card-corner btm"><b>${rank}</b><i>${suit}</i></div>`
      + '</div>';
  }

  function formatScore(cards, hideHole = false) {
    if (!cards || !cards.length) return '';
    if (hideHole) {
      const v = B.cardValue(cards[0]);
      return v === 1 ? '1 / 11' : String(v);
    }
    const { total, soft, bust } = B.handValue(cards);
    if (bust) return `Перебор (${total})`;
    if (B.isNatural(cards)) return '21 (Блэкджек!)';
    if (soft && total < 21) return `${total - 10} / ${total}`;
    return String(total);
  }

  function renderPerks() {
    const perks = perksOf(H, S);
    const pills = [];
    if (S.equip && S.equip.perkcharm === 'perkcharm:ace') {
      pills.push('<span class="bj-perk-pill">🍀 Талисман «Туз в рукаве»: 3:2 за 21 из 3 карт</span>');
    }
    if (S.equip && S.equip.cardback === 'cardback:marked') {
      pills.push('<span class="bj-perk-pill">🂠 Меченая рубашка</span>');
    }
    if (S.equip && S.equip.emote === 'emote:fyr') {
      pills.push('<button class="btn2 bj-emote-btn" id="bj-emote-btn" type="button" aria-label="Фыркнуть">🦔 «Фыр!»</button>');
    }
    pills.push(...extraPills(S, 'bj'));
    $('#bj-perks-bar').innerHTML = pills.join('');
  }

  function renderHands() {
    if (!currentRound) {
      $('#bj-dealer-cards').innerHTML = '<div class="bj-placeholder">Ожидание ставки…</div>';
      $('#bj-player-cards').innerHTML = '<div class="bj-placeholder">Ожидание ставки…</div>';
      $('#bj-dealer-score').textContent = '';
      $('#bj-player-score').textContent = '';
      const hHint = $('#bj-dealer-hint'); if (hHint) hHint.style.display = 'none';
      return;
    }

    const dCards = currentRound.dealer || [];
    const flipHole = dealerRevealed && !holeShown && dCards.length >= 2;
    $('#bj-dealer-cards').innerHTML = dCards.map((c, i) => {
      let html = renderCard(c, i === 1 && !dealerRevealed, i >= shownD);
      if (flipHole && i === 1) html = html.replace('class="bj-card ', 'class="bj-card is-flipping ');
      return html;
    }).join('');
    shownD = dCards.length; holeShown = dealerRevealed && dCards.length >= 2;
    $('#bj-dealer-score').textContent = formatScore(dCards, !dealerRevealed);

    const pCards = currentRound.player || [];
    $('#bj-player-cards').innerHTML = pCards.map((c, i) => renderCard(c, false, i >= shownP)).join('');
    shownP = pCards.length;
    $('#bj-player-score').textContent = formatScore(pCards, false);

    const hHint = $('#bj-dealer-hint');
    if (hHint) {
      if (S.equip && S.equip.cardback === 'cardback:marked' && !dealerRevealed && dCards.length >= 2) {
        hHint.style.display = 'block';
        hHint.textContent = '🂠 Меченая рубашка: вероятность 10-ки у крупье ≈ 30.8%';
      } else {
        hHint.style.display = 'none';
      }
    }
    updateShoePill();
  }

  function renderActions() {
    const act = $('#bj-actions');
    if (!act) return;
    const br = isOnBreak(S);
    if (!inHand) {
      act.innerHTML = `<button class="btn2 btn-primary bj-btn-main" id="bj-deal" type="button">Раздать [Enter]</button>`
        + `<button class="btn2" id="bj-rebet" type="button">Повторить (${prevBet} 🍓)</button>`;
      const dBtn = $('#bj-deal'); if (dBtn) dBtn.disabled = Boolean(busy || br || H.berries < bet);
      const rBtn = $('#bj-rebet'); if (rBtn) rBtn.disabled = Boolean(busy || br || H.berries < prevBet);
    } else {
      const canH = !busy && !currentRound.done;
      const canS = !busy && !currentRound.done;
      act.innerHTML = '<button class="btn2 btn-primary bj-btn-main" id="bj-hit" type="button">Взять карту [H]</button>'
        + '<button class="btn2 bj-btn-main" id="bj-stand" type="button">Хватит [S]</button>';
      const hBtn = $('#bj-hit'); if (hBtn) hBtn.disabled = !canH;
      const sBtn = $('#bj-stand'); if (sBtn) sBtn.disabled = !canS;
    }
  }

  function setOutcome(text) {
    const el = $('#bj-outcome');
    if (el) el.textContent = text;
  }

  async function doDeal() {
    if (busy || inHand || isOnBreak(S)) return;
    if (H.berries < bet) {
      audio.nope();
      toast('Недостаточно ягод для ставки!');
      return;
    }
    busy = true; inHand = true; dealerRevealed = false; shownD = 0; shownP = 0; holeShown = false;
    hudState.locked = true; hud.update();
    prevBet = bet;

    // Стейт-сейвинг: снимаем ставку, пишем статистику и сохраняем СРАЗУ
    H.berries -= bet;
    S.stats.bjHands = (S.stats.bjHands | 0) + 1;
    S.stats.bjWagered = (S.stats.bjWagered | 0) + bet;
    S.stats.wagered = (S.stats.wagered | 0) + bet;
    save();
    hud.update();

    // Считаем раунд через blackjack-math
    currentRound = B.dealRound(shoe, rng, bet, perksOf(H, S));
    if (currentRound.reshuffled) {
      toast('Шу подошёл к концу — колода перетасована!');
    }

    setOutcome('Раздача карт…');
    // Анимация раздачи 4 карт
    const p0 = currentRound.player[0], d0 = currentRound.dealer[0];
    const p1 = currentRound.player[1], d1 = currentRound.dealer[1];

    currentRound.player = [p0];
    currentRound.dealer = [];
    renderHands(); audio.deal(); await wait(120);

    currentRound.dealer = [d0];
    renderHands(); audio.deal(); await wait(120);

    currentRound.player = [p0, p1];
    renderHands(); audio.deal(); await wait(120);

    currentRound.dealer = [d0, d1];
    renderHands(); audio.deal(); await wait(120);

    if (currentRound.done) {
      // Натуральный блэкджек дилера или игрока — раунд сразу завершён
      await finishRound();
    } else {
      busy = false;
      const pVal = B.handValue(currentRound.player).total;
      dealerSay(`У вас ${pVal}. Карта [H] или хватит [S]?`);
      setOutcome(`Ваш ход: у вас ${pVal}. Взять карту [H] или остановиться [S]?`);
      renderActions();
    }
  }

  async function doHit() {
    if (busy || !inHand || !currentRound || currentRound.done) return;
    busy = true; renderActions();
    B.hit(currentRound, shoe);
    audio.deal();
    dealerSay('Ещё одну? Аккуратнее!');
    renderHands();
    await wait(180);

    if (currentRound.done) {
      await finishRound();
    } else {
      busy = false;
      const pVal = B.handValue(currentRound.player).total;
      setOutcome(`У вас ${pVal}. Взять ещё [H] или хватит [S]?`);
      renderActions();
    }
  }

  async function doStand() {
    if (busy || !inHand || !currentRound || currentRound.done) return;
    busy = true; renderActions();
    dealerSay('Хватит так хватит. Смотрим карты…');
    setOutcome('Дилер открывает карты…');

    // Запоминаем карты дилера до добора
    const initialDealerLen = 2;
    B.stand(currentRound, shoe);
    const fullDealerCards = [...currentRound.dealer];
    currentRound.dealer = fullDealerCards.slice(0, initialDealerLen); // добор покажем по одной карте

    // Раскрываем закрытую карту дилера
    dealerRevealed = true;
    audio.flip();
    renderHands();
    await wait(240);

    // Показываем поочерёдно добор дилера (если дилер добрал карты)
    if (fullDealerCards.length > initialDealerLen) {
      const fullDealer = fullDealerCards;
      for (let i = initialDealerLen + 1; i <= fullDealer.length; i++) {
        currentRound.dealer = fullDealer.slice(0, i);
        renderHands();
        audio.deal();
        await wait(240);
      }
    }

    await finishRound();
  }

  async function finishRound() {
    dealerRevealed = true;
    renderHands();

    // Расчёт выплаты и сохранение СРАЗУ (до фанфар и пауз)
    const { pay, frac } = B.settle(S.frac, currentRound.ret);
    S.frac = frac;
    H.berries += pay;
    S.stats.bjWon = (S.stats.bjWon | 0) + pay;
    S.stats.won = (S.stats.won | 0) + pay;
    S.stats.bjBiggest = Math.max(S.stats.bjBiggest | 0, pay);
    S.stats.biggest = Math.max(S.stats.biggest | 0, pay);

    if (currentRound.outcome === 'charlie') {
      dealerSay('Пять карт без перебора?! Настоящий Чарли!');
    } else if (currentRound.outcome === 'blackjack' || currentRound.outcome === 'suited-blackjack') {
      dealerSay('Чистые 21! Блэкджек у игрока! Фыр!');
    } else if (currentRound.mult > 0) {
      dealerSay('Твоя взяла! Забирай ягоды.');
    } else if (currentRound.mult === 0) {
      dealerSay('Ничья! Ставки возвращаются.');
    } else if (currentRound.outcome === 'bust') {
      dealerSay('Многовато будет. Перебор!');
    } else {
      dealerSay('В этот раз банк забирает крупье. Фыр!');
    }

    if (currentRound.mult > 0) {
      award('bj_win');
      S.stats.bjWins = (S.stats.bjWins | 0) + 1;
      S.stats.bjStreak = (S.stats.bjStreak | 0) + 1;
      S.stats.bjMaxStreak = Math.max(S.stats.bjMaxStreak | 0, S.stats.bjStreak);
      if (S.stats.bjStreak >= 5 && S.stats.bjStreak % 5 === 0) {
        S.capsules = (S.capsules | 0) + 1;
        toast(`🎁 Серия из ${S.stats.bjStreak} побед подряд! Получена капсула.`);
        burst(40);
      }
    } else if (currentRound.mult < 0) {
      S.stats.bjStreak = 0;
    } else {
      S.stats.bjPushes = (S.stats.bjPushes | 0) + 1;
    }

    if (currentRound.outcome === 'blackjack' || currentRound.outcome === 'suited-blackjack') {
      S.stats.bjBlackjacks = (S.stats.bjBlackjacks | 0) + 1;
    }
    if (currentRound.outcome === 'charlie') {
      S.stats.bjCharlies = (S.stats.bjCharlies | 0) + 1;
    }

    // Сохраняем состояние
    save();

    // Звуки и эффекты
    if (currentRound.mult > 0) {
      audio.win(currentRound.mult >= 2 ? 'big' : 'good');
      if (currentRound.mult >= 2) burst(35);
    } else if (currentRound.mult === 0) {
      audio.click();
    } else {
      audio.nope();
    }

    // Текст итога
    const label = B.OUTCOME_LABEL[currentRound.outcome] || 'Раунд завершён';
    let summary = label;
    if (pay > 0) summary += ` · Выигрыш: +${fmt(pay)} 🍓`;
    if (currentRound.extra > 0) summary += ` (талисман +${fmt(currentRound.extra)} 🍓)`;
    setOutcome(summary);

    inHand = false;
    busy = false;
    hudState.locked = false;
    hud.update();
    renderActions();
  }

  function openRules() {
    dlg.innerHTML = '<div class="panel-head"><h2>Правила блэкджека</h2><button class="btn2" type="button" data-close-dialog aria-label="Закрыть">✕</button></div>'
      + '<div class="app-dialog-body"><p>Цель игры — набрать очков ближе к 21, чем у крупье-ёжика, но не более 21. Туз считается за 1 или 11, картинки (J, Q, K) — за 10.</p>'
      + '<ul class="bj-rules-list">'
      + '<li><b>6 колод</b> (312 карт) в шу. Перетасовка при остатке ≤ 25%.</li>'
      + '<li><b>Крупье останавливается на 17</b> (включая мягкие 17).</li>'
      + '<li><b>Блэкджек (A + 10)</b> платит <b>3:2</b>.</li>'
      + '<li><b>Мастевой блэкджек</b> (одной масти) платит <b>2:1</b>.</li>'
      + '<li><b>5-карточный Чарли</b>: 5 карт без перебора — победа <b>2:1</b> сразу!</li>'
      + '<li><b>7-7-7</b>: три семёрки — победа <b>3:1</b> мгновенно!</li>'
      + '<li><b>Ничья</b> возвращает ставку.</li>'
      + '<li><b>Талисман «Туз в рукаве»</b>: 3:2 за 21 очко из 3 карт.</li>'
      + '</ul><p class="plan-hint">Клавиши: [Enter] — Раздать, [H] — Взять, [S] — Хватит.</p></div>'
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
    if (!btn || dead) return;
    if (btn.dataset.closeDialog !== undefined && dlg.open) dlg.close();
    const id = btn.id;
    if (id === 'bj-rules') { audio.click(); openRules(); }
    else if (id === 'bj-break') { audio.click(); openBreak(); }
    else if (id === 'bj-sound') {
      audio.set(!audio.on);
      btn.setAttribute('aria-pressed', String(audio.on));
      btn.textContent = `Звук: ${audio.on ? 'вкл' : 'выкл'}`;
    }
    else if (id === 'bj-deal') { audio.click(); guard(doDeal()); }
    else if (id === 'bj-rebet') {
      if (H.berries >= prevBet) {
        bet = prevBet; hudState.bet = prevBet; hud.update();
        audio.click(); guard(doDeal());
      } else {
        toast('Недостаточно ягод!');
      }
    }
    else if (id === 'bj-hit') { guard(doHit()); }
    else if (id === 'bj-stand') { guard(doStand()); }
    else if (id === 'bj-emote-btn') { audio.click(); toast('🦔 Крупье-ёжик довольно фырчит: «Фыр-фыр!»'); }
    else if (btn.dataset.emote) { audio.click(); toast(EMOTES[btn.dataset.emote] || '🦔 Фыр!'); }
    else if (btn.dataset.break) {
      setBreak(S, btn.dataset.break); save(); hud.update(); if (dlg.open) dlg.close();
      toast('Перерыв активирован.'); renderActions();
    }
  });

  function onKey(e) {
    if (dead || (dlg && dlg.open)) return;
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    const key = e.key ? e.key.toLowerCase() : '';
    if (key === 'enter') {
      if (!busy && !inHand) { e.preventDefault(); guard(doDeal()); }
    } else if (key === 'h' || key === 'р') {
      if (!busy && inHand && currentRound && !currentRound.done) { e.preventDefault(); guard(doHit()); }
    } else if (key === 's' || key === 'ы') {
      if (!busy && inHand && currentRound && !currentRound.done) { e.preventDefault(); guard(doStand()); }
    }
  }
  window.addEventListener('keydown', onKey, { signal: ac.signal });

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
  renderHands();
  renderActions();
}
