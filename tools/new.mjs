// tools/apply-content-pack.mjs
// Дедушкина кепка, +5 рубашек, +5 фишек (с мини-перками), +5 сукон, +5 эмоций, +5 талисманов, новые пасхалки ёжика.
// Запуск из корня репозитория: node tools/apply-content-pack.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';

const dry = process.argv.includes('--dry');
const root = new URL('../', import.meta.url);
const files = new Map();
const load = f => { if (!files.has(f)) { const text = readFileSync(new URL(f, root), 'utf8'); files.set(f, { text, crlf: text.includes('\r\n') }); } return files.get(f); };
let bad = 0, applied = 0, skipped = 0;

// edit: { find, replace, all? }. Уже применённая правка (в файле есть replace) пропускается.
function patch(file, edits) {
  const F = load(file), fix = s => (F.crlf ? s.replace(/\r?\n/g, '\r\n') : s);
  for (const e of edits) {
    const find = fix(e.find), replace = fix(e.replace);
    if (F.text.includes(replace)) { skipped++; continue; }
    if (!F.text.includes(find)) { bad++; console.error('✗ не найден якорь в ' + file + ':\n   ' + e.find.split('\n')[0].slice(0, 110)); continue; }
    F.text = e.all ? F.text.split(find).join(replace) : F.text.replace(find, () => replace);
    applied++;
  }
}

/* ============================ 1. js/slots-math.js: каталог и перки ============================ */
const CATALOG_NEW = String.raw`
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
  it('perkcharm:ladybug', 'perkcharm', 'Божья коровка', 'epic', 'Эффект: +1 к ежедневным спинам'),`;
const PERKS_NEW = String.raw`
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
  'perkcharm:ladybug': { dailyExtra: 1 },`;
patch('js/slots-math.js', [
  { find: `'Эффект: блэкджек платит 3:2 за 21 из трёх карт'),`, replace: `'Эффект: блэкджек платит 3:2 за 21 из трёх карт'),` + CATALOG_NEW },
  { find: `'perkcharm:ace': { bjBonus: 0.5 },`, replace: `'perkcharm:ace': { bjBonus: 0.5 },` + PERKS_NEW },
  // Набор «Легенда зала» остаётся за три исходных талисмана, а не за все
  { find: `export const CHARM_SET = CATALOG.filter(x => x.kind === 'perkcharm').map(x => x.id);`, replace: `export const CHARM_SET = ['perkcharm:clover', 'perkcharm:horseshoe', 'perkcharm:ace'];` },
]);

/* ============================ 2. js/casino-themes.js: оформление ============================ */
const STYLES_NEW = String.raw`
  /* content-pack */
  'cardback:hedgehog': { '--ct-cb-a': '#6c473d', '--ct-cb-b': '#f7c291', '--ct-cb-c': '#f27ab0', '--ct-cb-pattern': 'radial-gradient(circle,rgba(255,211,182,.55) 0 2px,transparent 3px) 0 0/12px 12px' },
  'cardback:circuit': { '--ct-cb-a': '#0e3a2a', '--ct-cb-b': '#33ff99', '--ct-cb-c': '#ffd84a', '--ct-cb-pattern': 'linear-gradient(90deg,rgba(51,255,153,.35) 1px,transparent 1px) 0 0/10px 10px,linear-gradient(rgba(51,255,153,.25) 1px,transparent 1px) 0 0/10px 10px' },
  'cardback:orange': { '--ct-cb-a': '#e8730e', '--ct-cb-b': '#ffd9a0', '--ct-cb-c': '#3a2410', '--ct-cb-pattern': 'radial-gradient(circle,rgba(255,255,255,.4) 0 3px,transparent 4px) 0 0/16px 16px' },
  'cardback:starry': { '--ct-cb-a': '#141a46', '--ct-cb-b': '#cfe3ff', '--ct-cb-c': '#ffe27a', '--ct-cb-pattern': 'radial-gradient(circle,rgba(255,255,255,.85) 0 1px,transparent 2px) 0 0/14px 14px,radial-gradient(circle,rgba(124,240,255,.6) 0 1px,transparent 2px) 7px 7px/14px 14px' },
  'cardback:gilded': { '--ct-cb-a': '#3a2a08', '--ct-cb-b': '#f0c95a', '--ct-cb-c': '#fff1b0', '--ct-cb-pattern': 'repeating-linear-gradient(45deg,rgba(255,241,176,.25) 0 2px,transparent 2px 9px)' },
  'felt:midnight': { '--ct-felt-a': '#1b2440', '--ct-felt-b': '#0a0f20', '--ct-felt-line': '#6f86ff', '--ct-felt-ink': '#e6ecff' },
  'felt:sand': { '--ct-felt-a': '#c9a96e', '--ct-felt-b': '#8c6d3a', '--ct-felt-line': '#fff1c4', '--ct-felt-ink': '#2b1d00' },
  'felt:royal': { '--ct-felt-a': '#1f4aa8', '--ct-felt-b': '#0c2159', '--ct-felt-line': '#ffd84a', '--ct-felt-ink': '#eef3ff' },
  'felt:emerald': { '--ct-felt-a': '#0f8a5f', '--ct-felt-b': '#054a33', '--ct-felt-line': '#7dffc4', '--ct-felt-ink': '#eafff5' },
  'felt:aurora': { '--ct-felt-a': '#2fb39a', '--ct-felt-b': '#4a2f8a', '--ct-felt-line': '#e07ad0', '--ct-felt-ink': '#f6ecff' },
  'chips:gold': { '--ct-chip-1': '#fff1b0', '--ct-chip-2': '#f0c95a', '--ct-chip-3': '#c9962a', '--ct-chip-4': '#6e4a0c', '--ct-chip-edge': '#fff1b0', '--ct-chip-ink': '#2b1d00', '--ct-chip-stripe': '#fff8d6' },
  'chips:neon': { '--ct-chip-1': '#d6fbff', '--ct-chip-2': '#19d3ff', '--ct-chip-3': '#d61fd6', '--ct-chip-4': '#2a0a3a', '--ct-chip-edge': '#19d3ff', '--ct-chip-ink': '#0b0f2e', '--ct-chip-stripe': '#ffffff' },
  'chips:ice': { '--ct-chip-1': '#f2fbff', '--ct-chip-2': '#a9e3ff', '--ct-chip-3': '#5fb4e8', '--ct-chip-4': '#1d4a78', '--ct-chip-edge': '#ffffff', '--ct-chip-ink': '#0d2a44', '--ct-chip-stripe': '#ffffff' },
  'chips:mint': { '--ct-chip-1': '#e6fff3', '--ct-chip-2': '#5fd9a2', '--ct-chip-3': '#1f9d63', '--ct-chip-4': '#0b3d27', '--ct-chip-edge': '#e6fff3', '--ct-chip-ink': '#0b3d27', '--ct-chip-stripe': '#e6fff3' },
  'chips:rainbow': { '--ct-chip-1': '#ffd1e3', '--ct-chip-2': '#ffd84a', '--ct-chip-3': '#4aa8ff', '--ct-chip-4': '#9069cf', '--ct-chip-edge': '#ffffff', '--ct-chip-ink': '#2a1a40', '--ct-chip-stripe': '#ffffff' },`;
patch('js/casino-themes.js', [
  { find: `'cardback:marked': { '--ct-cb-a': '#233466', '--ct-cb-b': '#4d87bf', '--ct-cb-c': '#ffe27a' },`, replace: `'cardback:marked': { '--ct-cb-a': '#233466', '--ct-cb-b': '#4d87bf', '--ct-cb-c': '#ffe27a' },` + STYLES_NEW },
]);

/* ============================ 3. js/casino-common.js: эмоции и плашки ============================ */
const COMMON_NEW = String.raw`

/* content-pack: реплики эмоций и плашки новых предметов за столами */
export const EMOTES = {
  'emote:fyr': '🦔 Крупье-ёжик довольно фырчит: «Фыр-фыр!»',
  'emote:meow': '🐈 Из-за стола донеслось тихое: «Мяу.»',
  'emote:cheer': '🎉 Ёжик подбрасывает ягоды: «Ура-а-а!»',
  'emote:think': '🤔 Ёжик прищурился: «Хм-м-м… а если так?»',
  'emote:cmon': '🔥 Ёжик стучит лапой по столу: «Ну давай же!»',
  'emote:flip': '🤸 Ёжик делает кувырок прямо на сукне. Фыр!',
};
const BASE_PILL_SKIP = new Set(['felt:burgundy', 'chips:berry', 'emote:fyr', 'cardback:marked', 'perkcharm:horseshoe', 'perkcharm:ace']);
/** Плашки надетых предметов, у которых нет собственной плашки в играх. cls: 'bj' | 'ro'. */
export function extraPills(S, cls) {
  const out = [], eq = (S && S.equip) || {}, album = (S && S.album) || {};
  for (const kind of ['felt', 'chips', 'cardback', 'perkcharm', 'emote']) {
    const id = eq[kind], it = id && M.ITEM[id];
    if (!it || BASE_PILL_SKIP.has(id) || !(album[id] || M.FREE_ITEMS.includes(id))) continue;
    if (kind === 'emote') out.push('<button class="btn2 ' + cls + '-emote-btn" type="button" data-emote="' + esc(id) + '">🦔 ' + esc(it.name) + '</button>');
    else out.push('<span class="' + cls + '-perk-pill" title="' + esc(it.desc) + '">' + esc(it.name) + '</span>');
  }
  return out;
}`;
patch('js/casino-common.js', [
  { find: `export const getAudio = () => makeSlotsAudio();`, replace: `export const getAudio = () => makeSlotsAudio();` + COMMON_NEW },
]);

/* ============================ 4. blackjack.js / roulette.js ============================ */
const IMPORT_FIND = `  ACH\n} from './casino-common.js';`, IMPORT_NEW = `  ACH, EMOTES, extraPills\n} from './casino-common.js';`;
const EMOTE_HANDLER = `else if (btn.dataset.emote) { audio.click(); toast(EMOTES[btn.dataset.emote] || '🦔 Фыр!'); }\n    else if (btn.dataset.break) {`;
patch('js/blackjack.js', [
  { find: IMPORT_FIND, replace: IMPORT_NEW },
  // плашка «Туз в рукаве» — только когда надет именно он (а не фишки с bjBonus)
  { find: `if (perks.bjBonus > 0) {`, replace: `if (S.equip && S.equip.perkcharm === 'perkcharm:ace') {` },
  { find: `$('#bj-perks-bar').innerHTML = pills.join('');`, replace: `pills.push(...extraPills(S, 'bj'));\n    $('#bj-perks-bar').innerHTML = pills.join('');` },
  { find: `else if (btn.dataset.break) {`, replace: EMOTE_HANDLER },
]);
patch('js/roulette.js', [
  { find: IMPORT_FIND, replace: IMPORT_NEW },
  { find: `if (perks.rouletteRefund > 0) {`, replace: `if (S.equip && S.equip.perkcharm === 'perkcharm:horseshoe') {` },
  { find: `$('#ro-perks-bar').innerHTML = pills.join('');`, replace: `pills.push(...extraPills(S, 'ro'));\n    $('#ro-perks-bar').innerHTML = pills.join('');` },
  { find: `else if (btn.dataset.break) {`, replace: EMOTE_HANDLER },
  { find: `Талисман «Подкова» (возврат на число):`, replace: `Возврат за проигранные ставки на число:` },
  { find: `Талисман «Подкова» вернул`, replace: `Возврат за число:` },
]);

/* ============================ 5. index.html: шляпа-дедушка и пасхалки ============================ */
const HAT_DRAW = String.raw`}else if(id==='grandpa'){
    ctx.fillStyle='#7a6652';ctx.beginPath();ctx.ellipse(-0.04*R,-0.1*R,0.5*R,0.3*R,-0.06,Math.PI,0);ctx.closePath();ctx.fill();
    ctx.fillStyle='#5a4a3a';ell(ctx,0.34*R,-0.02*R,0.36*R,0.07*R,0.06);
    ctx.strokeStyle='rgba(255,255,255,0.22)';ctx.lineWidth=0.03*R;ctx.beginPath();ctx.moveTo(-0.3*R,-0.12*R);ctx.lineTo(-0.12*R,-0.36*R);ctx.moveTo(0,-0.1*R);ctx.lineTo(0.12*R,-0.37*R);ctx.moveTo(-0.4*R,-0.2*R);ctx.lineTo(0.3*R,-0.2*R);ctx.stroke();
    ctx.fillStyle='#a58d73';circ(ctx,-0.04*R,-0.4*R,0.045*R);
  }else if(id==='crown'){`;
const WORD_NEW = String.raw`if(w==='rust'){this.addBanner('🦀 Борроу-чекер доволен! Щит выдан');h.shd=25;this.audio.sfx('mush');this.burst(c.x,c.y,14,{col:'#c9622a',size:5,sp:220,life:0.7,g:0,type:'star'});}
    else if(w==='matan'){this.addBanner('∀ε>0 ∃δ>0: ягоды сходятся!');for(let i=0;i<10;i++){const x=c.x+260+i*50;this.world.pickups.push({x,y:T.y(x)-60-Math.round(90/(i+1)),kind:'berry',got:false,ph:i});}this.audio.sfx('mush');}
    else if(w==='coffee'){this.addBanner('☕ Двойной эспрессо!');h.cof=8;this.sleep=0;h.boostT=Math.max(h.boostT,3);this.audio.sfx('mush');}
    else if(w==='moon'){this.addBanner('🌕 Лунная гравитация!');h.fea=12;this.audio.sfx('flower');}
    else if(w==='itmo'){this.rainT=5;`;
const EGGS_NEW = String.raw`if(r.flips>=100&&!this.ms.e100){this.ms.e100=1;this.addBanner('🌪 100 кувырков за забег — ёжик-волчок! +25 🍓');this.save.berries+=25;r.berries+=25;this.audio.sfx('unlock');this.burst(c.x,c.y,22,{type:'star',col:'#ffe066',size:6,sp:280,life:0.9,g:0});}
    if(this.t>=404&&!this.ms.e404){this.ms.e404=1;this.sleep=0;this.addBanner('🔍 Ошибка 404: сонливость не найдена');this.audio.sfx('goal');}
    if(r.berries>=77&&!this.ms.e77){this.ms.e77=1;this.addBanner('🎰 77 ягод за забег — загляни в казино! +7 🍓');this.save.berries+=7;r.berries+=7;this.audio.sfx('goal');}
    if(new Date().getHours()===3&&!this.ms.e3am){this.ms.e3am=1;this.text(c.x,c.y-R*2.6,'Три часа ночи. Ёжик тоже не спит.','#c9d6ff',22);}
    if(this.sleep>=0.9&&this.state==='play'&&!this.ms.enap){`;
const PREVIEW_NEW = String.raw`if(pc===50&&!save.owned.includes('grandpa')){save.owned.push('grandpa');persist(save);audio.sfx('unlock');const sg=$('.hh-start .hh-sub');if(sg)sg.innerHTML='👴 Дедушка оставил свою кепку!<br>Загляни в «Шляпы».';}audio.sfx('flower');pv.classList.remove('hh-boing');`;
patch('index.html', [
  { find: `perk:'Каждая седьмая ягода забега — двойная'}`, replace: `perk:'Каждая седьмая ягода забега — двойная'},{id:'grandpa',name:'Дедушкина кепка',cost:320,perk:'Бодрость восстанавливается быстрее'}` },
  { find: `}else if(id==='crown'){`, replace: HAT_DRAW },
  { find: `(this.save.hat==='halo'?1.5:1)`, replace: `(this.save.hat==='halo'?1.5:this.save.hat==='grandpa'?1.35:1)` },
  { find: `1337:'😎 1337 м — l33t-ёж'};`, replace: `1337:'😎 1337 м — l33t-ёж',256:'💾 256 м — ровно один байт!',777:'🎰 777 м — счастливое число!',1024:'📦 1024 м — один «кибиметр»',3141:'🥧 3141 м — π-рожок'};` },
  { find: `'KeyG,KeyI,KeyT':'git'};`, replace: `'KeyG,KeyI,KeyT':'git','KeyR,KeyU,KeyS,KeyT':'rust','KeyM,KeyA,KeyT,KeyA,KeyN':'matan','KeyC,KeyO,KeyF,KeyF,KeyE,KeyE':'coffee','KeyM,KeyO,KeyO,KeyN':'moon'};` },
  { find: `if(w==='itmo'){this.rainT=5;`, replace: WORD_NEW },
  { find: `if(this.sleep>=0.9&&this.state==='play'&&!this.ms.enap){`, replace: EGGS_NEW },
  { find: `audio.sfx('flower');pv.classList.remove('hh-boing');`, replace: PREVIEW_NEW },
]);

/* ============================ 6. sw.js: свежий кэш оболочки ============================ */
patch('sw.js', [{ find: `const CACHE = 'm3102-shell-v15';`, replace: `const CACHE = 'm3102-shell-v16';` }]);

/* ============================ 7. тесты: размер каталога 50 → 75 ============================ */
patch('tests/slots.mjs', [
  { find: `assert.equal(M.CATALOG.length, 50);`, replace: `assert.equal(M.CATALOG.length, 75);`, all: true },
  { find: `assert.equal(ids.size, 50);`, replace: `assert.equal(ids.size, 75);` },
  { find: `каталог: 50 предметов`, replace: `каталог: 75 предметов` },
]);
patch('tests/casino-perks.mjs', [{ find: `assert.equal(M.CATALOG.length, 50);`, replace: `assert.equal(M.CATALOG.length, 75);` }]);

/* ============================ запись ============================ */
if (bad) { console.error(`\nОтмена: ${bad} якор(ей) не найдено, ни один файл не изменён.`); process.exit(1); }
if (!dry) for (const [f, F] of files) writeFileSync(new URL(f, root), F.text);
console.log(`${dry ? '[dry] ' : ''}Готово: применено правок ${applied}, уже были ${skipped}, файлов ${files.size}.`);
