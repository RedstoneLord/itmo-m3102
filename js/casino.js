/* casino:step5 */
/*
  Хаб казино (#/casino): три больших карточки игр, баланс, перерыв, ссылка на коллекцию.
  Перерыв читается только через casino-common (isOnBreak / clock). Страница ничего не пишет в сохранение.
*/
import * as M from './slots-math.js';
import { ensureSprite, sym } from './slots-art.js';
import { ic } from './icons.js';
import { loadAll, isOnBreak, clock, esc, fmt, readJson, KEY } from './casino-common.js';

const GAMES = [
  { id: 'slots', href: '#/slots', kind: 'Слоты', name: 'Колючий куш', text: 'Три ряда, двадцать линий, фриспины и ягодная поляна.', cta: 'К автомату' },
  { id: 'blackjack', href: '#/blackjack', kind: 'Карты', name: 'Блэкджек', text: 'Двадцать одно против крупье-ёжика.', cta: 'За стол' },
  { id: 'roulette', href: '#/roulette', kind: 'Колесо', name: 'Рулетка', text: 'Колесо, шарик и ставки на числа и цвета.', cta: 'К колесу' },
];
const ART = {
  slots: () => `<span class="cs-art cs-art--slots" aria-hidden="true">${sym('berry', 56)}${sym('hog', 72)}${sym('king', 56)}</span>`,
  blackjack: () => '<span class="cs-art cs-art--cards" aria-hidden="true"><span class="cs-pcard cs-pcard--red"><i>A</i><b>♥</b></span><span class="cs-pcard"><i>K</i><b>♠</b></span></span>',
  roulette: () => '<span class="cs-art cs-art--wheel" aria-hidden="true"><span class="cs-wheel"></span></span>',
};

export function renderCasinoPage() {
  const content = document.querySelector('#content');
  ensureSprite();
  let dead = false;
  const $ = sel => content.querySelector(sel);
  const cards = GAMES.map(g => `<a class="cs-game cs-game--${g.id}" href="${g.href}" data-game="${g.id}">${ART[g.id]()}<span class="cs-game-body"><span class="cs-kind">${esc(g.kind)}</span><strong>${esc(g.name)}</strong><small>${esc(g.text)}</small><span class="cs-game-meta" data-meta="${g.id}"></span></span><span class="cs-cta"><span data-cta="${g.id}">${esc(g.cta)}</span>${ic('arrowRight', 18)}</span></a>`).join('');
  content.innerHTML = `<section class="casino-page cs-hub" data-no-icons>
    <div class="intro cs-intro"><span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span><h1>Казино</h1><p class="sub">Слоты, блэкджек и рулетка на виртуальные ягоды из игры «Ёжик».</p><p class="cs-notice" role="note">Виртуальные ягоды без реальной ценности. Просто весёлая игра.</p></div>
    <div class="cs-status"><div class="cs-stat"><span>Ягоды</span><b id="cs-bal">0</b></div><div class="cs-stat"><span>Бесплатные спины</span><b id="cs-free">0</b></div><div class="cs-stat"><span>Капсулы</span><b id="cs-caps">0</b></div></div>
    <p class="cs-break" id="cs-break" role="status" hidden></p>
    <div class="cs-games">${cards}</div>
    <div class="cs-more"><a class="cs-collection" href="#/collection"><span class="cs-more-ic">${ic('sparkles', 22)}</span><span class="cs-more-body"><strong>Коллекция</strong><small>Капсулы, альбом, ежедневные спины, колесо дня и достижения</small></span><span class="cs-chip" id="cs-chip" hidden></span>${ic('arrowRight', 18)}</a>
      <a class="cs-nudge" id="cs-nudge" href="#/hedgehog"><span id="cs-nudgetxt"></span><span class="btn2">Покатать ёжика за ягодами</span></a></div>
  </section>`;

  function paint() {
    if (dead) return;
    const { S, H } = loadAll(), bal = (H.berries | 0) + (S.pending > 0 ? Math.floor(S.pending) : 0), br = isOnBreak(S);
    $('#cs-bal').textContent = fmt(bal);
    $('#cs-free').textContent = String((S.free | 0) + (H.bonusSpins | 0));
    $('#cs-caps').textContent = String(S.capsules | 0);
    const b = $('#cs-break'); b.hidden = !br; b.textContent = br ? `Перерыв до ${clock(S.breakUntil)}. Игры закрыты до этого времени — загляни к ёжику или конспектам.` : '';
    let chip = ''; try { chip = M.slotsChipText(H, localStorage.getItem(KEY)); } catch { chip = ''; }
    const c = $('#cs-chip'); c.hidden = !chip; c.textContent = chip;
    content.querySelectorAll('.cs-game').forEach(a => a.classList.toggle('is-break', br));
    for (const g of GAMES) { const cta = $(`[data-cta="${g.id}"]`); if (cta) cta.textContent = br ? 'Перерыв' : g.cta; }
    const meta = $('[data-meta="slots"]'); if (meta) meta.textContent = S.stats && S.stats.spins ? `Спинов: ${fmt(S.stats.spins)} · лучший выигрыш ${fmt(S.stats.biggest | 0)}` : '';
    const low = bal < 25; $('#cs-nudge').classList.toggle('is-low', low);
    $('#cs-nudgetxt').textContent = low ? 'Ягоды на исходе. Ёжик уже разминает лапки на холмах.' : 'Ягод маловато? Холмы, кувырки и яблоки ждут в игре «Ёжик».';
  }
  const ac = new AbortController(), timer = setInterval(paint, 1000);
  window.addEventListener('storage', paint, { signal: ac.signal });
  paint();
  function destroy() { if (dead) return; dead = true; clearInterval(timer); ac.abort(); }
  window.__hhDestroy = destroy;
}
