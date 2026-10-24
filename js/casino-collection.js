/* casino:step5 */
/*
  Коллекция (#/collection): альбом и капсулы, ежедневные спины, колесо дня, достижения, статистика.
  Функции renderAch…renderAlbum, runWheel, openCapsuleUi, claimDaily ПЕРЕНЕСЕНЫ из slots.js без переписывания
  (установщик вырезает их из slots.js); тут только окружение, которое им нужно, и вкладки.
*/
import * as M from './slots-math.js';
import { ensureSprite, sym, icon } from './slots-art.js';
import { ic } from './icons.js';
import { ACH, KIND_EMOJI, KIND_NAME, esc, fmt, reduce, CANCEL, loadAll, saveAll, applyItem, perksOf, itemName, toast, clearToasts, makeAwards, makeTimers, makeFx, getAudio } from './casino-common.js';

export const COLLECTION_TABS = [
  { id: 'album', label: 'Капсулы и альбом' },
  { id: 'daily', label: 'Ежедневно и колесо' },
  { id: 'stats', label: 'Достижения и статистика' },
];

export function renderCollectionPage(initial = '') {
  const content = document.querySelector('#content');
  ensureSprite();
  const { S, H } = loadAll();
  const audio = getAudio(), rng = M.cryptoRng();
  let dead = false, busy = false, tab = COLLECTION_TABS.some(t => t.id === initial) ? initial : 'album';
  const { later, wait, guard, destroy: stopTimers } = makeTimers(() => dead);
  const fx = makeFx(), burst = (n, kind) => fx.burst(n, kind);
  const $ = sel => content.querySelector(sel);
  const save = () => saveAll(S, H);
  save();

  content.innerHTML = `<section class="casino-page cs-collection-page" data-no-icons>
    <a class="cs-back" href="#/casino">${ic('arrowLeft', 16)}<span>Казино</span></a>
    <div class="intro cs-intro"><span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span><h1>Коллекция</h1><p class="sub">Капсулы, альбом, ежедневные спины, колесо дня и достижения.</p></div>
    <div class="cs-status"><div class="cs-stat"><span>Ягоды</span><b id="co-bal">0</b></div><div class="cs-stat"><span>Бесплатные спины</span><b id="co-free">0</b></div><div class="cs-stat"><span>Капсулы</span><b id="co-caps">0</b></div></div>
    <div class="cs-tabs" role="tablist" aria-label="Разделы коллекции">${COLLECTION_TABS.map(t => `<button type="button" class="cs-tab" role="tab" id="co-tab-${t.id}" data-tab="${t.id}" aria-controls="co-panel-${t.id}" aria-selected="false" tabindex="-1">${t.label}</button>`).join('')}</div>
    <div class="cs-panel" id="co-panel-album" role="tabpanel" aria-labelledby="co-tab-album" hidden><div class="sl-panels"><section class="dash-panel sl-wide" id="sl-album" aria-label="Альбом"></section></div></div>
    <div class="cs-panel" id="co-panel-daily" role="tabpanel" aria-labelledby="co-tab-daily" hidden><div class="sl-panels"><section class="dash-panel" id="sl-daily" aria-label="Ежедневные спины"></section><section class="dash-panel" id="sl-wheel" aria-label="Колесо дня"></section></div></div>
    <div class="cs-panel" id="co-panel-stats" role="tabpanel" aria-labelledby="co-tab-stats" hidden><div class="sl-panels"><section class="dash-panel" id="sl-ach" aria-label="Достижения"></section><section class="dash-panel" id="sl-stats" aria-label="Статистика"></section></div></div>
    <dialog id="sl-dlg" class="app-dialog sl-dlg"></dialog>
  </section>`;
  const dlg = $('#sl-dlg');

  const { award, checkAlbum } = makeAwards({ S, toast, audio, itemName, onChange: () => { renderAch(); renderAlbum(); } });

  function renderAch() {
    const el = $('#sl-ach'); if (!el) return; const n = Object.keys(S.ach).length;
    el.innerHTML = `<div class="panel-head"><h2>Достижения</h2><span class="sl-count">${n} из ${ACH.length}</span></div><ul class="sl-achlist">${ACH.map(a => `<li class="${S.ach[a.id] ? 'is-done' : ''}"><span aria-hidden="true">${S.ach[a.id] ? '🏆' : '🔒'}</span><div><strong>${esc(a.name)}</strong><small>${esc(a.desc)}</small></div></li>`).join('')}</ul><p class="plan-hint">За каждое достижение — капсула.</p>`;
  }
  function renderStats() {
    const st = S.stats;
    $('#sl-stats').innerHTML = `<div class="panel-head"><h2>Статистика</h2></div><dl class="sl-statlist"><div><dt>Спинов</dt><dd>${fmt(st.spins)}</dd></div><div><dt>Поставлено</dt><dd>${fmt(st.wagered)} 🍓</dd></div><div><dt>Выиграно</dt><dd>${fmt(st.won)} 🍓</dd></div><div><dt>Лучший выигрыш</dt><dd>${fmt(st.biggest)} 🍓</dd></div><div><dt>Фриспинов</dt><dd>${fmt(st.fs)}</dd></div><div><dt>Полян</dt><dd>${fmt(st.picks)}</dd></div><div><dt>Джекпотов</dt><dd>${fmt(st.jackpots)}</dd></div><div><dt>«Удвоить»: побед</dt><dd>${st.gambleWins}/${st.gambles}</dd></div></dl>`;
  }
  function renderDaily() {
    const p = M.dailyPreview(S), today = M.dayKey(), yest = M.dayKey(M.addDay(new Date(), -1)), chain = S.lastDay === today || S.lastDay === yest ? S.streak : 0;
    $('#sl-daily').innerHTML = `<div class="panel-head"><h2>Ежедневные спины</h2><span class="sl-count">серия: ${chain}</span></div>
      <ol class="sl-cal">${M.DAILY_SPINS.map((n, i) => `<li class="${i < chain ? 'is-done' : ''}${p.can && i + 1 === p.streak ? ' is-next' : ''}"><span>День ${i + 1}</span><b>${i === 6 ? '🎁' : '🎰'} ${n + (perksOf(H, S).dailyExtra | 0)}${perksOf(H).crown && i === 6 ? '+1' : ''}</b></li>`).join('')}</ol>
      <div class="sl-row"><button class="btn2 btn-primary" id="sl-claim" type="button" ${p.can ? '' : 'disabled'}>${p.can ? `Забрать спины (день ${p.streak})` : 'Сегодня уже забрано'}</button></div>
      <p class="plan-hint">Пропустишь день — серия начнётся заново. На 7-й день — капсула. Бесплатные спины идут на ставке ${M.DAILY_BET} и не копят джекпот.</p>`;
  }
  const wheelSvg = () => { const cols = ['#7c5cff', '#ff7fae', '#33b5a5', '#f0a53a', '#4d87bf'], R = 100, lab = s => (s.k === 'b' ? `${s.v}` : s.k === 'cap' ? '🎁' : '🎰');
    return `<svg viewBox="0 0 220 220" class="sl-wheelsvg" role="img" aria-label="Колесо дня"><g id="sl-wheelg" style="transform-origin:110px 110px">${M.WHEEL.map((s, i) => { const a0 = (i * 36 - 18 - 90) * Math.PI / 180, a1 = ((i + 1) * 36 - 18 - 90) * Math.PI / 180, x0 = 110 + R * Math.cos(a0), y0 = 110 + R * Math.sin(a0), x1 = 110 + R * Math.cos(a1), y1 = 110 + R * Math.sin(a1), am = (i * 36 - 90) * Math.PI / 180;
      return `<path d="M110 110L${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z" fill="${cols[i % 5]}" stroke="#fff" stroke-width="2"/><text x="${(110 + 70 * Math.cos(am)).toFixed(1)}" y="${(110 + 70 * Math.sin(am) + 5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" transform="rotate(${i * 36} ${(110 + 70 * Math.cos(am)).toFixed(1)} ${(110 + 70 * Math.sin(am)).toFixed(1)})">${lab(s)}</text>`; }).join('')}<circle cx="110" cy="110" r="14" fill="#fff" stroke="#2a2540" stroke-width="3"/></g></svg><div class="sl-pointer">${icon('pointer', 30)}</div>`; };
  function renderWheel() {
    const ready = M.wheelReady(S, H), d = H.daily, got = d && d.date === M.dayKey() ? d.goals.filter(g => g.done).length : 0;
    $('#sl-wheel').innerHTML = `<div class="panel-head"><h2>Колесо дня</h2><span class="sl-count">${ready ? 'заряжено' : `цели: ${got}/3`}</span></div><div class="sl-wheelwrap">${wheelSvg()}</div><div class="sl-row"><button class="btn2 btn-primary" id="sl-wheelgo" type="button" ${ready && !busy ? '' : 'disabled'}>${S.wheelDay === M.dayKey() ? 'Сегодня уже крутили' : 'Крутить колесо'}</button></div><p class="plan-hint">Выполни все три цели дня в игре «Ёжик» — колесо заряжается раз в сутки.</p>`;
  }
  function renderAlbum() {
    const p = M.albumProgress(S), kinds = ['hat', 'palette', 'greeting', 'boost', 'title', 'theme', 'cardback', 'chips', 'felt', 'emote', 'perkcharm'];
    $('#sl-album').innerHTML = `<div class="panel-head"><h2>Альбом и капсулы</h2><span class="sl-count">${p.have} из ${p.total}</span></div>
      <div class="sl-shelf"><div class="sl-caps">${icon('cap-common', 44)}${icon('cap-rare', 44)}${icon('cap-epic', 44)}${icon('cap-legendary', 44)}</div><div><b>Капсул: ${S.capsules}</b><small>Эпик гарантирован не позже ${M.pityOf(perksOf(H, S))}-й капсулы без него</small></div><button class="btn2 btn-primary" id="sl-opencap" type="button" ${S.capsules > 0 && !busy ? '' : 'disabled'}>Открыть капсулу</button></div>
      <div class="sl-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.have}"><span style="width:${(100 * p.have / p.total).toFixed(1)}%"></span></div>
      ${kinds.map(k => `<h3 class="sl-kindh">${KIND_NAME[k]}</h3><div class="sl-items">${M.CATALOG.filter(x => x.kind === k).map(x => { const n = S.album[x.id] | 0, eq = M.isEquipped(S, x.id); return `<div class="sl-item r-${x.rarity}${n ? ' is-own' : ''}"><span class="sl-itemic" aria-hidden="true">${n ? KIND_EMOJI[k] : '❔'}</span><strong>${n ? esc(x.name) : 'Ещё не найдено'}</strong><small>${n ? esc(x.desc) : esc(M.RARITY[x.rarity].name)}${n > 1 ? ` · ×${n}` : ''}</small>${n && M.EQUIPPABLE.includes(x.kind) ? `<button class="btn2" type="button" data-equip="${x.id}" ${eq ? 'disabled' : ''}>${eq ? 'Выбрано' : 'Выбрать'}</button>` : ''}${n && x.kind === 'palette' ? '<a class="btn2" href="#/settings">В настройки</a>' : ''}</div>`; }).join('')}</div>`).join('')}`;
  }

  const hud = () => {
    $('#co-bal').textContent = fmt(H.berries); $('#co-free').textContent = String((S.free | 0) + (H.bonusSpins | 0)); $('#co-caps').textContent = String(S.capsules | 0);
  };
  const renderPanels = () => { renderDaily(); renderWheel(); renderAlbum(); renderAch(); renderStats(); };
  const refresh = () => { hud(); renderDaily(); renderWheel(); renderAlbum(); renderStats(); };

  /* ---------- колесо, капсулы, ежедневные спины ---------- */
  async function runWheel() {
    if (busy || !M.wheelReady(S, H)) return; busy = true; hud(); const idx = M.wheelPick(rng), seg = M.WHEEL[idx]; S.wheelDay = M.dayKey();
    if (seg.k === 'b') H.berries += seg.v; else if (seg.k === 'cap') S.capsules++; else H.bonusSpins = (H.bonusSpins | 0) + 1; save();
    const g = $('#sl-wheelg'), turns = 360 * 5 + (360 - idx * 36);
    try {
      if (reduce()) { g.style.transform = `rotate(${turns}deg)`; await wait(200); }
      else { g.style.transition = 'transform 4.6s cubic-bezier(.12,.7,.15,1)'; g.getBoundingClientRect(); g.style.transform = `rotate(${turns}deg)`; let t = 0, d = 60; while (t < 4300) { later(() => audio.wheelTick(), t); t += d; d *= 1.08; } await wait(4800); }
      const what = seg.k === 'b' ? `+${seg.v} 🍓` : seg.k === 'cap' ? 'капсула 🎁' : '+1 бесплатный спин 🎰'; toast(`Колесо: ${what}`); audio.win('good'); burst(50);
    } catch (e) { if (e !== CANCEL) console.error(e); } finally { busy = false; if (!dead) { refresh(); renderWheel(); } }
  }
  async function openCapsuleUi() {
    if (busy || S.capsules < 1) return; busy = true; S.capsules--; const out = M.openCapsule(rng, S, perksOf(H, S)); applyItem(H, out.item); if (out.berries) H.berries += out.berries; save(); hud();
    dlg.innerHTML = `<div class="sl-capdlg"><div class="sl-capbig" id="sl-capbig">${icon('cap-common', 150)}</div><p id="sl-captxt" aria-live="polite">Трясём капсулу…</p><div id="sl-capcard"></div><div class="dialog-actions"><button class="btn2 btn-primary" type="button" data-close-dialog id="sl-capok" disabled>Класс!</button></div></div>`; dlg.showModal();
    try {
      const big = $('#sl-capbig'); for (let i = 0; i < 3; i++) { audio.shake(); big.classList.add('shaking'); await wait(430); big.classList.remove('shaking'); await wait(90); }
      audio.crack(out.item.rarity); big.innerHTML = icon(`cap-${out.item.rarity}`, 150); big.classList.add('crack'); await wait(420); $('#sl-captxt').textContent = M.RARITY[out.item.rarity].name;
      $('#sl-capcard').innerHTML = `<div class="sl-revealcard r-${out.item.rarity}"><span class="sl-itemic" aria-hidden="true">${KIND_EMOJI[out.item.kind]}</span><strong>${esc(out.item.name)}</strong><small>${esc(out.item.desc)}</small><em>${out.dup ? `Уже есть — обмен на ${out.berries} 🍓` : out.item.kind === 'boost' ? 'Применится в следующем забеге ёжика' : 'Новинка в альбоме!'}</em></div>`;
      if (out.item.rarity !== 'common') burst(out.item.rarity === 'legendary' ? 160 : 70);
    } catch (e) { if (e !== CANCEL) console.error(e); } finally { if (!dead) { busy = false; checkAlbum(); save(); refresh(); const ok = $('#sl-capok'); if (ok) ok.disabled = false; } }
  }
  function claimDaily() {
    const c = M.dailyClaim(S, new Date(), perksOf(H, S)); if (!c) return; audio.win('good');
    toast(`🎰 +${c.spins} ${c.spins === 1 ? 'бесплатный спин' : 'бесплатных спина'}${c.capsule ? ' и капсула 🎁' : ''}`);
    if (c.streak === 7) { award('meow'); toast('Мяу. 🐈 Семь дней подряд — кот одобряет.'); } save(); refresh();
  }


  function setTab(id, focus) {
    if (!COLLECTION_TABS.some(t => t.id === id)) return;
    tab = id;
    for (const t of COLLECTION_TABS) {
      const b = $(`#co-tab-${t.id}`), p = $(`#co-panel-${t.id}`), on = t.id === id;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; p.hidden = !on;
      if (on && focus) b.focus();
    }
    try { history.replaceState(null, '', `#/collection/${id}`); } catch { /* не критично */ }
  }
  const ac = new AbortController(), listen = (type, fn) => content.addEventListener(type, fn, { signal: ac.signal });
  listen('click', e => {
    const btn = e.target.closest && e.target.closest('button'); if (!btn || dead) return;
    if (btn.dataset.closeDialog !== undefined && dlg.open) dlg.close();
    if (btn.dataset.tab) return setTab(btn.dataset.tab);
    const id = btn.id;
    if (id === 'sl-claim') claimDaily(); else if (id === 'sl-wheelgo') guard(runWheel()); else if (id === 'sl-opencap') guard(openCapsuleUi());
    else if (btn.dataset.equip) { M.equipItem(S, btn.dataset.equip); save(); refresh(); }
  });
  listen('keydown', e => {
    const t = e.target.closest && e.target.closest('[role=tab]'); if (!t) return;
    const ids = COLLECTION_TABS.map(x => x.id), i = ids.indexOf(t.dataset.tab);
    const next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i + ids.length - 1) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids.at(-1) : '';
    if (next) { e.preventDefault(); setTab(next, true); }
  });

  function destroy() {
    if (dead) return;
    dead = true; ac.abort(); try { if (dlg.open) dlg.close(); } catch { /* уже закрыт */ }
    stopTimers(); fx.destroy(); clearToasts(); audio.destroy(); try { save(); } catch { /* квота */ }
  }
  window.__hhDestroy = destroy;
  renderPanels(); hud(); checkAlbum(); setTab(tab); save();
}
