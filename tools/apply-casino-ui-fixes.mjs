#!/usr/bin/env node
/*
  Правки интерфейса казино (рулетка, блэкджек, символ Wild).
  Запуск из корня репозитория:   node apply-casino-ui-fixes.mjs
  Или положить в tools/ и:       node tools/apply-casino-ui-fixes.mjs
  Флаги: --dry (ничего не писать), --root=путь (корень репозитория).
  Скрипт идемпотентен: уже применённые шаги пропускаются.

  Что делает:
   1. Рулетка: колесо крупнее и слева, ставки компактнее и справа; на телефоне — колесо сверху,
      стол, и закреплённая внизу панель (фишки → «Крутить»), подсказка из трёх шагов, прокрутка к колесу при спине.
   2. Ставки-фишки рулетки больше не сплющены (фиксированный круг, компактные подписи 1.5k).
   3. Блэкджек: крупный стол и карты, ёжик вынесен из рамки налево (на телефоне — над столом).
   4. Анимация раздачи: «залетает» только новая карта; вскрытие закрытой карты — отдельный переворот.
   5. Wild: настоящая карта с вопросительным знаком (знак больше не зеркальный).
*/
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), dry = args.includes('--dry');
const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = args.find(a => a.startsWith('--root='))?.slice(7);
const root = rootArg ? path.resolve(rootArg) : (() => { for (const c of [process.cwd(), path.resolve(here, '..'), here]) { try { readFileSync(path.join(c, 'js/roulette.js')); return c; } catch { /* дальше */ } } return process.cwd(); })();

let failed = 0, changedAny = false;
function edit(file, steps) {
  const p = path.join(root, file);
  let src;
  try { src = readFileSync(p, 'utf8'); } catch { console.error(`✗ ${file}: файл не найден (root: ${root})`); failed++; return; }
  const orig = src;
  for (const s of steps) {
    if (s.done && src.includes(s.done)) { console.log(`· ${file}: ${s.name} — уже применено`); continue; }
    const next = s.apply(src);
    if (next === null || next === src) { console.error(`✗ ${file}: ${s.name} — фрагмент не найден`); failed++; continue; }
    src = next; console.log(`✓ ${file}: ${s.name}`);
  }
  if (src !== orig) { changedAny = true; if (!dry) writeFileSync(p, src); }
}
// Замена регулярки с функцией-заменителем (чтобы «$» в тексте не трактовался особо); null — если не нашли
const sub = (re, text) => src => (re.test(src) ? src.replace(re, () => text) : null);

/* ======================================================================
   CSS
   ====================================================================== */
const CSS_START = '/* ui-fix:casino-tables start */', CSS_END = '/* ui-fix:casino-tables end */';
const CSS = `${CSS_START}
.cs-game-page{max-width:1280px}

/* ---------- Блэкджек: крупный стол, ёжик слева вне рамки ---------- */
.bj-stage{display:grid;grid-template-columns:clamp(170px,17vw,240px) minmax(0,1fr);gap:24px;align-items:start;max-width:1260px;margin:0 auto 28px}
.bj-dealer-side{display:flex;flex-direction:column;align-items:center;gap:16px;position:sticky;top:90px;text-align:center}
.bj-dealer-art{display:flex;flex-direction:column;align-items:center;gap:6px}
.bj-dealer-pic{display:block;font-size:clamp(5rem,9vw,8rem);line-height:1;filter:drop-shadow(0 10px 14px rgba(0,0,0,.4));animation:bj-bob 3.2s ease-in-out infinite}
.bj-dealer-title{font-weight:800;font-size:1.05rem}
.bj-dealer-side .bj-dealer-bubble{position:relative;width:100%;padding:12px 16px;font-size:.98rem;line-height:1.45;color:var(--text);background:var(--card);border:1px solid var(--border);border-radius:calc(14px * var(--rs,1));box-shadow:0 8px 22px rgba(0,0,0,.14)}
.bj-dealer-side .bj-dealer-bubble::before{content:"";position:absolute;left:50%;top:-10px;transform:translateX(-50%);border:5px solid transparent;border-top:0;border-bottom:7px solid var(--card)}
.bj-stage .bj-table{max-width:none;margin:0;gap:20px;padding:clamp(16px,2.4vw,32px)}
.bj-table{--bj-cw:clamp(60px,8.4vw,112px)}
.bj-hand-section{padding:18px 24px;gap:12px}
.bj-hand-label{font-size:1.2rem}
.bj-score{font-size:1.3rem;padding:4px 16px}
.bj-cards{min-height:calc(var(--bj-cw) * 1.4 + 12px);padding:6px 8px 6px 0}
.bj-card{width:var(--bj-cw);height:calc(var(--bj-cw) * 1.4);font-size:var(--bj-cw);padding:.07em .08em;border-radius:.12em}
.bj-card.is-facedown{width:var(--bj-cw);height:calc(var(--bj-cw) * 1.4);padding:0}
.bj-card+.bj-card{margin-left:calc(var(--bj-cw) * -.28)}
.bj-card-corner b{font-size:.24em}
.bj-card-corner i{font-size:.2em}
.bj-card-center{font-size:.42em}
.bj-placeholder{font-size:1.05rem;min-height:calc(var(--bj-cw) * 1.4)}
.bj-status-wrap{padding:14px 18px}
.bj-outcome{font-size:1.12rem}
.bj-shoe-pill{font-size:.9rem}
.bj-actions{gap:14px}
.bj-btn-main{min-height:58px;min-width:170px;font-size:1.08rem}
.bj-perk-pill{font-size:.9rem}
@keyframes bj-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-6px) rotate(2deg)}}
@keyframes bj-flip{from{transform:rotateY(90deg)}to{transform:none}}
.bj-card.is-flipping{animation:bj-flip .3s ease-out both}

@media(max-width:760px){
  .bj-stage{grid-template-columns:minmax(0,1fr);gap:12px}
  .bj-dealer-side{position:static;flex-direction:row;align-items:center;text-align:left;gap:12px}
  .bj-dealer-art{flex:none}
  .bj-dealer-pic{font-size:3.8rem}
  .bj-dealer-title{font-size:.8rem}
  .bj-dealer-side .bj-dealer-bubble{flex:1;width:auto}
  .bj-dealer-side .bj-dealer-bubble::before{left:-10px;top:50%;transform:translateY(-50%);border:5px solid transparent;border-left:0;border-right:7px solid var(--card)}
  .bj-table{--bj-cw:clamp(54px,17vw,84px)}
  .bj-hand-section{padding:12px 14px}
  .bj-btn-main{flex:1 1 40%;min-width:0}
}

/* ---------- Рулетка: колесо крупнее слева, ставки компактнее справа ---------- */
.ro-main-layout{grid-template-columns:minmax(0,1.5fr) minmax(300px,.85fr);gap:24px;max-width:1280px;align-items:start}
.ro-wheel-box{padding:clamp(12px,2vw,24px)}
.ro-wheel-wrap{width:min(100%,600px);height:auto;aspect-ratio:1/1}
.ro-wheelsvg{width:100%;height:100%}
.ro-last-num{width:19%;height:auto;aspect-ratio:1/1;font-size:clamp(1.4rem,3.4vw,2.6rem)}
.ro-hot-badge{font-size:1rem;padding:7px 18px}
.ro-hist-ball{width:36px;height:36px;font-size:.92rem}
.ro-hint{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0;font-size:.8rem;color:var(--muted)}
.ro-hint b{color:var(--accent)}
.ro-table{padding:12px;gap:6px}
.ro-cell{position:relative;min-height:36px;padding:2px;font-size:.86rem}
.ro-grid-chances{grid-template-columns:repeat(3,minmax(0,1fr))}

/* фишки: ровные круги, ничего не сжимается */
.ro-chip-anchor{position:absolute;top:-9px;right:-7px;z-index:5;display:flex;pointer-events:none}
.ro-chip-badge,.ro-chip-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;aspect-ratio:1/1;padding:0;line-height:1;white-space:nowrap;
  background:radial-gradient(circle,var(--c) 0 66%,transparent 67%),repeating-conic-gradient(var(--ct-chip-stripe,#fff) 0 12deg,var(--c) 12deg 45deg)}
.ro-chip-badge{--ct-chip-size:30px;width:30px;height:30px;min-width:30px;min-height:30px;font-size:.62rem;border-width:2px}
.ro-chip-btn{--ct-chip-size:48px;width:48px;height:48px;min-width:48px;min-height:48px;font-size:.82rem;cursor:pointer}

/* панель управления */
.ro-controls-row{flex-direction:column;align-items:stretch;gap:10px;margin:0;padding:12px;background:var(--gl-fill,var(--card));border:1px solid var(--border);border-radius:calc(14px * var(--rs,1))}
.ro-chip-selector{justify-content:center;flex-wrap:wrap;gap:8px}
.ro-stake-stat{justify-content:space-between}
.ro-btns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ro-btns .btn2{min-height:44px;padding-inline:6px;font-size:.85rem}
.ro-btns .ro-spin-btn{grid-column:1/-1;order:-1;min-height:54px;font-size:1.05rem}

@media(max-width:860px){
  .ro-main-layout{grid-template-columns:minmax(0,1fr);gap:14px;justify-items:stretch}
  .ro-left-col,.ro-right-col{width:100%}
  .ro-wheel-wrap{width:min(100%,400px)}
  .ro-wheel-box{padding:10px}
  .ro-cell{min-height:46px;font-size:.95rem}
  .ro-summary{order:-1;margin:0}
  .ro-chip-btn{--ct-chip-size:44px;width:44px;height:44px;min-width:44px;min-height:44px}
  /* закреплённая панель: фишка → поле стола → «Крутить» всегда под рукой */
  .ro-controls-row{position:sticky;bottom:12px;z-index:60;border-color:var(--accent);background:color-mix(in srgb,var(--card) 94%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 -6px 28px rgba(0,0,0,.28)}
  .ro-chip-selector{flex-wrap:nowrap;overflow-x:auto}
}
@media(max-width:760px){
  .ro-controls-row{bottom:calc(env(safe-area-inset-bottom,0px) + 72px)}
}
@media(prefers-reduced-motion:reduce){.bj-dealer-pic,.bj-card.is-flipping{animation:none!important}}
${CSS_END}
`;
const cssStep = {
  name: 'стили рулетки и блэкджека',
  apply: src => {
    const a = src.indexOf(CSS_START), b = src.indexOf(CSS_END);
    if (a >= 0 && b > a) return src.slice(0, a) + CSS.trimEnd() + src.slice(b + CSS_END.length).replace(/^\n?/, '\n');
    return src.replace(/\s*$/, '\n\n') + CSS;
  },
};

/* ======================================================================
   js/roulette.js
   ====================================================================== */
const SCROLL = `/* ui-fix */ { const wheelBox = $('#ro-wheel-wrap'); if (wheelBox && typeof wheelBox.scrollIntoView === 'function' && matchMedia('(max-width: 860px)').matches) wheelBox.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' }); }
    hudState.locked = true; hud.update();`;
edit('js/roulette.js', [
  {
    name: 'компактная подпись фишки (1.5k)', done: 'const chipLabel',
    apply: src => {
      const helper = "const chipLabel = n => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1000 ? +(n / 1000).toFixed(1) + 'k' : String(n));\n\nexport function renderRoulettePage() {";
      if (!/export function renderRoulettePage\(\) \{/.test(src)) return null;
      return src.replace(/export function renderRoulettePage\(\) \{/, () => helper);
    },
  },
  {
    name: 'фишка на столе использует chipLabel', done: '${chipLabel(b.stake)}',
    apply: sub(/\$\{b\.stake >= 1000 \? \(b\.stake \/ 1000\) \+ 'k' : b\.stake\}/, '${chipLabel(b.stake)}'),
  },
  {
    name: 'подсказка из трёх шагов над столом', done: 'class="ro-hint"',
    apply: sub(/<div class="ro-table ct-felt" id="ro-table"/, '<p class="ro-hint"><span><b>1</b> Выберите фишку</span><span><b>2</b> Нажмите на поле стола</span><span><b>3</b> Крутите колесо</span></p>\n        <div class="ro-table ct-felt" id="ro-table"'),
  },
  {
    name: 'на телефоне прокрутка к колесу при спине', done: '/* ui-fix */',
    apply: sub(/hudState\.locked = true; hud\.update\(\);/, SCROLL),
  },
]);

/* ======================================================================
   js/blackjack.js
   ====================================================================== */
edit('js/blackjack.js', [
  {
    name: 'счётчики показанных карт', done: 'let shownD',
    apply: sub(/let dealerRevealed = false;/, 'let dealerRevealed = false;\n  let shownD = 0, shownP = 0, holeShown = false; // сколько карт уже на столе: анимируем только новые'),
  },
  {
    name: 'ёжик вынесен из рамки стола', done: 'bj-stage',
    apply: src => {
      const wrap = /<div class="bj-dealer-wrap">\s*<div class="bj-dealer-art">[\s\S]*?<\/div>\s*<div class="bj-dealer-bubble"[^>]*>[^<]*<\/div>\s*<\/div>/;
      const open = /<div class="bj-table ct-felt" id="bj-table">/;
      const close = /(<div class="bj-actions" id="bj-actions"><\/div>\s*<\/div>)(\s*<dialog id="bj-dlg")/;
      if (!wrap.test(src) || !open.test(src) || !close.test(src)) return null;
      const side = `<div class="bj-stage">
      <aside class="bj-dealer-side" aria-label="Крупье">
        <div class="bj-dealer-art">
          <span class="bj-dealer-pic" aria-hidden="true">🦔</span>
          <span class="bj-dealer-title">Крупье-ёжик</span>
        </div>
        <div class="bj-dealer-bubble" id="bj-dealer-bubble" role="status">Фыр! Делайте ставку и погнали.</div>
      </aside>
      <div class="bj-table ct-felt" id="bj-table">`;
      return src.replace(wrap, () => '').replace(open, () => side).replace(close, (_, a, b) => `${a}\n    </div>${b}`);
    },
  },
  {
    name: 'карты дилера: анимация только у новых, переворот закрытой', done: 'flipHole',
    apply: sub(/const dCards = currentRound\.dealer \|\| \[\];\s*\$\('#bj-dealer-cards'\)\.innerHTML = dCards\.map\(\(c, i\) => renderCard\(c, i === 1 && !dealerRevealed, true\)\)\.join\(''\);/,
      `const dCards = currentRound.dealer || [];
    const flipHole = dealerRevealed && !holeShown && dCards.length >= 2;
    $('#bj-dealer-cards').innerHTML = dCards.map((c, i) => {
      let html = renderCard(c, i === 1 && !dealerRevealed, i >= shownD);
      if (flipHole && i === 1) html = html.replace('class="bj-card ', 'class="bj-card is-flipping ');
      return html;
    }).join('');
    shownD = dCards.length; holeShown = dealerRevealed && dCards.length >= 2;`),
  },
  {
    name: 'карты игрока: анимация только у новых', done: 'i >= shownP',
    apply: sub(/\$\('#bj-player-cards'\)\.innerHTML = pCards\.map\(c => renderCard\(c, false, true\)\)\.join\(''\);/,
      "$('#bj-player-cards').innerHTML = pCards.map((c, i) => renderCard(c, false, i >= shownP)).join('');\n    shownP = pCards.length;"),
  },
  {
    name: 'сброс счётчиков в начале раздачи', done: 'shownD = 0, shownP = 0;',
    apply: sub(/inHand = true; dealerRevealed = false;/, 'inHand = true; dealerRevealed = false; shownD = 0; shownP = 0; holeShown = false;'),
  },
  {
    name: 'добор дилера не показывается разом до анимации (1/2)', done: 'const fullDealerCards',
    apply: sub(/B\.stand\(currentRound, shoe\);/, 'B.stand(currentRound, shoe);\n    const fullDealerCards = [...currentRound.dealer];\n    currentRound.dealer = fullDealerCards.slice(0, initialDealerLen); // добор покажем по одной карте'),
  },
  {
    name: 'добор дилера не показывается разом до анимации (2/2)', done: 'fullDealerCards.length',
    apply: sub(/if \(currentRound\.dealer\.length > initialDealerLen\) \{\s*const fullDealer = \[\.\.\.currentRound\.dealer\];/, 'if (fullDealerCards.length > initialDealerLen) {\n      const fullDealer = fullDealerCards;'),
  },
]);

/* ======================================================================
   js/slots-art.js: Wild — карта с вопросительным знаком
   ====================================================================== */
const WILD = `  wild: '<circle cx="50" cy="50" r="46" fill="url(#g-glow)"/>'
    + '<rect x="20" y="8" width="60" height="84" rx="8" fill="#fff" stroke="#e2b036" stroke-width="4"/>'
    + '<rect x="26" y="14" width="48" height="72" rx="5" fill="none" stroke="#d6246e" stroke-opacity=".35" stroke-width="1.5"/>'
    + '<path d="M38 38c0-9 5-14 12-14s12 5 12 13c0 11-12 11-12 22" fill="none" stroke="#d6246e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="50" cy="73" r="5" fill="#d6246e"/>'
    + '<text x="30" y="27" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="12" fill="#d6246e">?</text>'
    + '<text x="70" y="79" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="12" fill="#d6246e" transform="rotate(180 70 75)">?</text>'
    + sparkle(22, 16, 5, '#ffd84a') + sparkle(80, 20, 6, '#fff'),
`;
edit('js/slots-art.js', [
  {
    name: 'символ Wild — карта с «?»', done: 'font-size="12" fill="#d6246e">?</text>',
    apply: sub(/  wild: '<circle cx="50" cy="50" r="46"[\s\S]*?sparkle\(76, 22, 6, '#fff'\),\r?\n/, WILD),
  },
  {
    name: 'подпись Wild', done: "wild: 'Wild (карта с вопросом)'",
    apply: sub(/wild: 'Дикий шар-ёжик \(Wild\)'/, "wild: 'Wild (карта с вопросом)'"),
  },
]);

/* ======================================================================
   css/casino.css (+ поднять версию кэша service worker, чтобы правки дошли сразу)
   ====================================================================== */
edit('css/casino.css', [cssStep]);
edit('sw.js', [{
  name: 'версия кэша оболочки +1',
  apply: src => { const m = /const CACHE = 'm3102-shell-v(\d+)';/.exec(src); return changedAny && m ? src.replace(m[0], () => `const CACHE = 'm3102-shell-v${+m[1] + 1}';`) : null; },
}]);

console.log(failed ? `\nГотово с ошибками: ${failed}. Файлы с ошибками шагов могли остаться без части правок.` : dry ? '\nПробный запуск: всё применимо, файлы не изменены.' : '\nГотово. Запустите: npm test');
process.exit(failed ? 1 : 0);
