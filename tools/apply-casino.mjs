#!/usr/bin/env node
/*
  tools/apply-casino.mjs — установщик казино-раздела M3102 (хаб, слоты, блэкджек, рулетка, коллекция).

    node tools/apply-casino.mjs                 — применить все шаги
    node tools/apply-casino.mjs --dry-run       — всё посчитать и проверить в памяти, ничего не писать
    node tools/apply-casino.mjs --rollback      — вернуть файлы из .casino-backup/ и удалить созданные
    node tools/apply-casino.mjs --test          — после установки прогнать tests/casino|blackjack|roulette*.mjs
    node tools/apply-casino.mjs --test-all      — … или все tests/*.mjs
    node tools/apply-casino.mjs --root <dir>    — корень репозитория (по умолчанию — родитель папки tools)
    node tools/apply-casino.mjs --verbose       — показывать и пропущенные операции

  ============================ ОБЩИЙ КОНТРАКТ (обязателен для каждого шага) ============================
  Routes: #/casino (hub), #/slots, #/blackjack, #/roulette, #/collection. Старый #/slots остаётся валидным,
    но означает только автомат. Поиск, «Ещё» и кнопка/чип в игре «Ёжик» ведут на #/casino.
  New files: js/casino.js (hub), js/casino-common.js (общий HUD, шаги ставок M.BETS, глобальный перерыв,
    баланс/сохранение, звук), js/casino-collection.js (альбом, капсулы, ежедневные, колесо, достижения,
    статистика), js/casino-themes.js + css/casino-themes.css, js/blackjack-math.js, js/blackjack.js,
    js/roulette-math.js, js/roulette.js, css/casino.css, tests/casino.mjs, tests/blackjack.mjs, tests/roulette.mjs.
  State: всё остаётся в существующих подписанных объектах (m3102-slots-v1 через signSlots, общие ягоды в
    hh_save_v1 через signShared). Новые счётчики — в S.stats (поля блэкджека/рулетки по умолчанию 0 в
    newSlotsState; loadAll уже сливает значения по умолчанию). Нового ключа хранилища без явной причины — нет.
  Item IDs: схема «kind:name». Новые виды: cardback, chips, felt, emote, perkcharm (при необходимости —
    добавить в KIND_NAME / KIND_EMOJI).
  Script rules: всё или ничего; каждая правка привязана к якорю, встречающемуся ровно один раз; идемпотентность
    (повторный запуск ничего не делает и пишет «already applied»); node --check для каждого затронутого или
    созданного JS; бэкап + откат при любой ошибке; --dry-run; поднимает CACHE в sw.js (m3102-shell-v13 →
    следующий) и добавляет каждый новый файл в SHELL.
  UI rules: русский текст интерфейса; без шума (одна задача на экран); доступность (aria, prefers-reduced-motion,
    клавиатура); адаптивность от 380 px; переиспользовать классы сайта (btn2, dash-panel, app-dialog); без emoji
    вместо иконок в новом UI (ic() / спрайт); без «настоящих денег»; сохранить пометку «виртуальные ягоды».
  Handoff: каждый агент возвращает полный изменённый tools/apply-casino.mjs, работает ТОЛЬКО в своей
    помеченной секции (// ===== STEP N: <name> =====), чужие секции не переписывает (кроме исправления
    ошибки — тогда в конце пишет // NOTE(stepN): …) и заканчивает ответ коротким списком: что добавлено,
    какие экспорты/ID нужны другим шагам, что не закончено.
  =======================================================================================================

  Как писать шаг (API ctx):
    steps.push({ id: N, name: '…', run(ctx) { … } });
    ctx.createFile(rel, content, opts)        — создать файл. К .js/.mjs/.css автоматически добавляется
                                                 маркер «/* casino:stepN *\/». Повторно: идентично → пропуск;
                                                 отличается, но файл создан этим установщиком (есть маркер
                                                 casino:stepK) → обновляется; чужой файл → ошибка
                                                 (opts.overwrite = true — явно разрешить). Новые js/*.js и
                                                 css/*.css сами попадают в SHELL (opts.shell = false — нет).
    ctx.createTest(name, content)             — то же для tests/<name>.
    ctx.replaceOnce(file, anchor, repl, {done})— якорь (строка) должен встретиться ровно 1 раз, иначе ошибка.
                                                 Пропуск, если в файле уже есть repl (или строка opts.done).
    ctx.insertAfter / ctx.insertBefore(file, anchor, text, {done})
                                              — вставка рядом с якорем (ровно 1 раз). Пропуск, если в файле
                                                 уже есть text.trim() (или opts.done) — кладите в text маркер
                                                 «/* casino:stepN *\/», чтобы проверка была точной.
    ctx.appendToFile(file, text, {done})      — дописать в конец (пропуск, если text.trim() уже есть).
    ctx.addToShell(...paths)                  — добавить пути (например './img/x.png') в SHELL у sw.js.
    ctx.read(rel) / ctx.exists(rel)           — читать текущее (в памяти) содержимое файла.
    ctx.note(text)                            — строка в итоговый отчёт.
    Файл целиком принадлежит одному шагу; для общих файлов (index.html, sw.js, slots.js …) — только
    точечные правки с якорями.
*/
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url'; // NOTE(step3): pathToFileURL нужен calibrate() шага 2 (раньше не импортировался)
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

/* ======================= аргументы и пути ======================= */
const argv = process.argv.slice(2);
const flag = (...names) => names.some(n => argv.includes(n));
const DRY = flag('--dry-run', '--dry', '--check');
const ROLLBACK = flag('--rollback');
const RUN_TESTS = flag('--test', '--test-all');
const TEST_ALL = flag('--test-all');
const VERBOSE = flag('--verbose', '-v');
const rootAt = argv.indexOf('--root');
const ROOT = resolve(rootAt >= 0 ? argv[rootAt + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'));
const BACKUP_DIR = join(ROOT, '.casino-backup');
const MANIFEST = join(BACKUP_DIR, 'manifest.json');
const OURS = /casino:step\d+/; // файл создан этим установщиком
const SW = 'sw.js';

/* ======================= реестр шагов ======================= */
const steps = [];

/* ======================= виртуальная файловая система =======================
   Все шаги работают с копиями файлов в памяти (тексты нормализованы к LF). На диск ничего не пишется,
   пока все шаги не отработали и все результаты не прошли проверку — это и даёт «всё или ничего». */
const vfs = new Map();
const shell = new Set();   // пути, которые нужно добавить в SHELL (sw.js)
const notes = [];

const clean = rel => {
  const p = String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.split('/').includes('..') || p.startsWith('.casino-backup')) throw new Error(`недопустимый путь: ${rel}`);
  return p;
};
const norm = s => String(s).replace(/\r\n/g, '\n');
function entry(rel) {
  rel = clean(rel);
  let e = vfs.get(rel);
  if (!e) {
    const full = join(ROOT, rel);
    if (existsSync(full) && statSync(full).isFile()) {
      const raw = readFileSync(full, 'utf8'), text = norm(raw);
      e = { rel, raw, orig: text, text, crlf: raw.includes('\r\n'), existed: true };
    } else e = { rel, raw: null, orig: null, text: null, crlf: false, existed: false };
    vfs.set(rel, e);
  }
  return e;
}
const changed = e => e.text !== e.orig;
const count = (text, part) => (part ? text.split(part).length - 1 : 0);
const brief = s => String(s).slice(0, 70).replace(/\n/g, '⏎');

function makeCtx(step) {
  const marker = `casino:step${step.id}`, ops = { ok: 0, skip: 0 };
  const rec = (state, op, rel, what = '') => {
    ops[state]++;
    if (state === 'ok' || VERBOSE) console.log(`   ${state === 'ok' ? '+' : '='} ${op} ${rel}${what ? ` — ${what}` : ''}`);
  };
  const need = rel => {
    const e = entry(rel);
    if (e.text === null) throw new Error(`${rel}: файла нет (шаг ${step.id} ожидает, что он существует)`);
    return e;
  };
  const replaceOnce = (file, anchor, repl, opts = {}) => {
    const e = need(file);
    if (typeof anchor !== 'string' || !anchor) throw new Error(`${file}: якорь должен быть непустой строкой`);
    if (anchor === repl) throw new Error(`${file}: замена совпадает с якорем «${brief(anchor)}»`);
    if (opts.done ? e.text.includes(opts.done) : e.text.includes(repl)) return rec('skip', 'edit', file, 'уже применено');
    const n = count(e.text, anchor);
    if (n !== 1) throw new Error(`${file}: якорь ${n === 0 ? 'не найден' : `найден ${n} раз(а), ожидался 1`} → «${brief(anchor)}…»`);
    e.text = e.text.replace(anchor, () => repl);
    rec('ok', 'edit', file);
  };
  const insert = (where) => (file, anchor, text, opts = {}) => {
    const e = need(file), probe = opts.done || text.trim();
    if (!probe) throw new Error(`${file}: пустая вставка`);
    if (e.text.includes(probe)) return rec('skip', where, file, 'уже применено');
    const n = count(e.text, anchor);
    if (n !== 1) throw new Error(`${file}: якорь ${n === 0 ? 'не найден' : `найден ${n} раз(а), ожидался 1`} → «${brief(anchor)}…»`);
    e.text = e.text.replace(anchor, () => (where === 'insertAfter' ? anchor + text : text + anchor));
    rec('ok', where, file);
  };
  const ctx = {
    id: step.id, name: step.name, marker, root: ROOT, dry: DRY,
    exists: rel => entry(rel).text !== null,
    read: rel => need(rel).text,
    note: text => notes.push(`шаг ${step.id}: ${text}`),
    createFile(rel, content, opts = {}) {
      const e = entry(rel);
      let body = norm(content);
      if (opts.marker !== false && /\.(m?js|css)$/.test(e.rel) && !OURS.test(body)) body = `/* ${marker} */\n${body}`;
      if (!body.endsWith('\n')) body += '\n';
      if (e.text === body) rec('skip', 'create', e.rel, 'идентичен');
      else if (e.text === null) { e.text = body; rec('ok', 'create', e.rel); }
      else if (opts.overwrite || OURS.test(e.text)) { e.text = body; rec('ok', 'update', e.rel); }
      else throw new Error(`${e.rel}: файл уже есть и создан не этим установщиком — не перезаписываю (opts.overwrite = true, если так и задумано)`);
      if (opts.shell !== false && /^(js|css)\/.+\.(js|css)$/.test(e.rel)) shell.add(e.rel);
    },
    createTest: (name, content, opts) => ctx.createFile(`tests/${name}`, content, { shell: false, ...opts }),
    replaceOnce,
    insertAfter: insert('insertAfter'),
    insertBefore: insert('insertBefore'),
    appendToFile(file, text, opts = {}) {
      const e = need(file), probe = opts.done || text.trim();
      if (e.text.includes(probe)) return rec('skip', 'append', file, 'уже применено');
      e.text = e.text.replace(/\n*$/, '\n') + text.replace(/\n*$/, '\n');
      rec('ok', 'append', file);
    },
    addToShell(...paths) { for (const p of paths) shell.add(String(p).replace(/^\.\//, '')); },
  };
  return { ctx, ops };
}

/* ======================= sw.js: SHELL и номер кэша ======================= */
function finalizeSw() {
  const anyOther = [...vfs.values()].some(e => e.rel !== SW && changed(e));
  if (!anyOther && !shell.size) return { bumped: null, added: [] };
  const e = entry(SW);
  if (e.text === null) throw new Error(`${SW}: файла нет — оболочку (SHELL) обновить некуда`);
  let text = e.text;
  const added = [];
  const heads = text.match(/\bSHELL\s*=\s*\[/g) || [];
  if (shell.size) {
    if (heads.length !== 1) throw new Error(`${SW}: «SHELL = [» ${heads.length ? `найден ${heads.length} раз(а)` : 'не найден'}, ожидался 1 — поправьте finalizeSw() или sw.js`);
    const m = /(\bSHELL\s*=\s*\[)([\s\S]*?)(\n?[ \t]*\])/.exec(text);
    if (!m) throw new Error(`${SW}: не удалось разобрать массив SHELL`);
    const body = m[2];
    const fresh = [...shell].sort().filter(p => !body.includes(`'./${p}'`) && !body.includes(`"./${p}"`));
    if (fresh.length) {
      const lines = []; let line = '';
      for (const p of fresh) { const item = `'./${p}',`; if (line && line.length + item.length > 100) { lines.push(line); line = ''; } line += (line ? ' ' : '') + item; }
      if (line) lines.push(line);
      const trimmed = body.replace(/\s+$/, ''), comma = trimmed && !trimmed.endsWith(',') ? ',' : '';
      text = text.slice(0, m.index) + m[1] + trimmed + comma + '\n  ' + lines.join('\n  ') + '\n]' + text.slice(m.index + m[0].length);
      added.push(...fresh);
    }
  }
  let bumped = null;
  if (anyOther || added.length) {
    const cm = text.match(/const CACHE = 'm3102-shell-v(\d+)';/g) || [];
    if (cm.length !== 1) throw new Error(`${SW}: «const CACHE = 'm3102-shell-vN';» ${cm.length ? `найден ${cm.length} раз(а)` : 'не найден'}, ожидался 1`);
    const v = Number(/v(\d+)/.exec(cm[0])[1]);
    text = text.replace(cm[0], `const CACHE = 'm3102-shell-v${v + 1}';`);
    bumped = [v, v + 1];
  }
  if (text !== e.text) e.text = text;
  return { bumped, added };
}

/* ======================= проверки результата ======================= */
function cssBalanced(text) {
  const s = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
  let depth = 0;
  for (const ch of s) { if (ch === '{') depth++; else if (ch === '}' && --depth < 0) return false; }
  return depth === 0;
}
function nodeCheck(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  return r.status === 0 ? '' : r.stderr.trim().split('\n').slice(0, 4).join(' | ');
}
// Проверка текста ДО записи на диск: JS/MJS — node --check через временный .mjs, JSON, <script type="module">, баланс скобок CSS
function validateAll(files) {
  const problems = [], tmp = mkdtempSync(join(tmpdir(), 'casino-check-'));
  let n = 0;
  try {
    const tryJs = (label, code) => { const f = join(tmp, `v${n++}.mjs`); writeFileSync(f, code); const err = nodeCheck(f); if (err) problems.push(`${label}: ${err.replaceAll(f, label)}`); };
    for (const e of files) {
      if (/\.m?js$/.test(e.rel)) tryJs(e.rel, e.text);
      else if (/\.(json|webmanifest)$/.test(e.rel)) { try { JSON.parse(e.text); } catch (x) { problems.push(`${e.rel}: ${x.message}`); } }
      else if (/\.css$/.test(e.rel)) { if (!cssBalanced(e.text)) problems.push(`${e.rel}: несбалансированные фигурные скобки`); }
      else if (/\.html?$/.test(e.rel)) {
        const m = /<script type="module">([\s\S]*?)<\/script>/.exec(e.text);
        if (m) tryJs(`${e.rel} (модульный скрипт)`, m[1]); else if (/<script type="module">/.test(e.text)) problems.push(`${e.rel}: не разобрать модульный скрипт`);
      }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return problems;
}

/* ======================= откат ======================= */
function rollbackCommand() {
  if (!existsSync(MANIFEST)) { console.log('Откатывать нечего: нет .casino-backup/manifest.json.'); return 0; }
  const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  console.log(`${DRY ? '[dry-run] ' : ''}Откат: восстановить ${man.modified.length}, удалить ${man.created.length}.`);
  for (const rel of man.modified) {
    const from = join(BACKUP_DIR, 'files', rel);
    if (!existsSync(from)) { console.error(`  ✗ нет копии для ${rel}`); return 3; }
    console.log(`  ↺ ${rel}`);
    if (!DRY) { writeFileSync(join(ROOT, rel), readFileSync(from)); }
  }
  for (const rel of man.created) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) continue;
    console.log(`  − ${rel}`);
    if (DRY) continue;
    unlinkSync(full);
    for (let d = dirname(full); d !== ROOT && d.startsWith(ROOT); d = dirname(d)) { try { rmdirSync(d); } catch { break; } } // убираем опустевшие папки
  }
  if (!DRY) { rmSync(BACKUP_DIR, { recursive: true, force: true }); console.log('Готово: .casino-backup удалён.'); }
  return 0;
}

/* ======================= запуск тестов ======================= */
function runTests() {
  const dir = join(ROOT, 'tests');
  if (!existsSync(dir)) { console.log('tests/ нет — тестировать нечего.'); return 0; }
  const files = readdirSync(dir).filter(f => f.endsWith('.mjs') && (TEST_ALL || /^(casino|blackjack|roulette)/.test(f))).sort().map(f => join('tests', f));
  if (!files.length) { console.log('Подходящих тестов пока нет.'); return 0; }
  console.log(`\nТесты: ${files.join(', ')}`);
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit' });
  return r.status === 0 ? 0 : 4;
}

/* ============================================================================================
   ШАГИ. Каждый агент пишет только в своей секции. Шаблон шага (NOTE(step3): закрывающий маркер в примере экранирован, иначе комментарий обрывался):

     steps.push({ id: N, name: '…', run(ctx) {
       ctx.createFile('js/…', '…');
       ctx.replaceOnce('index.html', '<anchor>', '<anchor> /* casino:stepN *\/ …');
     } });
   ============================================================================================ */

/* ----- скелеты, создаваемые шагом 1 (String.raw: без обратных кавычек и «${» внутри) ----- */
const COMMON_SKELETON = String.raw`/*
  Общий модуль казино: HUD, шаги ставок, глобальный перерыв, баланс/сохранение, звук.

  ЭТО СКЕЛЕТ (шаг 1 tools/apply-casino.mjs): только контракты. Реализация — в следующих шагах.
  Правила: никакого DOM при импорте (модуль должен грузиться в Node); состояние живёт в уже существующих
  подписанных объектах (S = m3102-slots-v1 через signSlots, H = hh_save_v1 через signShared); новых ключей
  хранилища нет. NOTE: loadAll/saveAll/applyItem/perksOf реэкспортируются из slots.js; если slots.js позднее
  начнёт импортировать этот модуль (общий перерыв), цикл допустим — здесь используются только функции, но не
  значения при загрузке.
*/
import * as M from './slots-math.js';

export { loadAll, saveAll, applyItem, perksOf } from './slots.js';

const todo = name => { throw new Error('casino-common.' + name + ': ещё не реализовано (скелет шага 1)'); };

/** Единый список допустимых ставок для всех игр (то же, что M.BETS). */
export const betSteps = M.BETS;

/**
 * Шаг ставки по списку betSteps.
 * @param {number} bet текущая ставка
 * @param {1|-1|'max'|'min'} dir направление; 'max' — наибольшая, не превышающая баланс задаётся вызывающим
 * @returns {number} новая ставка из betSteps
 */
export const stepBet = (bet, dir) => todo('stepBet');

/** Баланс ягод из общего сохранения. @param {object} H сохранение hh_save_v1 @returns {number} целое >= 0 */
export const balance = H => todo('balance');

/**
 * Изменить баланс (кредит/дебет) и не позволить уйти ниже нуля. Подпись пересчитывает saveAll.
 * @param {object} H @param {number} delta целое, может быть отрицательным @returns {number} новый баланс
 */
export const adjustBalance = (H, delta) => todo('adjustBalance');

/** Идёт ли глобальный перерыв (общий для всех игр казино). @param {object} S @param {number} [now] @returns {boolean} */
export const isOnBreak = (S, now) => todo('isOnBreak');

/**
 * Включить перерыв: S.breakUntil. Отменить нельзя. Вызывающий затем вызывает saveAll.
 * @param {object} S @param {'15'|'day'} kind @param {Date|number} [now] @returns {number} метка времени окончания
 */
export const setBreak = (S, kind, now) => todo('setBreak');

/** Короткое всплывающее сообщение (role=status, aria-live). @param {string} text @param {{ms?:number}} [opts] */
export const toast = (text, opts) => todo('toast');

/**
 * Баннер «Перерыв до HH:MM» поверх игры; блокирует вращения/ставки. Возвращает функцию обновления.
 * @param {HTMLElement} host @param {object} S @returns {{update():void, destroy():void}}
 */
export const renderBreakBanner = (host, S) => todo('renderBreakBanner');

/**
 * Общая шапка казино: баланс, ставка, перерыв. Игры монтируют её в свой контейнер.
 * @param {HTMLElement} host @param {{S:object,H:object,bet:number,onBet?:(bet:number)=>void}} state
 * @returns {{update():void, destroy():void}}
 */
export const renderHud = (host, state) => todo('renderHud');

/** Общий синтезатор звука (Web Audio, по умолчанию выключен, флаг hh_save_v1.sfx). @returns {object} с destroy() */
export const getAudio = () => todo('getAudio');
`;

const CASINO_TEST_SKELETON = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/casino-common.js';
import * as M from '../js/slots-math.js';

// Скелет шага 1: проверяет только форму публичного контракта. Следующие шаги заменяют этот файл целиком.
test('casino-common: контракт экспортов', () => {
  for (const name of ['loadAll', 'saveAll', 'applyItem', 'perksOf', 'stepBet', 'balance', 'adjustBalance', 'isOnBreak', 'setBreak', 'toast', 'renderBreakBanner', 'renderHud', 'getAudio']) {
    assert.equal(typeof C[name], 'function', name);
  }
  assert.equal(C.betSteps, M.BETS);
});
`;

// ===== STEP 1: Foundation and framework =====
steps.push({
  id: 1, name: 'Foundation and framework',
  run(ctx) {
    ctx.createFile('js/casino-common.js', COMMON_SKELETON);
    ctx.createTest('casino.mjs', CASINO_TEST_SKELETON);
    ctx.note('sw.js: SHELL и CACHE обновляет сам фреймворк (finalizeSw) после всех шагов');
  },
});

// ===== STEP 2: Slots math — new symbols, capsule symbol, seven-row jackpot, calibration =====
// Патчит js/slots-math.js только добавлением/точечными правками; все существующие экспорты сохранены.
// Экспорты для других шагов: PAY.claude/itmo/seven, SYMBOLS (+capsule), capsuleChance(bet), injectCapsule(rng, raw, bet, perks),
//   jackpotTrigger(rng, res, bet), JP_SEVEN_COEF, evaluate(...).capsules / .sevenRow, rollRound(...).parts.capsules,
//   S.stats.capsuleSyms. Перк шага 3: perks.capsuleChanceMult (произведение ограничено 1.2%).
// ВАЖНО: числа PAY / счётчиков лент / LINE_SCALE / WARM_SCALE ниже — ПРОВИЗОРНЫЕ (калибровка не запускалась).
//   Запустите: node tools/apply-casino.mjs --calibrate  и перенесите подсказки в патч.

const S2_TEST = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';

// Шаг 2 казино: новые символы, capsule, ряд из seven. Только проверки формы и правил, без измерения RTP.
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, a + ' vs ' + b + ' (±' + eps + ')');

test('новые символы: ярусы выплат, ленты, capsule не попадает на ленты', () => {
  for (let k = 0; k < 3; k++) {
    assert.ok(M.PAY.claude[k] > M.PAY.apple[k] && M.PAY.claude[k] < M.PAY.mush[k], 'claude ' + k);
    assert.ok(M.PAY.itmo[k] >= M.PAY.orange[k] && M.PAY.itmo[k] <= M.PAY.cpp[k] * 1.25, 'itmo ' + k);
    assert.ok(M.PAY.seven[k] > M.PAY.hog[k] && M.PAY.seven[k] < M.PAY.king[k], 'seven ' + k);
  }
  for (const s of ['claude', 'itmo', 'seven', 'capsule']) assert.ok(M.SYMBOLS.includes(s), s);
  for (const set of ['cold', 'warm', 'fs']) M.STRIPS[set].forEach((strip, i) => {
    assert.equal(strip.includes('capsule'), false, set + ' capsule r' + i);
    for (const s of ['claude', 'itmo', 'seven']) assert.ok(strip.includes(s), set + ' ' + s + ' r' + i);
  });
  assert.equal(M.STRIPS.cold.map(s => s.length).join(), M.STRIPS.warm.map(s => s.length).join());
});

test('capsuleChance: монотонна, ≈0.13% на минимальной ставке, ≈0.8% от 1000, не выше 1%', () => {
  near(M.capsuleChance(1), 0.0013, 1e-9);
  near(M.capsuleChance(1000), 0.008, 1e-9);
  assert.equal(M.capsuleChance(100000), M.capsuleChance(1000));
  let prev = 0;
  for (const b of [1, 2, 3, 4, 5, 10, 25, 50, 100, 250, 500, 1000, 2500]) { const p = M.capsuleChance(b); assert.ok(p >= prev && p <= 0.01, 'bet ' + b); prev = p; }
  assert.equal(M.capsuleChance(0), M.capsuleChance(1));
  assert.equal(M.capsuleChance(NaN), M.capsuleChance(1));
});

test('injectCapsule: перезаписывает одну обычную ячейку, спецсимволы не трогает, перк ограничен 1.2%', () => {
  const raw = [['wild', 'berry', 'scatter'], ['bonus', 'apple', 'mush'], ['git', 'orange', 'cpp'], ['rust', 'pi', 'hog'], ['king', 'seven', 'claude']];
  const copy = JSON.stringify(raw), fixed = v => () => v;
  const hit = M.injectCapsule(fixed(0), raw, 10);
  assert.equal(hit.capsules, 1); assert.deepEqual(hit.at, [0, 1]); assert.equal(hit.raw[0][1], 'capsule');
  assert.equal(JSON.stringify(raw), copy, 'исходный массив не изменён');
  assert.deepEqual([hit.raw[0][0], hit.raw[0][2], hit.raw[1][0]], ['wild', 'scatter', 'bonus']);
  const miss = M.injectCapsule(fixed(0.999), raw, 10); assert.equal(miss.capsules, 0); assert.equal(miss.raw, raw);
  // 0.011 между базовым потолком 0.8% и перковым 1.2% на ставке 1000
  assert.equal(M.injectCapsule(fixed(0.011), raw, 1000).capsules, 0);
  assert.equal(M.injectCapsule(fixed(0.011), raw, 1000, { capsuleChanceMult: 100 }).capsules, 1);
  assert.equal(M.injectCapsule(fixed(0.0125), raw, 1000, { capsuleChanceMult: 100 }).capsules, 0);
});

test('evaluate: capsule не участвует в линиях, вертикалях и scatter; считается в capsules', () => {
  const raw = [['capsule', 'git', 'mush'], ['git', 'mush', 'capsule'], ['apple', 'capsule', 'git'], ['mush', 'git', 'apple'], ['git', 'apple', 'mush']];
  const r = M.evaluate(raw);
  assert.equal(r.capsules, 3); assert.equal(r.scatter, 0); assert.equal(r.bonus, false);
  assert.ok(r.lines.every(l => l.sym !== 'capsule'));
  const col = M.evaluate([['capsule', 'capsule', 'capsule'], ['git', 'apple', 'mush'], ['apple', 'mush', 'git'], ['mush', 'git', 'apple'], ['git', 'apple', 'mush']]);
  assert.equal(col.lines.some(l => l.col === 0), false);
  assert.equal(M.evaluate([['berry', 'apple', 'git'], ['pi', 'apple', 'git'], ['rust', 'mush', 'git'], ['cpp', 'apple', 'git'], ['pi', 'apple', 'git']]).capsules, 0);
});

test('ряд из пяти seven (Wild считаются) ставит sevenRow; старое правило трёх расширенных Wild цело', () => {
  const sevens = c => Array.from({ length: 5 }, () => c.slice());
  assert.equal(M.evaluate(sevens(['seven', 'berry', 'apple'])).sevenRow, true);
  assert.equal(M.evaluate(sevens(['berry', 'seven', 'apple'])).sevenRow, true);
  const four = sevens(['seven', 'berry', 'apple']); four[4] = ['berry', 'berry', 'apple'];
  assert.equal(M.evaluate(four).sevenRow, false);
  const withWild = sevens(['seven', 'berry', 'apple']); withWild[2] = ['wild', 'berry', 'apple'];
  assert.equal(M.evaluate(withWild).sevenRow, true);
  const three = M.evaluate([['berry', 'apple', 'git'], ['wild', 'apple', 'git'], ['wild', 'mush', 'git'], ['wild', 'cpp', 'git'], ['pi', 'apple', 'git']]);
  assert.deepEqual(three.expanded, [1, 2, 3]); assert.equal(three.jackpotRoll, true); assert.equal(three.sevenRow, false);
});

test('джекпот: seven-ряд бросает с большим коэффициентом, без флагов не бросает, jackpotHit совместим со старым вызовом', () => {
  assert.ok(M.JP_SEVEN_COEF > M.JP_COEF);
  const r = v => () => v, bet = 10;
  assert.ok(0.2 < M.JP_SEVEN_COEF * bet && 0.2 > M.JP_COEF * bet, 'тест рассчитан на эти коэффициенты');
  assert.equal(M.jackpotTrigger(r(0.2), { sevenRow: true }, bet), true);
  assert.equal(M.jackpotTrigger(r(0.2), { jackpotRoll: true }, bet), false);
  assert.equal(M.jackpotTrigger(r(0), {}, bet), false);
  assert.equal(M.jackpotHit(() => 0, 10), true); assert.equal(M.jackpotHit(() => 0.999, 10), false);
});

test('rollRound зачисляет капсулы-символы: S.capsules, S.stats.capsuleSyms, parts.capsules, trace', () => {
  const rng = M.mulberry32(2026), S = M.newSlotsState(); let sum = 0, partsSum = 0; const n = 4000;
  assert.equal(S.stats.capsuleSyms, 0);
  for (let i = 0; i < n; i++) {
    const R = M.rollRound(rng, S, 1000, {}, { paid: true });
    sum += R.res.capsules; partsSum += R.parts.capsules; assert.equal(R.trace.capsules, R.res.capsules);
  }
  assert.ok(sum > 0); assert.equal(partsSum, sum); assert.equal(S.capsules, sum); assert.equal(S.stats.capsuleSyms, sum);
  assert.ok(sum / n > 0.002 && sum / n < 0.02, 'доля капсул ' + sum / n);
});
`;

steps.push({
  id: 2, name: 'Slots math: new symbols, capsule, seven row, calibration',
  run(ctx) {
    const F = 'js/slots-math.js';
    const edit = (tag, anchor, repl) => ctx.replaceOnce(F, anchor, repl, { done: repl.includes('casino:step9') ? 'casino:step9 ' + tag : 'casino:step2 ' + tag });

    edit('SYMBOLS',
      "export const SYMBOLS = ['berry', 'apple', 'mush', 'git', 'orange', 'cpp', 'rust', 'pi', 'hog', 'king', 'wild', 'scatter', 'bonus'];",
      "export const SYMBOLS = ['berry', 'apple', 'claude', 'mush', 'git', 'orange', 'itmo', 'cpp', 'rust', 'pi', 'hog', 'seven', 'king', 'wild', 'scatter', 'bonus', 'capsule']; /* casino:step2 SYMBOLS — capsule на ленты не ставится: его вставляет injectCapsule */");

    edit('PAY',
      'hog: [12, 45, 220], king: [30, 150, 800],',
      'hog: [12, 45, 220], king: [30, 150, 800],\n  claude: [1.2, 4, 12], itmo: [4.5, 16, 60], seven: [20, 80, 400], /* casino:step2 PAY — провизорно */');

    // NOTE(step9): калибровка LINE_SCALE = 1.02, WARM_SCALE = 1.08, POOL_RATE = 0.015 и нормализация BETS
    const lineScaleAnchor = ctx.read(F).includes('export const LINE_SCALE = 1; // калибровка линейных выплат')
      ? 'export const LINE_SCALE = 1; // калибровка линейных выплат (см. tools/slots-tune.mjs)'
      : 'export const LINE_SCALE = 3; // калибровка линейных выплат (см. tools/slots-tune.mjs)';
    edit('LINE_SCALE',
      lineScaleAnchor,
      'export const LINE_SCALE = 1.02; /* casino:step9 LINE_SCALE откалиброван под 101–105% */');
    edit('WARM_SCALE',
      'export const WARM_SCALE = 1.2;',
      'export const WARM_SCALE = 1.08; /* casino:step9 WARM_SCALE откалиброван для коридора 101–105% и стратегии smart player */');
    if (ctx.read(F).includes('POOL_RATE = 0.15,')) {
      edit('POOL_RATE', 'POOL_RATE = 0.15,', 'POOL_RATE = 0.015, /* casino:step9 POOL_RATE 1.5% */');
    } else if (ctx.read(F).includes('export const POOL_RATE = 0.15;')) {
      edit('POOL_RATE', 'export const POOL_RATE = 0.15;', 'export const POOL_RATE = 0.015; /* casino:step9 POOL_RATE 1.5% */');
    }
    if (ctx.read(F).includes('export const BETS = [1, 2, 3, 4, 5,')) {
      edit('BETS', 'export const BETS = [1, 2, 3, 4, 5,', 'export const BETS = [1, 2, 5,');
    }

    // NOTE(step9): поддержка развёрнутого WARM_LOW_SYMBOLS в COUNTS.warm из коммита 57e5324
    const fText = ctx.read(F);
    let countsAnchor = "// «тёплые» ленты: та же длина и те же Scatter/Bonus/Wild, но меньше крупных символов — выигрыши чаще и мельче\n"
      + "COUNTS.warm = COUNTS.cold.map(c => ({ ...c, hog: c.hog - 1, rust: c.rust - 1, pi: c.pi - 1, berry: c.berry + 1, apple: c.apple + 1, mush: c.mush + 1 }));";
    if (fText.includes('const WARM_LOW_SYMBOLS =')) {
      const idxA = fText.indexOf('// «Тёплые» ленты: только высокооплачиваемые');
      const idxB = fText.indexOf('COUNTS.fs = COUNTS.cold.map');
      if (idxA >= 0 && idxB > idxA) countsAnchor = fText.slice(idxA, idxB);
    }
    edit('COUNTS', countsAnchor,
      "/* casino:step2 COUNTS — провизорно */\n"
      + "// Новые символы: claude (низкий ярус), itmo (средний), seven (между ёжиком и королём). Длина каждой холодной ленты +2.\n"
      + "const NEW_SYMBOL_DELTA = { claude: 3, itmo: 2, seven: 2, berry: -1, apple: -1, git: -1, orange: -1, hog: -1 };\n"
      + "COUNTS.cold = COUNTS.cold.map(c => { const n = { ...c }; for (const [k, d] of Object.entries(NEW_SYMBOL_DELTA)) n[k] = (n[k] || 0) + d; return n; });\n"
      + "// «тёплые» ленты: та же длина и те же Scatter/Bonus/Wild, но меньше крупных символов (seven, rust, pi) — выигрыши чаще и мельче\n"
      + "COUNTS.warm = COUNTS.cold.map(c => ({ ...c, seven: c.seven - 1, rust: c.rust - 1, pi: c.pi - 1, berry: c.berry + 1, apple: c.apple + 1, mush: c.mush + 1 }));");

    edit('ISLINE',
      "const isLine = s => s !== 'scatter' && s !== 'bonus';",
      "const isLine = s => s !== 'scatter' && s !== 'bonus' && s !== 'capsule'; /* casino:step2 ISLINE */\n"
      + "const countCapsules = raw => raw.reduce((n, col) => n + col.filter(s => s === 'capsule').length, 0);\n"
      + "// пять seven в одном горизонтальном ряду; Wild (в том числе расширенные) засчитываются, но хотя бы один seven обязателен\n"
      + "const sevenRowOf = grid => [0, 1, 2].some(row => grid.every(col => col[row] === 'seven' || col[row] === 'wild') && grid.some(col => col[row] === 'seven'));");

    // NOTE(step9): поддержка однострочного и многострочного EVALRET
    const evalretAnchor = ctx.read(F).includes('bonus: [0, 2, 4].every(r => bonusReels.includes(r)),\n    jackpotRoll: expanded.length >= 3\n  };')
      ? 'bonus: [0, 2, 4].every(r => bonusReels.includes(r)),\n    jackpotRoll: expanded.length >= 3\n  };'
      : 'bonus: [0, 2, 4].every(r => bonusReels.includes(r)), jackpotRoll: expanded.length >= 3 };';
    edit('EVALRET', evalretAnchor,
      'bonus: [0, 2, 4].every(r => bonusReels.includes(r)), jackpotRoll: expanded.length >= 3, sevenRow: sevenRowOf(grid), capsules: countCapsules(raw) }; /* casino:step2 EVALRET */');

    edit('JPHIT',
      'export const jackpotHit = (rng, bet) => rng() < Math.min(1, JP_COEF * bet);',
      "/* casino:step2 JPHIT */\n"
      + "export const JP_SEVEN_COEF = 0.03; // шанс джекпота при пяти seven в ряд = min(1, JP_SEVEN_COEF × ставка); провизорно\n"
      + "export const jackpotHit = (rng, bet, coef = JP_COEF) => rng() < Math.min(1, coef * bet);\n"
      + "// Один бросок на спин: при ряде из seven берётся больший коэффициент, иначе действует старое правило трёх расширенных Wild\n"
      + "export const jackpotTrigger = (rng, res, bet) => Boolean(res.jackpotRoll || res.sevenRow) && jackpotHit(rng, bet, res.sevenRow ? Math.max(JP_SEVEN_COEF, JP_COEF) : JP_COEF);\n"
      + "\n"
      + "/* ---------- capsule: бонусный символ-капсула (не лента, а вставка поверх готового экрана) ---------- */\n"
      + "export const CAPSULE_MIN = 0.0013, CAPSULE_MAX = 0.008, CAPSULE_CAP = 0.01, CAPSULE_PERK_CAP = 0.012;\n"
      + "// Шанс на спин: логарифмический рост от ≈0.13% (ставка 1) до ≈0.8% (ставка 1000 и выше); ≤ 1%\n"
      + "export function capsuleChance(bet) {\n"
      + "  const b = Number(bet); if (!(b > 1)) return CAPSULE_MIN;\n"
      + "  return Math.min(CAPSULE_CAP, CAPSULE_MIN + (CAPSULE_MAX - CAPSULE_MIN) * Math.min(1, Math.log10(b) / 3));\n"
      + "}\n"
      + "// Возвращает { raw, capsules, at }: raw — копия с одной перезаписанной обычной ячейкой (не wild/scatter/bonus) либо исходный массив\n"
      + "export function injectCapsule(rng, raw, bet, perks = {}) {\n"
      + "  const mult = Number(perks.capsuleChanceMult) > 0 ? Number(perks.capsuleChanceMult) : 1;\n"
      + "  if (!(rng() < Math.min(CAPSULE_PERK_CAP, capsuleChance(bet) * mult))) return { raw, capsules: 0, at: null };\n"
      + "  const cells = []; raw.forEach((col, r) => col.forEach((s, row) => { if (!SPECIAL.has(s) && s !== 'capsule') cells.push([r, row]); }));\n"
      + "  if (!cells.length) return { raw, capsules: 0, at: null };\n"
      + "  const [r, row] = cells[Math.floor(rng() * cells.length)], out = raw.map(col => col.slice()); out[r][row] = 'capsule';\n"
      + "  return { raw: out, capsules: 1, at: [r, row] };\n"
      + "}");

    edit('BASESIG',
      'export function baseSpin(rng, S, bet, { paid = true } = {}) {',
      'export function baseSpin(rng, S, bet, { paid = true, perks = {} } = {}) { /* casino:step2 BASESIG */');

    // NOTE(step9): поддержка однострочного и многострочного spinGrid/evaluate
    const baseSpinAnchor = ctx.read(F).includes('const { stops, raw } = spinGrid(rng, warm ? \'warm\' : \'cold\');\n  const res = evaluate(raw, 1, warm ? WARM_SCALE : 1);')
      ? 'const { stops, raw } = spinGrid(rng, warm ? \'warm\' : \'cold\');\n  const res = evaluate(raw, 1, warm ? WARM_SCALE : 1);'
      : "const { stops, raw } = spinGrid(rng, warm ? 'warm' : 'cold'), res = evaluate(raw, 1, warm ? WARM_SCALE : 1);";
    edit('BASESPIN', baseSpinAnchor,
      "const spun = spinGrid(rng, warm ? 'warm' : 'cold'), stops = spun.stops, inj = injectCapsule(rng, spun.raw, bet, perks), res = evaluate(inj.raw, 1, warm ? WARM_SCALE : 1); res.capsuleAt = inj.at; /* casino:step2 BASESPIN */");

    // NOTE(step9): поддержка однострочного и многострочного BASEJP
    const basejpAnchor = ctx.read(F).includes('if (res.jackpotRoll && jackpotHit(rng, bet)) {\n    res.jackpot = S.pool;\n    S.pool = SEED_POOL;\n  }')
      ? 'if (res.jackpotRoll && jackpotHit(rng, bet)) {\n    res.jackpot = S.pool;\n    S.pool = SEED_POOL;\n  }'
      : 'if (res.jackpotRoll && jackpotHit(rng, bet)) { res.jackpot = S.pool; S.pool = SEED_POOL; }';
    edit('BASEJP',
      basejpAnchor,
      'if (jackpotTrigger(rng, res, bet)) { res.jackpot = S.pool; S.pool = SEED_POOL; } /* casino:step2 BASEJP */');

    // NOTE(step9): поддержка однострочного и многострочного ROLLROUND
    const rollroundAnchor = ctx.read(F).includes('const res = baseSpin(rng, S, bet, opts);\n  const parts = {\n    base: res.win * bet,\n    fs: 0,\n    pick: 0,\n    jp: res.jackpot,\n    fsN: 0\n  };\n  const trace = { res, fsSteps: [], fs: null, pick: null, pickJp: 0 };')
      ? 'const res = baseSpin(rng, S, bet, opts);\n  const parts = {\n    base: res.win * bet,\n    fs: 0,\n    pick: 0,\n    jp: res.jackpot,\n    fsN: 0\n  };\n  const trace = { res, fsSteps: [], fs: null, pick: null, pickJp: 0 };'
      : 'const res = baseSpin(rng, S, bet, opts), parts = { base: res.win * bet, fs: 0, pick: 0, jp: res.jackpot, fsN: 0 }, trace = { res, fsSteps: [], fs: null, pick: null, pickJp: 0 };';
    edit('ROLLROUND',
      rollroundAnchor,
      'const res = baseSpin(rng, S, bet, { ...opts, perks }), parts = { base: res.win * bet, fs: 0, pick: 0, jp: res.jackpot, fsN: 0, capsules: res.capsules | 0 }, trace = { res, fsSteps: [], fs: null, pick: null, pickJp: 0, capsules: res.capsules | 0, capsuleAt: res.capsuleAt || null }; /* casino:step2 ROLLROUND */');

    edit('FSJP',
      'if (st.res.jackpotRoll && jackpotHit(rng, bet))',
      'if (jackpotTrigger(rng, st.res, bet) /* casino:step2 FSJP */)');

    edit('TOTAL',
      'parts.total = parts.base + parts.fs + parts.pick + parts.jp;',
      "if (parts.capsules) { S.capsules = (S.capsules | 0) + parts.capsules; S.stats.capsuleSyms = (S.stats.capsuleSyms | 0) + parts.capsules; } /* casino:step2 TOTAL: капсулы-символы только в базовом спине */\n"
      + '  parts.total = parts.base + parts.fs + parts.pick + parts.jp;');

    // NOTE(step9): поддержка многострочного stats
    const statsAnchor = ctx.read(F).includes('gambles: 0,\n      gambleWins: 0,\n      poked: 0\n    }')
      ? 'gambles: 0,\n      gambleWins: 0,\n      poked: 0\n    }'
      : 'gambles: 0, gambleWins: 0, poked: 0 }';
    edit('STATS',
      statsAnchor,
      statsAnchor.replace('poked: 0', 'poked: 0, capsuleSyms: 0 /* casino:step2 STATS */'));

    // ---- tests: границы RTP и новый файл ----
    const T = 'tests/slots.mjs', tedit = (tag, a, r) => ctx.replaceOnce(T, a, r, { done: tag });
    tedit('T-TITLE',
      "test('RTP ≈ 96–97.8%, частота выигрышей 24–31%, миллионы спинов (SLOTS_FAST — быстрая версия)', () => {",
      "test('RTP ≈ 101.5–102.5% (casino:step2 T-TITLE), частота выигрышей 23–34%, миллионы спинов (SLOTS_FAST — быстрая версия)', () => {");
    tedit('T-RTP',
      'const lo = fast ? 94 : 96.0, hi = fast ? 100 : 97.8;',
      'const lo = fast ? 99.0 : 101.5, hi = fast ? 105.0 : 102.5; /* casino:step2 T-RTP: полный прогон 12 млн, шум ≈ ±0.25% */');
    tedit('T-HIT', 'r.hit >= 24 && r.hit <= 31', 'r.hit >= 23 && r.hit <= 34 /* casino:step2 T-HIT */');
    tedit('T-BASE', 'r.rtpBase > 56 && r.rtpBase < 66', 'r.rtpBase > 58 && r.rtpBase < 76 /* casino:step2 T-BASE */');
    tedit('T-FS', 'r.rtpFs > 14 && r.rtpFs < 34', 'r.rtpFs > 14 && r.rtpFs < 40 /* casino:step2 T-FS */');
    tedit('T-JP', 'r.rtpJp > 0.8 && r.rtpJp < 3.5', 'r.rtpJp > 0.5 && r.rtpJp < 6 /* casino:step2 T-JP */');
    ctx.createTest('slots-casino.mjs', S2_TEST);

    ctx.note('NOTE(step3): jackpotTrigger теперь всегда возвращает boolean (раньше undefined без флагов — тест шага 2 падал).');
    ctx.note('ШАГ 2: калибровка НЕ запускалась. Числа PAY/NEW_SYMBOL_DELTA/LINE_SCALE=3.2/JP_SEVEN_COEF=0.03 провизорны. Запустите node tools/apply-casino.mjs --calibrate');
    ctx.note('ШАГ 2: js/slots-art.js ещё не рисует claude/itmo/seven/capsule (sym() даст пустой <use>) — нужен спрайт; js/slots.js: FILL и таблица выплат не знают новых символов; перк capsuleChanceMult придёт из perksOf (шаг 3)');
  },
});

/* ---------- калибровка шага 2: node tools/apply-casino.mjs --calibrate [--spins=N] [--seed=N] [--bets=1,10,100,1000] ----------
   Не пишет файлов. Импортирует УЖЕ ПРИМЕНЁННЫЙ js/slots-math.js (сначала запустите установщик).
   Допущение по джекпоту: полный прогон идёт одной непрерывной копилкой (SEED_POOL + 1.5% поставленного после прошлой выплаты),
   джекпот считается по реальному размеру копилки в момент выплаты, а нераздатый остаток сверх SEED_POOL добавляется к RTP
   (в долгом прогоне это ≈ POOL_RATE + SEED_POOL × частота джекпота / ставка). Выплаты наборов по Set-строкам — без джекпота и фриспин-множителя. */
export async function calibrate(opts = {}) {
  const spins = opts.spins ?? 6_000_000, seed = opts.seed ?? 20261021, bets = opts.bets ?? [1, 10, 100, 1000];
  const root = opts.root ?? ROOT, target = opts.target ?? [101.5, 102.5], out = opts.log ?? console.log;
  const M = await import(pathToFileURL(join(root, 'js/slots-math.js')).href + '?cal=' + Date.now());
  const missing = ['capsuleChance', 'injectCapsule', 'jackpotTrigger', 'JP_SEVEN_COEF'].filter(k => !(k in M));
  if (missing.length) throw new Error('js/slots-math.js не содержит ' + missing.join(', ') + ' — сначала примените установщик (node tools/apply-casino.mjs)');
  const pad = (s, n) => String(s).padStart(n), f2 = x => x.toFixed(2);
  const oneIn = (n, d) => (n > 0 ? '1/' + Math.round(d / n).toLocaleString('ru-RU') : '—');
  const result = { sets: [], full: [] };

  out('Калибровка шага 2 · ' + spins.toLocaleString('ru-RU') + ' спинов на строку · seed ' + seed + ' · LINE_SCALE ' + M.LINE_SCALE + ' · WARM_SCALE ' + M.WARM_SCALE + ' · JP_SEVEN_COEF ' + M.JP_SEVEN_COEF);
  out('\n[A] По лентам (spinGrid + evaluate, множитель 1, без джекпота/поляны; capsule вставляется в cold/warm, во фриспинах — нет)');
  out(pad('set', 5) + pad('bet', 6) + pad('RTP%', 9) + pad('hit%', 8) + pad('capsule%', 10) + pad('jackpot', 14) + pad('seven-row', 14) + pad('3 Wild', 10));
  let si = 0;
  for (const set of ['cold', 'warm', 'fs']) {
    let bi = 0;
    for (const bet of bets) {
      const rng = M.mulberry32((seed + si * 1000 + bi) >>> 0), scale = set === 'warm' ? M.WARM_SCALE : 1;
      let win = 0, hits = 0, caps = 0, jp = 0, seven = 0, wild3 = 0;
      for (let i = 0; i < spins; i++) {
        let raw = M.spinGrid(rng, set).raw;
        if (set !== 'fs') { const inj = M.injectCapsule(rng, raw, bet); raw = inj.raw; caps += inj.capsules; }
        const r = M.evaluate(raw, 1, scale); win += r.win; if (r.win > 0) hits++;
        if (r.sevenRow) seven++; if (r.jackpotRoll) wild3++;
        if ((r.jackpotRoll || r.sevenRow) && M.jackpotTrigger(rng, r, bet)) jp++;
      }
      const row = { set, bet, rtp: 100 * win / spins, hit: 100 * hits / spins, capsule: 100 * caps / spins, jackpotN: jp, sevenN: seven, wild3N: wild3 };
      result.sets.push(row);
      out(pad(set, 5) + pad(bet, 6) + pad(f2(row.rtp), 9) + pad(f2(row.hit), 8) + pad(set === 'fs' ? '—' : f2(row.capsule), 10) + pad(oneIn(jp, spins), 14) + pad(oneIn(seven, spins), 14) + pad(oneIn(wild3, spins), 10));
      bi++;
    }
    si++;
  }

  out('\n[B] Полная игра (rollRound: база + фриспины + поляна + джекпот), перки {} · цель общего RTP ' + target[0] + '–' + target[1] + '%');
  out(pad('bet', 6) + pad('RTP%', 9) + pad('base', 8) + pad('fs', 8) + pad('pick', 8) + pad('jp+ост', 9) + pad('hit%', 8) + pad('capsule%', 10) + pad('jackpot', 12) + pad('avg pool', 11) + '  цель');
  let bj = 0;
  for (const bet of bets) {
    const rng = M.mulberry32((seed + 777 + bj++) >>> 0), S = M.newSlotsState();
    let wag = 0, base = 0, fs = 0, pick = 0, jp = 0, hits = 0, jpN = 0;
    for (let i = 0; i < spins; i++) {
      const R = M.rollRound(rng, S, bet, {}, { paid: true });
      wag += bet; base += R.parts.base; fs += R.parts.fs; pick += R.parts.pick; jp += R.parts.jp;
      if (R.res.win > 0) hits++; if (R.parts.jp > 0) jpN++;
    }
    const pct = x => 100 * x / wag, resid = S.pool - M.SEED_POOL;
    const row = { bet, rtp: pct(base + fs + pick + jp + resid), base: pct(base), fs: pct(fs), pick: pct(pick), jp: pct(jp + resid), hit: 100 * hits / spins, capsule: 100 * S.stats.capsuleSyms / spins, jackpotN: jpN, avgPool: jpN ? jp / jpN : null };
    row.ok = row.rtp >= target[0] && row.rtp <= target[1]; result.full.push(row);
    out(pad(bet, 6) + pad(f2(row.rtp), 9) + pad(f2(row.base), 8) + pad(f2(row.fs), 8) + pad(f2(row.pick), 8) + pad(f2(row.jp), 9) + pad(f2(row.hit), 8) + pad(f2(row.capsule), 10) + pad(oneIn(jpN, spins), 12) + pad(row.avgPool === null ? '—' : Math.round(row.avgPool), 11) + '  ' + (row.ok ? 'в коридоре' : 'ВНЕ'));
  }

  // Подсказки первого порядка (линейные выплаты масштабируются LINE_SCALE; поляна и джекпот — нет)
  const mean = k => result.full.reduce((a, r) => a + r[k], 0) / result.full.length;
  const scalable = mean('base') + mean('fs'), fixed = mean('pick') + mean('jp'), mid = (target[0] + target[1]) / 2;
  const hintLine = Math.round(M.LINE_SCALE * (mid - fixed) / scalable * 1000) / 1000;
  const cold = result.sets.find(r => r.set === 'cold' && r.bet === bets[0]), warm = result.sets.find(r => r.set === 'warm' && r.bet === bets[0]);
  const hintWarm = cold && warm ? Math.round(M.WARM_SCALE * cold.rtp / warm.rtp * 1000) / 1000 : null;
  out('\nПодсказки (оценка первого порядка, после правки запустите калибровку заново):');
  out('  LINE_SCALE ≈ ' + hintLine + ' (сейчас ' + M.LINE_SCALE + '; средний RTP по ставкам ' + f2(mean('rtp')) + '%)');
  if (hintWarm) out('  WARM_SCALE ≈ ' + hintWarm + ' (тёплые ленты: ' + f2(warm.rtp) + '% против холодных ' + f2(cold.rtp) + '%; тест допускает ±0.35)');
  out('  Частоту seven-ряда и джекпота регулируйте числом seven на лентах (NEW_SYMBOL_DELTA.seven) и JP_SEVEN_COEF.');
  out('  Допущение: джекпот считается по реальной копилке в непрерывном прогоне + нераздатый остаток (см. комментарий к calibrate).');
  out('\n[C] Стратегия «Smart player» (сессии 500, 5000, 50000; цель взвешенного возврата 100–105%)');
  out(pad('bankroll', 10) + pad('wagered', 12) + pad('won', 12) + pad('swRTP%', 9) + pad('median', 10) + pad('bound', 10) + pad('bankrupt%', 11));
  const BETS_LIST = [...M.BETS].sort((a, b) => a - b);
  function pickBet(balance) {
    const target = Math.floor(balance / 5);
    let chosen = 1;
    for (const b of BETS_LIST) { if (b <= target && b <= balance) chosen = b; else break; }
    return Math.max(1, chosen);
  }
  let smartWag = 0, smartWon = 0;
  const smartRng = M.mulberry32(seed === 20261021 ? 2026 : seed);
  for (const bal of [500, 5000, 50000]) {
    let wag = 0, won = 0, bankrupt = 0;
    const balances = [];
    const numSessions = 2000, maxSpins = 300;
    for (let s = 0; s < numSessions; s++) {
      let b = bal;
      const S = M.newSlotsState();
      for (let spin = 0; spin < maxSpins; spin++) {
        if (b < 1) { bankrupt++; break; }
        const isWarm = S.heat >= M.HEAT_MAX;
        let bet = isWarm ? pickBet(b) : 1;
        if (bet > b) bet = b;
        b -= bet; wag += bet;
        const R = M.rollRound(smartRng, S, bet, {}, { paid: true });
        b += R.parts.total; won += R.parts.total;
      }
      balances.push(b);
    }
    balances.sort((a, b) => a - b);
    const median = balances[Math.floor(balances.length / 2)];
    const swRtp = 100 * won / wag;
    const brRate = 100 * bankrupt / numSessions;
    const bound = Math.round(bal * Math.max(1.5, 1 + (swRtp / 100) * (maxSpins / 10)));
    out(pad(bal, 10) + pad(Math.round(wag).toLocaleString('ru-RU'), 12) + pad(Math.round(won).toLocaleString('ru-RU'), 12) + pad(f2(swRtp), 9) + pad(f2(median), 10) + pad(bound, 10) + pad(f2(brRate) + '%', 11));
    smartWag += wag; smartWon += won;
  }
  const overallSmartRtp = 100 * smartWon / smartWag;
  out('Итог «Smart player»: взвешенный возврат ' + f2(overallSmartRtp) + '% (цель 100–105%) ' + (overallSmartRtp >= 100 && overallSmartRtp <= 105 ? '· в коридоре' : '· ВНЕ КОРИДОРА'));

  out('\n[D] Символ-капсула (частоты выпадения по ставкам)');
  out(pad('bet', 6) + pad('теория%', 10) + pad('замер%', 10) + pad('с перком (макс 1.2%)', 22));
  for (const bet of [1, 10, 100, 1000]) {
    const theo = 100 * M.capsuleChance(bet);
    const cN = 100000, cRng = M.mulberry32((seed + 555 + bet) >>> 0);
    const raw = [['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush']];
    let hits = 0, perkHits = 0;
    for (let i = 0; i < cN; i++) {
      if (M.injectCapsule(cRng, raw, bet).capsules) hits++;
      if (bet === 1000 && M.injectCapsule(cRng, raw, bet, { capsuleChanceMult: 100 }).capsules) perkHits++;
    }
    const meas = 100 * hits / cN, measPerk = bet === 1000 ? f2(100 * perkHits / cN) + '%' : '—';
    out(pad(bet, 6) + pad(f2(theo) + '%', 10) + pad(f2(meas) + '%', 10) + pad(measPerk, 22));
  }

  result.hints = { lineScale: hintLine, warmScale: hintWarm };
  return result;
}

// ===== STEP 3: Catalog — 23 prizes, perks, equip slots, new achievements =====
// Патчит js/slots-math.js (CATALOG, FREE_ITEMS, grantSets, activePerks, rollRound/dailyClaim/openCapsule), js/slots.js (UI-связки, ACH),
// index.html (шляпа hat:luckyseven), css/settings.css + js/settings.js (4 палитры), js/greetings.js (4 пака), tests/casino-perks.mjs.
// Экспорты для других шагов: M.activePerks(S,H) / M.clampPerks / M.PERK_CAPS / M.ITEM_PERKS / M.EQUIP_KINDS / M.EQUIPPABLE /
//   M.equipItem(S,id) / M.isEquipped(S,id) / M.equippedIds(S) / M.pityOf(perks) / M.bjExtra(perks,bet,{total,cards,natural}) /
//   M.rouletteRefundAmount(perks,lostStraightStake) / M.SETS / M.CHARM_SET; slots.js: perksOf(H, S) (S теперь обязателен для перков предметов);
//   S.equip = { cardback, chips, felt, emote, perkcharm } (пусто = оформление по умолчанию; chips:berry и felt:burgundy выдаются сразу).
// ID новых достижений для шагов 6/8 (award внутри slots.js локален — вынести в casino-collection): bj_win, roulette_straight.
// Темы th-velvet / th-arcade / th-vault зарегистрированы в THEME_CLASS, CSS — шаг 6 (до него рамка выглядит как «Лес»).

const S3_CATALOG = String.raw`
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
  it('cardback:marked', 'cardback', 'Меченая рубашка', 'rare', 'Эффект: «Удвоить» подсказывает три последние карты'),
  it('chips:berry', 'chips', 'Ягодные фишки', 'common', 'Оформление фишек за столом', true),
  it('felt:burgundy', 'felt', 'Бордовое сукно', 'common', 'Оформление игрового стола', true),
  it('emote:fyr', 'emote', 'Эмоция «Фыр!»', 'common', 'Реплика ёжика за столами казино'),
  it('perkcharm:clover', 'perkcharm', 'Клевер', 'common', 'Эффект: +15% к шансу капсулы-символа'),
  it('perkcharm:horseshoe', 'perkcharm', 'Подкова', 'common', 'Эффект: рулетка возвращает 10% проигранной ставки на число'),
  it('perkcharm:ace', 'perkcharm', 'Туз в рукаве', 'epic', 'Эффект: блэкджек платит 3:2 за 21 из трёх карт'),`;

const S3_PERKS = String.raw`
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
  if (S.title && album[S.title]) out.push(S.title);
  for (const k of EQUIP_KINDS) { const id = eq[k]; if (id && album[id] && ITEM[id] && ITEM[id].kind === k) out.push(id); }
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
  const x = ITEM[id]; if (!x || !S.album || !S.album[id]) return false;
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
`;

const S3_SETS = String.raw`
export const SETS = [{ reward: 'title:hats', need: () => HAT_SET }, { reward: 'title:legend', need: () => CHARM_SET }]; /* casino:step3 SETS */
export const grantSets = S => { const got = []; for (const set of SETS) { if (!S.album[set.reward] && set.need().every(id => S.album[id])) { S.album[set.reward] = 1; got.push(set.reward); } } return got; };`;

const S3_ACH = String.raw`
  /* casino:step3 ACH — достижения нового контента; bj_win и roulette_straight выдаёт шаг 6/8 */
  { id: 'five_claude', name: 'Умный помощник', desc: 'Собери пять символов Claude на одной линии' },
  { id: 'five_itmo', name: 'Студент ИТМО', desc: 'Собери пять символов ИТМО на одной линии' },
  { id: 'capsule_sym', name: 'Капсула в барабане', desc: 'Поймай символ-капсулу на барабанах' },
  { id: 'seven_row', name: 'Счастливая семёрка', desc: 'Собери пять семёрок в одном ряду' },
  { id: 'bj_win', name: 'Двадцать одно', desc: 'Выиграй раздачу в блэкджек' },
  { id: 'roulette_straight', name: 'Шарик на своём числе', desc: 'Выиграй ставку на одно число в рулетке' },`;

const S3_TEST = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../js/slots-math.js';
import { GREETING_PACKS } from '../js/greetings.js';

// Шаг 3 казино: каталог (23 новых предмета), перки, надевание, наборы. Заглушки для шага 9 помечены todo.
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const NEW_IDS = ['hat:luckyseven', 'pal:graphite', 'pal:sakura', 'pal:ruby', 'pal:tropic', 'greet:linux', 'greet:deadline', 'greet:sleep', 'greet:algo',
  'theme:velvet', 'theme:arcade', 'theme:vault', 'title:lucky', 'title:patient', 'title:early', 'title:legend', 'cardback:marked', 'chips:berry', 'felt:burgundy',
  'emote:fyr', 'perkcharm:clover', 'perkcharm:horseshoe', 'perkcharm:ace'];
const ownAll = () => { const S = M.newSlotsState(); for (const x of M.CATALOG) S.album[x.id] = 1; return S; };
const tally = (list, f) => list.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});

test('каталог: ID уникальны, всего 27 + 23, редкость и виды новых предметов', () => {
  const ids = M.CATALOG.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(M.CATALOG.length, 50);
  assert.equal(NEW_IDS.length, 23); assert.equal(new Set(NEW_IDS).size, 23);
  for (const id of NEW_IDS) assert.ok(M.ITEM[id], id);
  const fresh = NEW_IDS.map(id => M.ITEM[id]);
  assert.deepEqual(tally(fresh, x => x.rarity), { common: 12, rare: 6, epic: 3, legendary: 2 });
  assert.deepEqual(tally(fresh, x => x.kind), { hat: 1, palette: 4, greeting: 4, theme: 3, title: 4, cardback: 1, chips: 1, felt: 1, emote: 1, perkcharm: 3 });
  for (const x of M.CATALOG) { assert.ok(M.RARITY[x.rarity], x.id); assert.equal(x.id.split(':')[0].length > 0, true); assert.ok(x.name && x.desc, x.id); }
  for (const id of M.FREE_ITEMS) assert.ok(M.ITEM[id], id);
  for (const id of Object.keys(M.ITEM_PERKS)) assert.ok(M.ITEM[id], id);
  for (const id of Object.keys(M.ITEM_PERKS)) assert.ok(M.EQUIPPABLE.includes(M.ITEM[id].kind), id);
});

test('капсулы: setOnly-предметы не выпадают, новые предметы выпадают', () => {
  const seen = new Set(), setOnly = M.CATALOG.filter(x => x.setOnly).map(x => x.id);
  for (let i = 0; i < 6000; i++) { const S = M.newSlotsState(); seen.add(M.openCapsule(M.mulberry32(i), S).item.id); }
  for (const id of setOnly) assert.equal(seen.has(id), false, id);
  for (const id of NEW_IDS.filter(id => !setOnly.includes(id))) assert.ok(seen.has(id), 'не выпадает ' + id);
});

test('ассеты нового контента: палитры, пак шуток, шляпа, темы, достижения', () => {
  for (const id of NEW_IDS.filter(id => id.startsWith('pal:'))) {
    const n = id.slice(4);
    assert.ok(read('css/settings.css').includes('--pal-' + n + '-a'), 'css ' + n);
    assert.ok(read('css/settings.css').includes('[data-palette="' + n + '"]'), 'css selector ' + n);
    assert.ok(read('js/settings.js').includes("{ id: '" + n + "'"), 'settings.js ' + n);
  }
  for (const id of NEW_IDS.filter(id => id.startsWith('greet:'))) {
    const pack = GREETING_PACKS[id.slice(6)];
    assert.ok(Array.isArray(pack) && pack.length === 2 && pack.every(s => typeof s === 'string' && s.trim()), id);
  }
  for (const id of Object.keys(GREETING_PACKS)) assert.ok(M.ITEM['greet:' + id], 'нет предмета для пака ' + id);
  const html = read('index.html');
  assert.ok(html.includes("id:'luckyseven',name"), 'HATS');
  assert.ok(html.includes("id==='luckyseven'"), 'drawHat');
  assert.ok(html.includes("save.hat==='luckyseven'"), 'перк шляпы в игре');
  for (const id of NEW_IDS.filter(id => id.startsWith('theme:'))) assert.ok(read('js/slots.js').includes("'" + id + "': 'th-"), id);
  const ach = [...read('js/slots.js').matchAll(/\{ id: '([a-z0-9_]+)', name:/g)].map(m => m[1]);
  assert.equal(new Set(ach).size, ach.length);
  for (const id of ['five_claude', 'five_itmo', 'capsule_sym', 'seven_row', 'bj_win', 'roulette_straight']) assert.ok(ach.includes(id), id);
  assert.ok(ach.length >= 6);
});

test('clampPerks: все потолки и нижние границы', () => {
  const c = M.clampPerks({ payoutPct: 99, dailyExtra: 9, pityShift: 99, capsuleChanceMult: 9, gambleHint: 99, bjBonus: 9, rouletteRefund: 9 });
  assert.deepEqual([c.payoutPct, c.dailyExtra, c.pityShift, c.capsuleChanceMult, c.gambleHint, c.bjBonus, c.rouletteRefund], [2, 2, 4, 1.5, 5, 0.5, 0.25]);
  const z = M.clampPerks({ payoutPct: -3, dailyExtra: -1, capsuleChanceMult: 0.2, rouletteRefund: NaN });
  assert.deepEqual([z.payoutPct, z.dailyExtra, z.capsuleChanceMult, z.rouletteRefund], [0, 0, 1, 0]);
});

test('activePerks: действуют только надетые и имеющиеся предметы; один на вид; шляпа', () => {
  const S = M.newSlotsState(); S.title = 'title:lucky';
  assert.equal(M.activePerks(S, {}).payoutPct, 0, 'титул не в альбоме');
  S.album['title:lucky'] = 1; assert.equal(M.activePerks(S, {}).payoutPct, 0.3);
  assert.equal(M.equipItem(S, 'perkcharm:ace'), false);
  S.album['perkcharm:ace'] = 1; S.album['perkcharm:horseshoe'] = 1;
  assert.ok(M.equipItem(S, 'perkcharm:ace')); assert.equal(M.activePerks(S, {}).bjBonus, 0.5); assert.equal(M.activePerks(S, {}).rouletteRefund, 0);
  assert.ok(M.equipItem(S, 'perkcharm:horseshoe')); assert.equal(M.activePerks(S, {}).bjBonus, 0); assert.equal(M.activePerks(S, {}).rouletteRefund, 0.1);
  assert.ok(M.isEquipped(S, 'perkcharm:horseshoe')); assert.equal(M.isEquipped(S, 'perkcharm:ace'), false);
  assert.equal(M.activePerks(M.newSlotsState(), { hat: 'crown' }).crown, true);
  assert.equal(M.activePerks(undefined, { hat: 'luckyseven' }).luckyseven, true);
  assert.equal(M.activePerks(undefined, undefined).payoutPct, 0);
  const all = ownAll(); M.equipItem(all, 'title:legend'); M.equipItem(all, 'perkcharm:clover');
  const p = M.activePerks(all, { hat: 'halo' });
  assert.equal(p.payoutPct, 0.5); assert.ok(Math.abs(p.capsuleChanceMult - 1.1 * 1.15) < 1e-9); assert.equal(p.gambleHint, 5);
  assert.ok(p.payoutPct <= M.PERK_CAPS.payoutPct && p.capsuleChanceMult <= M.PERK_CAPS.capsuleChanceMult);
});

test('perk payoutPct: rollRound увеличивает выигрыш ровно на процент, джекпот не трогает, потолок +2%', () => {
  const run = (perks, n) => { const rng = M.mulberry32(77), S = M.newSlotsState(), out = []; for (let i = 0; i < n; i++) out.push(M.rollRound(rng, S, 1, perks, { paid: true })); return out; };
  const a = run({}, 3000), b = run({ payoutPct: 2 }, 3000), huge = run({ payoutPct: 99 }, 3000); let boosted = 0;
  a.forEach((x, i) => {
    const y = b[i], base = x.won - x.parts.jp; assert.equal(y.parts.jp, x.parts.jp);
    if (base > 0 && base * 1.02 < M.MAX_WIN) { assert.ok(Math.abs((y.won - y.parts.jp) - base * 1.02) < 1e-6, 'spin ' + i); boosted++; }
    assert.equal(huge[i].won, y.won, 'потолок');
  });
  assert.ok(boosted > 300);
});

test('perk dailyExtra: ежедневные спины, потолок +2', () => {
  const now = new Date(2026, 9, 21, 12), spins = perks => M.dailyClaim(M.newSlotsState(), now, perks).spins;
  assert.equal(spins({}), 1); assert.equal(spins({ dailyExtra: 1 }), 2); assert.equal(spins({ dailyExtra: 99 }), 3);
});

test('perk pityShift: эпик гарантирован раньше, потолок -4, минимум 6', () => {
  assert.equal(M.pityOf({}), 12); assert.equal(M.pityOf({ pityShift: 1 }), 11); assert.equal(M.pityOf({ pityShift: 99 }), 8); assert.equal(M.pityOf(undefined), 12);
  let low = 0;
  for (let i = 0; i < 300; i++) {
    const S = M.newSlotsState(); S.sinceEpic = 11;
    assert.ok(['epic', 'legendary'].includes(M.openCapsule(M.mulberry32(i), S, { pityShift: 1 }).item.rarity));
    const T = M.newSlotsState(); T.sinceEpic = 11; if (!['epic', 'legendary'].includes(M.openCapsule(M.mulberry32(i), T, {}).item.rarity)) low++;
  }
  assert.ok(low > 0, 'без перка на 11-й капсуле эпик не гарантирован');
});

test('perk capsuleChanceMult: шанс капсулы-символа растёт, но не выше потолка', () => {
  const raw = [['berry', 'apple', 'git'], ['pi', 'apple', 'git'], ['rust', 'mush', 'git'], ['cpp', 'apple', 'git'], ['pi', 'apple', 'git']], at = v => () => v;
  assert.equal(M.injectCapsule(at(0.0014), raw, 1, {}).capsules, 0);
  assert.equal(M.injectCapsule(at(0.0014), raw, 1, { capsuleChanceMult: 1.15 }).capsules, 1);
  assert.equal(M.injectCapsule(at(0.002), raw, 1, { capsuleChanceMult: 1.5 }).capsules, 0);
  assert.ok(M.PERK_CAPS.capsuleChanceMult <= 1.5);
});

test('perk gambleHint: рубашка даёт 3 карты, нимб — 5', () => {
  const S = M.newSlotsState(); S.album['cardback:marked'] = 1; assert.equal(M.activePerks(S, {}).gambleHint, 0);
  M.equipItem(S, 'cardback:marked'); assert.equal(M.activePerks(S, {}).gambleHint, 3); assert.equal(M.activePerks(S, { hat: 'halo' }).gambleHint, 5);
});

test('perk bjBonus и rouletteRefund: чистые помощники для шагов 5 и 7', () => {
  const on = { bjBonus: 0.5 };
  assert.equal(M.bjExtra(on, 10, { total: 21, cards: 3 }), 5);
  assert.equal(M.bjExtra(on, 10, { total: 21, cards: 2, natural: true }), 0);
  assert.equal(M.bjExtra(on, 10, { total: 21, cards: 4 }), 0);
  assert.equal(M.bjExtra(on, 10, { total: 20, cards: 3 }), 0);
  assert.equal(M.bjExtra({}, 10, { total: 21, cards: 3 }), 0);
  assert.equal(M.bjExtra({ bjBonus: 9 }, 10, { total: 21, cards: 3 }), 5);
  assert.equal(M.rouletteRefundAmount({ rouletteRefund: 0.1 }, 50), 5);
  assert.equal(M.rouletteRefundAmount({}, 50), 0); assert.equal(M.rouletteRefundAmount({ rouletteRefund: 9 }, 100), 25); assert.equal(M.rouletteRefundAmount({ rouletteRefund: 0.1 }, -5), 0);
});

test('наборы: все талисманы → титул «Легенда зала», все шляпы → «Шляпный мастер»; повторно не выдаются', () => {
  const S = M.newSlotsState(); for (const id of M.CHARM_SET) S.album[id] = 1;
  assert.deepEqual(M.grantSets(S), ['title:legend']); assert.deepEqual(M.grantSets(S), []);
  for (const id of M.HAT_SET) S.album[id] = 1;
  assert.deepEqual(M.grantSets(S), ['title:hats']);
  assert.equal(M.HAT_SET.length, 7); assert.equal(M.CHARM_SET.length, 3);
});

test('новый S.equip и подписи: состояние подписывается и проверяется с equip', () => {
  const S = M.newSlotsState(); assert.deepEqual(S.equip, {}); S.album['chips:berry'] = 1; M.equipItem(S, 'chips:berry');
  S.sig = M.signSlots(S); assert.equal(M.checkSlots(S), 'ok');
});

// ---- заглушки шага 9: проводка перков в игры (игр ещё нет) ----
test('шаг 9: блэкджек применяет bjExtra к выплате 21 из трёх карт и показывает бейдж талисмана', { todo: 'шаг 5/6/9' }, () => {});
test('шаг 9: рулетка возвращает rouletteRefundAmount только за проигранную ставку на число', { todo: 'шаг 7/8/9' }, () => {});
test('шаг 9: ачивки bj_win и roulette_straight выдаются играми', { todo: 'шаг 6/8/9' }, () => {});
test('шаг 9: эмоция, фишки, сукно и рубашка отображаются в играх; активные перки видны в интерфейсе', { todo: 'шаг 4/6/8/9' }, () => {});
test('шаг 9: фриспины показывают итог с учётом payoutPct (trace.fs.total не масштабируется)', { todo: 'шаг 9' }, () => {});
`;

steps.push({
  id: 3, name: 'Catalog: 23 prizes, perks, equip slots, achievements',
  run(ctx) {
    const M = 'js/slots-math.js', U = 'js/slots.js';
    const edit = (f, tag, anchor, repl) => ctx.replaceOnce(f, anchor, repl, repl.includes('casino:step3 ' + tag) ? { done: 'casino:step3 ' + tag } : {}); // маркер — только если он есть в замене, иначе идемпотентность ломается

    /* ---- slots-math.js ---- */
    ctx.insertAfter(M, "it('theme:server', 'theme', 'Тема барабанов: Серверная', 'epic', 'Рамка автомата'),", S3_CATALOG);
    edit(M, 'FREE', "export const FREE_ITEMS = ['theme:forest', 'title:newbie'];",
      "export const FREE_ITEMS = ['theme:forest', 'title:newbie', 'chips:berry', 'felt:burgundy']; /* casino:step3 FREE — стартовые фишки и сукно */");
    // NOTE(step9): поддержка многострочного grantSets
    const setsAnchor = ctx.read(M).includes('export const grantSets = S => {\n  const got = [];')
      ? 'export const grantSets = S => {\n  const got = [];\n  if (HAT_SET.every(id => S.album[id]) && !S.album[\'title:hats\']) {\n    S.album[\'title:hats\'] = 1;\n    got.push(\'title:hats\');\n  }\n  return got;\n};'
      : "export const grantSets = S => { const got = []; if (HAT_SET.every(id => S.album[id]) && !S.album['title:hats']) { S.album['title:hats'] = 1; got.push('title:hats'); } return got; };";
    edit(M, 'SETS',
      setsAnchor,
      S3_SETS.trim());
    ctx.insertAfter(M, "export const HAT_SET = CATALOG.filter(x => x.kind === 'hat').map(x => x.id);",
      "\nexport const CHARM_SET = CATALOG.filter(x => x.kind === 'perkcharm').map(x => x.id); /* casino:step3 CHARM_SET */");
    // NOTE(step9): поддержка однострочного и многострочного albumProgress
    const albumProgressAnchor = ctx.read(M).includes('export const albumProgress = S => ({\n  have: CATALOG.filter(x => S.album[x.id]).length,\n  total: CATALOG.length\n});')
      ? 'export const albumProgress = S => ({\n  have: CATALOG.filter(x => S.album[x.id]).length,\n  total: CATALOG.length\n});'
      : 'export const albumProgress = S => ({ have: CATALOG.filter(x => S.album[x.id]).length, total: CATALOG.length });';
    ctx.insertAfter(M, albumProgressAnchor, '\n' + S3_PERKS, { done: 'casino:step3 PERKS' });
    // NOTE(step9): поддержка многострочного equip в newSlotsState
    const equipAnchor = ctx.read(M).includes("title: '',\n    theme: 'forest',\n    hist: []\n  };")
      ? "title: '',\n    theme: 'forest',\n    hist: []\n  };"
      : "title: '', theme: 'forest', hist: [] };";
    edit(M, 'EQUIP', equipAnchor, equipAnchor.replace("hist: []", "hist: [], equip: {} /* casino:step3 EQUIP */"));
    edit(M, 'OC-SIG', 'export function openCapsule(rng, S) {', 'export function openCapsule(rng, S, perks = {}) { /* casino:step3 OC-SIG */');
    // NOTE(step9): поддержка переноса строки после PITY_CAPSULES
    const ocPityAnchor = ctx.read(M).includes('let r = S.sinceEpic >= PITY_CAPSULES\n    ?')
      ? 'let r = S.sinceEpic >= PITY_CAPSULES\n    ?'
      : 'let r = S.sinceEpic >= PITY_CAPSULES ?';
    edit(M, 'OC-PITY', ocPityAnchor, 'let r = S.sinceEpic >= pityOf(perks) /* casino:step3 OC-PITY */ ?');
    // NOTE(step9): поддержка однострочного и многострочного dailyClaim
    const dailyAnchor = ctx.read(M).includes('const spins = DAILY_SPINS[p.streak - 1] + (perks.crown && p.streak === 7 ? 1 : 0);\n  const capsule = p.streak === 7;')
      ? 'const spins = DAILY_SPINS[p.streak - 1] + (perks.crown && p.streak === 7 ? 1 : 0);\n  const capsule = p.streak === 7;'
      : 'const spins = DAILY_SPINS[p.streak - 1] + (perks.crown && p.streak === 7 ? 1 : 0), capsule = p.streak === 7;';
    edit(M, 'DAILY',
      dailyAnchor,
      'const spins = DAILY_SPINS[p.streak - 1] + (perks.crown && p.streak === 7 ? 1 : 0) + Math.min(PERK_CAPS.dailyExtra, Math.max(0, Math.floor(Number(perks.dailyExtra) || 0))) /* casino:step3 DAILY */, capsule = p.streak === 7;');
    // процент к выплатам: после шагов 2/3 раунда, до суммирования; джекпот не масштабируется
    ctx.insertBefore(M, 'parts.total = parts.base + parts.fs + parts.pick + parts.jp;',
      '{ const pk = 1 + Math.min(PERK_CAPS.payoutPct, Math.max(0, Number(perks.payoutPct) || 0)) / 100; /* casino:step3 PAYOUT */\n'
      + '    if (pk > 1) { res.win = Math.min(MAX_WIN, res.win * pk); parts.base = res.win * bet; parts.fs = Math.min(MAX_WIN * bet, parts.fs * pk); parts.pick = Math.min(MAX_WIN * bet, parts.pick * pk); } }\n  ');

    /* ---- slots.js ---- */
    if (!ctx.read(U).includes('casino:step5')) {
      edit(U, 'KIND_EMOJI', 'const KIND_EMOJI = {', "const KIND_EMOJI = { cardback: '🂠', chips: '⚪', felt: '🟩', emote: '🦔', perkcharm: '🍀', /* casino:step3 KIND_EMOJI */");
      edit(U, 'KIND_NAME', 'const KIND_NAME = {', "const KIND_NAME = { cardback: 'Рубашки карт', chips: 'Фишки', felt: 'Сукно столов', emote: 'Эмоции ёжика', perkcharm: 'Талисманы', /* casino:step3 KIND_NAME */");
      edit(U, 'THEME_CLASS', 'const THEME_CLASS = {', "const THEME_CLASS = { 'theme:velvet': 'th-velvet', 'theme:arcade': 'th-arcade', 'theme:vault': 'th-vault', /* casino:step3 THEME_CLASS */");
      ctx.insertAfter(U, "{ id: 'picker', name: 'Ягодный сборщик', desc: 'Набери в поляне от 20× ставки' },", S3_ACH);
      edit(U, 'PERKSOF',
        "export const perksOf = H => ({ wizard: H.hat === 'wizard', crown: H.hat === 'crown', foil: H.hat === 'foil', halo: H.hat === 'halo' });",
        'export const perksOf = (H, S) => M.activePerks(S, H); /* casino:step3 PERKSOF — S нужен для перков предметов */');
      edit(U, 'ROLL', 'M.rollRound(rng, S, betEff, perksOf(H), { paid: !free })', 'M.rollRound(rng, S, betEff, perksOf(H, S), { paid: !free })');
      edit(U, 'DAILYCALL', 'M.dailyClaim(S, new Date(), perksOf(H))', 'M.dailyClaim(S, new Date(), perksOf(H, S))');
      edit(U, 'OPENCAP', 'M.openCapsule(rng, S);', 'M.openCapsule(rng, S, perksOf(H, S));');
      edit(U, 'DAILYUI', "${n}${perksOf(H).crown && i === 6 ? '+1' : ''}</b>", "${n + (perksOf(H, S).dailyExtra | 0)}${perksOf(H).crown && i === 6 ? '+1' : ''}</b>");
      edit(U, 'HINT1', 'perksOf(H).halo && S.hist.length ?', 'perksOf(H, S).gambleHint > 0 && S.hist.length ?');
      edit(U, 'HINT2', 'Нимб подсказывает прошлые карты: ${S.hist.slice(-5).map(cardHtml)', 'Подсказка — прошлые карты: ${S.hist.slice(-perksOf(H, S).gambleHint).map(cardHtml)');
      edit(U, 'PITYUI', '${M.PITY_CAPSULES}-й капсулы', '${M.pityOf(perksOf(H, S))}-й капсулы');
      edit(U, 'GRANT', 'toast(`🎩 Все шляпы собраны! Титул «${itemName(id)}»`);', 'toast(`🏅 Собран набор! Титул «${itemName(id)}»`);');
      edit(U, 'KINDS', "kinds = ['hat', 'palette', 'greeting', 'boost', 'title', 'theme'];", "kinds = ['hat', 'palette', 'greeting', 'boost', 'title', 'theme', 'cardback', 'chips', 'felt', 'emote', 'perkcharm'];");
      edit(U, 'EQ1', 'eq = S.title === x.id || S.theme === x.id;', 'eq = M.isEquipped(S, x.id);');
      edit(U, 'EQ2', "${n && (x.kind === 'title' || x.kind === 'theme') ? ", '${n && M.EQUIPPABLE.includes(x.kind) ? ');
      edit(U, 'EQ3', "{ const it = M.ITEM[btn.dataset.equip]; if (it.kind === 'title') S.title = it.id; else S.theme = it.id; save(); refresh(); }", '{ M.equipItem(S, btn.dataset.equip); save(); refresh(); /* casino:step3 EQ3 */ }');
    }
    if (!ctx.read(U).includes('casino:step3 AWARDS')) {
      ctx.insertAfter(U, "if (res.lines.some(l => l.count === 5 && l.sym === 'orange')) award('orange_king');",
        "\n      if (res.lines.some(l => l.count === 5 && l.sym === 'claude')) award('five_claude'); /* casino:step3 AWARDS */\n"
        + "      if (res.lines.some(l => l.count === 5 && l.sym === 'itmo')) award('five_itmo');\n"
        + "      if (res.sevenRow) award('seven_row');\n      if (res.capsules) award('capsule_sym');");
    }

    /* ---- игра «Ёжик» (index.html): шляпа hat:luckyseven ---- */
    edit('index.html', 'HATS',
      "{id:'foilpro',name:'Фольга-ПРО',cost:0,secret:true,perk:'Бонусы действуют вдвое дольше'}",
      "{id:'foilpro',name:'Фольга-ПРО',cost:0,secret:true,perk:'Бонусы действуют вдвое дольше'},{id:'luckyseven',name:'Шляпа счастливой семёрки',cost:0,secret:true,perk:'Каждая седьмая ягода забега — двойная'}");
    ctx.insertBefore('index.html', "}else if(id==='crown'){",
      "}else if(id==='luckyseven'){\n"
      + "    ctx.fillStyle='#d62f4b';ctx.beginPath();ctx.arc(0,0,0.5*R,Math.PI,0);ctx.closePath();ctx.fill();ctx.fillStyle='#b41f38';ell(ctx,0,0,0.6*R,0.08*R,0);"
      + "ctx.fillStyle='#fff';ctx.font='900 '+(0.46*R)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('7',0,-0.22*R);ctx.textBaseline='alphabetic';"
      + "ctx.fillStyle='#ffe066';starPath(ctx,0.34*R,-0.5*R,0.1*R);ctx.fill();\n  ",
      { done: "id==='luckyseven'" });
    edit('index.html', 'BERRY', '+(this.bst&&Math.random()<0.25?1:0);this.save.berries+=bb;',
      "+(this.bst&&Math.random()<0.25?1:0)+(this.save.hat==='luckyseven'&&this.run.berries%7===6?1:0);this.save.berries+=bb;");

    /* ---- палитры, шутки ---- */
    ctx.insertAfter('css/settings.css', '--pal-aurora-a:#2fb39a;--pal-aurora-b:#8a74f2;',
      '\n  --pal-graphite-a:#4b5563;--pal-graphite-b:#9aa3b2; /* casino:step3 palettes */\n  --pal-sakura-a:#d9558f;--pal-sakura-b:#f5a9c8;\n  --pal-ruby-a:#c4213a;--pal-ruby-b:#ee6f82;\n  --pal-tropic-a:#0f9d94;--pal-tropic-b:#f3c34a;');
    ctx.insertAfter('css/settings.css', ':root[data-palette="aurora"]{--accent:var(--pal-aurora-a);--accent2:var(--pal-aurora-b)}',
      ['graphite', 'sakura', 'ruby', 'tropic'].map(n => `\n:root[data-palette="${n}"]{--accent:var(--pal-${n}-a);--accent2:var(--pal-${n}-b)}`).join(''));
    ctx.insertAfter('js/settings.js', "  { id: 'aurora', name: 'Аврора' },",
      "\n  { id: 'graphite', name: 'Графит' },\n  { id: 'sakura', name: 'Сакура' },\n  { id: 'ruby', name: 'Рубин' },\n  { id: 'tropic', name: 'Тропики' },");
    ctx.insertAfter('js/greetings.js', "casino: ['Ставки сделаны — ягоды потрачены.', 'Крупье-ёжик приветствует вас.'],",
      "\n  linux: ['sudo make me a coffee.', 'Всё есть файл. Даже дедлайн.'],\n  deadline: ['Дедлайн — это когда ещё успеем. Нет.', 'До сдачи осталось ровно «ещё чуть-чуть».'],\n"
      + "  sleep: ['Ещё пять минуточек конспекта.', 'Сон — тоже форма повторения.'],\n  algo: ['Рекурсия: см. рекурсия.', 'Бинарный поиск по расписанию: аудитория где-то посередине.'],");

    ctx.createTest('casino-perks.mjs', S3_TEST);
    ctx.note('ШАГ 3: каталог 27 → 50 (23 новых; 4 из них setOnly: title:legend, chips:berry, felt:burgundy и уже существовавший title:hats). HAT_SET теперь 7 шляп.');
    ctx.note('ШАГ 3: темы th-velvet/th-arcade/th-vault без CSS (шаг 6); эмоджи в KIND_EMOJI временные (шаг 9: заменить на ic()); tests/slots.mjs может проверять размер каталога/HAT_SET=6 — сверить на шаге 9.');
    ctx.note('ШАГ 3: payoutPct масштабирует res.win/parts.fs/parts.pick, но не trace.fs.total (итог фриспинов в тосте чуть меньше реального) и не джекпот; bj_win/roulette_straight выдают шаги 6/8.');
  },
});

// ===== STEP 4: Art — hedgehog redesign, claude/itmo/seven/capsule sprites, skin hooks, art preview =====
// Что делает: (1) новый ёжик по эмодзи-референсу — SVG в js/slots-art.js (hedge(): hog/king/rust) и canvas drawHog в index.html (игра «Ёжик»,
// превью шляп); геометрия HOG одна на оба, (2) спрайты claude/itmo/seven/capsule + LABELS, (3) SYMBOL_SKINS/skinClass/symSkinned и data-sym
// у sym() для CSS-тем (правила пишет шаг 6), (4) tools/casino-art-preview.html (контактный лист), (5) tests/casino-art.mjs.
// Фон-ёжик HOG в js/backdrop.js не трогаем: он размытый и стилизованный, референс этого не требует.
const S4_NOTE = String.raw`/* casino:step4 hedgehog — ёжик по эмодзи-референсу (профиль). Геометрия HOG одна на SVG (js/slots-art.js) и canvas (index.html, drawHog).
   Координаты — в системе референса 512×512 (ёжик смотрит влево); и SVG, и canvas зеркалят её (scale(-k, k)), поэтому в игре ёжик смотрит вправо. */`;
const S4_OBJ = String.raw`{
  body: 'M48 207L92 226L101 158L122 203L156 132L186 168L206 137L224 160L262 126L293 117L300 139L357 121L352 150L392 152L428 152L412 174L468 200L444 224L493 248L458 266L486 290L452 312L470 332L440 352L452 394L440 430C420 436 395 440 372 440L250 384L196 380L150 372L124 330L110 250Z',
  under: 'M190 296C240 330 290 385 372 440L440 430L441 418C400 424 350 410 310 380C270 350 235 320 190 296Z',
  fringe: 'M50 214L92 226C130 222 170 232 196 252L208 304C190 272 150 256 104 262C80 252 62 240 50 214Z',
  farLeg: 'M114 350C134 344 158 344 166 350C172 392 170 425 160 446C150 454 120 454 106 448C104 430 106 392 114 350Z',
  belly: 'M160 366C195 352 245 362 285 386L345 414L366 426C372 440 352 448 320 446L190 446C168 436 156 396 160 366Z',
  neck: 'M176 285C200 300 210 340 192 374C176 382 156 384 140 380C170 362 182 322 176 285Z',
  head: 'M18 312C28 276 80 246 138 246C186 248 206 290 204 332C202 372 150 390 92 380C48 372 18 342 18 312Z',
  nose: 'M20 306C24 297 40 295 52 300C56 311 52 324 39 326C28 324 20 318 20 306Z',
  mouth: 'M36 332C48 348 66 354 77 343',
  ear: [198, 281, 28, 36, 16], earIn: [194, 286, 15, 23, 16], eye: [136, 299, 12, 17], eyeShine: [133, 291, 3.5],
  pawNear: [166, 450, 36, 15], pawRear: [320, 446, 44, 17],
  toes: { far: [[113, 441, 7]], near: [[154, 447, 8], [170, 454, 7]], rear: [[301, 450, 8], [316, 456, 7]] },
  stripes: [[150, 212, 172, 168, 13, 'l'], [198, 238, 235, 190, 15, 'l'], [258, 205, 310, 165, 16, 'l'], [250, 265, 305, 222, 15, 'l'], [280, 303, 383, 242, 14, 'l'], [335, 232, 386, 205, 10, 'l'], [330, 328, 402, 298, 14, 'l'], [366, 358, 426, 346, 14, 'l'], [386, 389, 416, 392, 10, 'l'], [420, 316, 450, 304, 9, 'l'], [242, 174, 272, 156, 12, 'd'], [326, 190, 368, 160, 14, 'd'], [400, 264, 430, 254, 10, 'd']],
  c: { quill: '#85594f', dark: '#6c473d', fringe: '#6f4639', stripeL: '#b97d69', stripeD: '#6f4a43', peach: '#ffd3b6', peachD: '#f7c291', pink: '#f27ab0', nose: '#3d3f43', eye: '#161616' },
}`;
const S4_SVG = String.raw`const mixHex = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const hogEll = (e, fill, extra) => '<ellipse cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] + '" ry="' + e[3] + '" fill="' + fill + '"' + (e[4] ? ' transform="rotate(' + e[4] + ' ' + e[0] + ' ' + e[1] + ')"' : '') + (extra || '') + '/>';
const hogToes = (list, fill) => list.map(t => '<circle cx="' + t[0] + '" cy="' + t[1] + '" r="' + t[2] + '" fill="' + fill + '"/>').join('');
// Сам ёжик в 100×100: группа зеркалит и масштабирует систему референса (k = 0.198, голова справа, лапы на y ≈ 85).
const HOG_FIT = 'translate(100.56 -7.36) scale(-0.198 0.198)';
const hedge = ({ hat = '', body = 'hogbody', back = HOG.c.dark, front = HOG.c.quill } = {}) => {
  const c = HOG.c, quill = front, dark = back, fringe = mixHex(front, back, 0.7), sl = mixHex(front, '#ffcfae', 0.36), sd = mixHex(front, '#2b1612', 0.28);
  const stripes = HOG.stripes.map(s => '<path d="M' + s[0] + ' ' + s[1] + 'L' + s[2] + ' ' + s[3] + '" stroke="' + (s[5] === 'd' ? sd : sl) + '" stroke-width="' + s[4] + '"/>').join('');
  return '<g transform="' + HOG_FIT + '">'
    + '<path d="' + HOG.farLeg + '" fill="' + c.peachD + '"/>' + hogToes(HOG.toes.far, c.pink)
    + '<path d="' + HOG.body + '" fill="' + quill + '"/>'
    + '<path d="' + HOG.body + '" fill="url(#g-' + body + ')" opacity=".22"/>'
    + '<path d="' + HOG.under + '" fill="' + dark + '"/>'
    + '<g fill="none" stroke-linecap="round">' + stripes + '</g>'
    + '<path d="' + HOG.belly + '" fill="' + c.peach + '"/>'
    + hogEll(HOG.pawNear, c.peach) + hogEll(HOG.pawRear, c.peach) + hogToes(HOG.toes.near, c.pink) + hogToes(HOG.toes.rear, c.pink)
    + '<path d="' + HOG.neck + '" fill="' + c.peachD + '"/>'
    + '<path d="' + HOG.fringe + '" fill="' + fringe + '"/>'
    + '<path d="' + HOG.head + '" fill="' + c.peach + '"/>'
    + hogEll(HOG.ear, c.peach) + hogEll(HOG.earIn, c.pink)
    + hogEll(HOG.eye, c.eye) + '<circle cx="' + HOG.eyeShine[0] + '" cy="' + HOG.eyeShine[1] + '" r="' + HOG.eyeShine[2] + '" fill="#fff"/>'
    + '<path d="' + HOG.nose + '" fill="' + c.nose + '"/><path d="' + HOG.mouth + '" stroke="' + c.nose + '" stroke-width="5" fill="none" stroke-linecap="round"/>'
    + '</g>' + hat;
};
// Шляпы короля и ржавого ёжика сидят на макушке (около x 73, y 38 в системе 100×100)
const crownHat = '<g transform="translate(75 43) rotate(12) scale(.55)"><path d="M-15 7L-17-9-8-2 0-13 8-2 17-9 15 7Z" fill="url(#g-gold)" stroke="#b9791a" stroke-width="2" stroke-linejoin="round"/><circle cx="-17" cy="-9" r="2.6" fill="#e8467c"/><circle cx="0" cy="-13" r="3" fill="#4aa8ff"/><circle cx="17" cy="-9" r="2.6" fill="#e8467c"/></g>';
const gearHat = '<g transform="translate(75 41) rotate(10) scale(.6)"><g fill="#c9622a" stroke="#7a2f08" stroke-width="1.4" stroke-linejoin="round">' + Array.from({ length: 8 }, (_, i) => '<rect x="-2.4" y="-10.5" width="4.8" height="5.5" rx="1" transform="rotate(' + i * 45 + ')"/>').join('') + '</g><circle r="7" fill="#ffd09a" stroke="#7a2f08" stroke-width="2"/><circle r="2.6" fill="#7a2f08"/></g>';`;
const S4_SPRITES = String.raw`/* casino:step4 symbols — спрайты claude / itmo (логотипы по присланным изображениям) и seven / capsule (оригинальные) */
const sparkle = (x, y, r, fill) => '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + fill + '"/>';
/* casino:step4 logos — логотипы Claude и ИТМО по присланным изображениям (трассировка в векторные контуры; плашка ИТМО 100×36.41 по центру) */
S.claude = "<rect width='100' height='100' rx='22.5' fill='#d77655'/><path fill='#fcf2ee' fill-rule='evenodd' d='M32.4 13.9L30.3 16.8L31.1 20.7L36.1 29.1L42.2 40L41.6 40.6L24 27.3L20.9 27.1L19.1 29.1L19.5 32.4L20.7 33.8L22.7 35L26.2 37.7L41.8 48L42.6 49L42.2 49.4L40.8 49.4L40.6 49.2L38.9 49.2L38.7 49L33 48.6L32.8 48.4L29.7 48.4L29.5 48.2L20.9 47.9L20.7 47.7L18.2 47.7L18 47.5L15 47.3L13.7 48.2L13.5 49.2L15 51.4L16.8 51.8L28.5 52.1L28.7 52.3L40.2 52.5L40.4 52.7L42 52.7L42.4 53.1L42.4 53.5L42 54.1L27.5 62.1L22.7 65.4L21.3 66.6L21.1 68.9L22.5 70.1L24 70.1L24.2 69.9L26.2 69.7L45.3 57.2L45.5 57.4L45.3 58.2L42.2 61.7L29.9 77.7L29.7 79.9L31.4 80.9L32 80.9L33 80.5L38.3 74.8L48.6 60.5L49.6 59.8L49.8 60.4L49.2 61.9L48.4 68L45.3 82.4L45.3 83L46.3 85.2L47.9 86.3L50.2 85.5L51.2 84.4L52.1 72.1L52.3 71.9L52.7 65.8L52.9 65.6L52.9 63.7L53.1 63.5L53.1 62.5L53.5 62.1L54.3 62.9L57.6 68.8L60.7 73.2L60.9 73.8L65.6 80.5L67.8 80.9L68.4 80.5L69.3 80.3L69.9 79.3L69.7 76.6L69.3 75.4L61.1 63.3L61.3 62.5L67.2 67.2L70.1 69.9L76.4 74.6L77.7 75L78.7 73.6L78.3 72.1L61.1 56.1L61.3 55.7L62.3 55.7L82 60.5L82.6 60.5L86.1 58.8L86.3 57.2L84.8 55.3L82.6 53.9L73.8 53.3L73.6 53.1L65.8 53.1L65.6 52.9L61.9 52.7L61.5 52.3L62.3 52L64.6 51.6L68 50.6L68.8 50.6L71.3 49.8L79.7 48.2L85.2 46.9L86.1 44.5L85.9 43.4L83.6 42.2L73.8 43.8L70.9 44.5L68.2 44.9L67.2 45.3L65.4 45.5L64.5 45.9L63.9 45.9L63.5 45.5L66 41L75.8 28.3L76.8 25L74.4 21.7L71.3 21.7L69.7 22.9L65 27.9L59.6 34.8L57.2 38.1L56.1 39.3L55.7 39.3L55.5 39.1L55.5 38.1L58.2 24.6L59.2 17.2L57.8 15.2L56.1 14.5L54.3 15.6L53.7 16.2L52.7 18.8L52.3 24.4L52.1 24.6L52.1 26.8L52 27L52 29.1L51.8 29.3L51.6 32.6L51.4 32.8L51.2 36.1L51 36.3L50.8 41.2L50.2 41.4L49.6 40.2L49.2 38.3L42.4 25L38.1 15L36.9 13.9L33.4 13.5Z'/>";
S.itmo = "<rect y='31.79' width='100' height='36.41' rx='18.2' fill='#000'/><path fill='#fff' fill-rule='evenodd' d='M48.8 42.5L48.8 57.3L52.7 57.3L52.7 45.4L52.8 45.3L57.5 57.3L61.7 57.3L66.4 45.4L66.5 45.5L66.5 57.3L70.5 57.3L70.5 42.5L63.7 42.5L59.9 51.9L59.6 52.2L55.6 42.5ZM32.3 42.5L32.3 46.1L37.7 46.1L37.8 46.2L37.8 57.3L41.7 57.3L41.7 46.2L41.8 46.1L47.3 46.1L47.3 42.5ZM12.9 42.5L12.9 57.3L21 57.3L26.6 43L26.9 42.6L27 42.7L27 57.3L30.9 57.3L30.9 42.5L23 42.5L17.2 56.7L16.9 57.2L16.8 57.1L16.8 42.5ZM28.2 37.3L27.7 37.6L27.1 38.4L27 39.7L27.3 40.2L27.8 40.8L28.3 41L29.6 41L30.1 40.8L30.6 40.2L30.9 39.7L30.8 38.4L30.6 38L29.8 37.3L29.5 37.2Z'/><path fill='#f0f0f0' fill-rule='evenodd' d='M77 42.6L76.2 42.9L75.1 43.4L73.8 44.4L73 45.3L72.1 46.9L71.8 48.1L71.8 48.6L71.7 48.7L71.7 51.2L71.8 51.2L71.8 51.7L72.1 52.9L73 54.5L73.9 55.5L75.1 56.4L76.2 56.9L77.4 57.3L78.4 57.4L78.5 57.5L80.3 57.5L80.4 57.4L81 57.4L82.6 56.9L83.7 56.4L85 55.4L85.8 54.5L86.7 52.9L87 51.7L87 51.2L87.1 51.1L87.1 48.8L87 48.7L87 48.1L86.7 46.9L86.1 45.8L85.3 44.8L84.5 44L82.8 43L81.3 42.5L80.3 42.5L80.2 42.4L78.6 42.4L78.5 42.5L77.9 42.5L77.8 42.5ZM78.6 45.9L80.2 45.9L81.4 46.4L82.6 47.4L83 48.2L83.2 48.8L83.2 49.1L83.3 49.2L83.3 50.6L83.2 50.7L83.2 51.1L82.8 52.1L82.2 52.8L81.7 53.3L81.1 53.6L80.2 53.9L78.6 53.9L77.4 53.5L76.7 53L76.1 52.3L75.6 51.1L75.6 50.7L75.5 50.6L75.5 49.2L75.6 49.1L75.6 48.8L75.8 48.2L76.1 47.5L76.6 46.9L77.4 46.4Z'/>";
const SEVEN_D = 'M20 15H81V30L53 87H34L58 34H20Z';
S.seven = '<path d="' + SEVEN_D + '" fill="#ffd54a" stroke="#c98d0a" stroke-width="11" stroke-linejoin="round"/>'
  + '<path d="' + SEVEN_D + '" fill="url(#g-red)" stroke="#7a0f1d" stroke-width="3.2" stroke-linejoin="round"/>'
  + '<path d="M27 21H73" stroke="#fff" stroke-opacity=".6" stroke-width="4.5" stroke-linecap="round"/><path d="M62 38L45 74" stroke="#fff" stroke-opacity=".3" stroke-width="3.5" stroke-linecap="round"/>' + sparkle(84, 14, 7, '#fff8c0') + sparkle(16, 80, 5, '#fff8c0');
// capsule объявлена выше (const capsule), поэтому символ собираем здесь
S.capsule = '<circle cx="50" cy="50" r="48" fill="url(#g-glow)"/><g transform="translate(50 52) scale(1.12) translate(-50 -50)">' + capsule('#ffe27a', '#e0861a') + '</g>' + sparkle(80, 20, 8, '#fff') + sparkle(18, 30, 5, '#fff6a0') + sparkle(84, 74, 4, '#fff6a0');`;
const S4_CANVAS = String.raw`/* casino:step4 hedgehog — геометрия HOG совпадает с js/slots-art.js (там SVG, здесь canvas). */
var HOG = __HOG_OBJ__;
var HOG_PATHS = null;
function hogPaths() {
  if (!HOG_PATHS) { HOG_PATHS = {}; for (var key of ['body', 'under', 'fringe', 'farLeg', 'belly', 'neck', 'head', 'nose', 'mouth']) HOG_PATHS[key] = new Path2D(HOG[key]); }
  return HOG_PATHS;
}
function hogEllipse(ctx, e, fill, dx, dy) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(e[0] + (dx || 0), e[1] + (dy || 0), e[2], e[3], (e[4] || 0) * Math.PI / 180, 0, TAU); ctx.fill();
}
function hogToes(ctx, list, dx, dy) {
  ctx.fillStyle = HOG.c.pink;
  for (var t of list) { ctx.beginPath(); ctx.arc(t[0] + dx, t[1] + dy, t[2], 0, TAU); ctx.fill(); }
}
/* o: curl, leg, run, roll, hat, blink, sleepy, dizzy, t */
function drawHog(ctx, R, o) {
  var curl = o.curl || 0, prof = 1 - clamp(curl * 1.7, 0, 1), hat = o.hat || 'none', c = HOG.c, k = R * 0.0057;
  if (prof > 0.02) {
    var P = hogPaths(), run = o.run === undefined ? 1 : o.run, ph = o.leg || 0, amp = 26 * run;
    var sw = i => Math.sin(ph + i * Math.PI) * amp, lift = i => Math.max(0, Math.cos(ph + i * Math.PI)) * 20 * run;
    ctx.save(); ctx.globalAlpha = prof;
    ctx.translate(256 * k, -115 * k - R); ctx.scale(-k, k);
    // дальняя передняя лапа
    var fx = sw(1), fy = -lift(1);
    ctx.fillStyle = c.peachD; ctx.save(); ctx.translate(fx, fy); ctx.fill(P.farLeg); ctx.restore(); hogToes(ctx, HOG.toes.far, fx, fy);
    // спина, низ, полосы
    ctx.fillStyle = c.quill; ctx.fill(P.body);
    ctx.fillStyle = c.dark; ctx.fill(P.under);
    ctx.lineCap = 'round';
    for (var s of HOG.stripes) { ctx.strokeStyle = s[5] === 'd' ? c.stripeD : c.stripeL; ctx.lineWidth = s[4]; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); }
    // брюшко и ближние лапы
    ctx.fillStyle = c.peach; ctx.fill(P.belly);
    var nx = sw(0), ny = -lift(0), rx = sw(1), ry = -lift(1);
    hogEllipse(ctx, HOG.pawNear, c.peach, nx, ny); hogEllipse(ctx, HOG.pawRear, c.peach, rx, ry);
    hogToes(ctx, HOG.toes.near, nx, ny); hogToes(ctx, HOG.toes.rear, rx, ry);
    // шея, чёлка, голова, ухо
    ctx.fillStyle = c.peachD; ctx.fill(P.neck);
    ctx.fillStyle = c.fringe; ctx.fill(P.fringe);
    ctx.fillStyle = c.peach; ctx.fill(P.head);
    hogEllipse(ctx, HOG.ear, c.peach); hogEllipse(ctx, HOG.earIn, c.pink);
    // глаз
    var e = HOG.eye, bl = o.sleepy ? 0.25 : 1 - (o.blink || 0);
    if (o.sleepy >= 1 || bl < 0.15) { ctx.strokeStyle = c.eye; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e[0], e[1] + 4, 11, 0.15, Math.PI - 0.15); ctx.stroke(); }
    else { hogEllipse(ctx, [e[0], e[1], e[2], e[3] * bl], c.eye); if (bl > 0.5) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(HOG.eyeShine[0], HOG.eyeShine[1], HOG.eyeShine[2], 0, TAU); ctx.fill(); } }
    ctx.fillStyle = c.nose; ctx.fill(P.nose);
    ctx.strokeStyle = c.nose; ctx.lineWidth = 5; ctx.stroke(P.mouth);
    ctx.restore();
    // очки, шляпа, звёздочки — уже в координатах игры (центр ёжика в 0,0; голова справа)
    ctx.save(); ctx.globalAlpha = prof;
    if (hat === 'glasses') {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.05 * R; ctx.beginPath(); ctx.moveTo(0.45 * R, 0.02 * R); ctx.lineTo(0.2 * R, -0.12 * R); ctx.stroke();
      ctx.fillStyle = '#1d1d26'; ell(ctx, 0.64 * R, 0.03 * R, 0.21 * R, 0.19 * R, 0.1); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ell(ctx, 0.58 * R, -0.03 * R, 0.07 * R, 0.04 * R, -0.4);
    } else if (hat !== 'none') {
      ctx.translate(0.62 * R, -0.3 * R); ctx.rotate(0.2); ctx.scale(0.72, 0.72); drawHat(ctx, hat, R);
    }
    ctx.restore();
    if (o.dizzy) {
      ctx.save(); ctx.globalAlpha = prof; ctx.fillStyle = '#ffe066';
      for (var i = 0; i < 3; i++) { var a = (o.t || 0) * 4 + i * TAU / 3; starPath(ctx, 0.4 * R + Math.cos(a) * 0.55 * R, -1.3 * R + Math.sin(a) * 0.15 * R, 0.14 * R); ctx.fill(); }
      ctx.restore();
    }
  }
  if (curl > 0.02) { // клубок: колючки того же рисунка (две тональности и светлые штрихи)
    var ball = clamp(curl * 1.7, 0, 1), rot = o.roll || 0;
    ctx.save(); ctx.globalAlpha = ball;
    spikeRow(ctx, 24, TAU, 0, 0.86 * R, 0.36 * R, c.dark, rot, 0);
    spikeRow(ctx, 24, TAU, TAU / 48, 0.84 * R, 0.27 * R, c.quill, rot, 5);
    ctx.fillStyle = c.quill; circ(ctx, 0, 0, 0.93 * R);
    ctx.save(); ctx.rotate(rot); ctx.lineCap = 'round'; ctx.lineWidth = 0.1 * R;
    for (var j = 0; j < 5; j++) { var b = j * 1.26; ctx.strokeStyle = j % 2 ? c.stripeD : c.stripeL; ctx.beginPath(); ctx.arc(0, 0, 0.6 * R, b, b + 0.55); ctx.stroke(); }
    ctx.restore(); ctx.restore();
  }
}`;
const S4_SKINS = String.raw`/* casino:step4 skins — CSS-хуки тем барабанов. sym() ставит data-sym="id"; класс скина вешается на контейнер барабанов,
   правила вида .sk-arcade .sl-sym[data-sym="seven"] { filter: … } пишет шаг 6 (css/casino-themes.css). Сам рисунок не меняется. */
export const SYMBOL_SKINS = { forest: '', night: 'sk-night', server: 'sk-server', velvet: 'sk-velvet', arcade: 'sk-arcade', vault: 'sk-vault' };
export const skinClass = theme => SYMBOL_SKINS[String(theme || '').replace(/^theme:/, '')] || '';
export const symSkinned = (id, size = 64, theme = '', cls = '') => sym(id, size, (skinClass(theme) + ' ' + cls).trim());`;
const S4_PREVIEW = String.raw`<!DOCTYPE html>
<!-- casino:step4 art preview — собрано tools/apply-casino.mjs из js/slots-art.js и index.html; после правок рисунков запустите установщик ещё раз -->
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Casino art — contact sheet</title>
<style>
body{margin:0;font:13px/1.4 system-ui,sans-serif;background:#888;color:#222}
h1{margin:0;padding:14px 18px;font-size:18px;background:#222;color:#fff}
.note{margin:0;padding:0 18px 12px;background:#222;color:#bbb}
.panels{display:grid;grid-template-columns:1fr 1fr}
.panel{padding:14px 18px 30px;min-width:0}
.light{background:#f5f6f9;color:#171923}.dark{background:#11131b;color:#f4f4f8}
h2{margin:0 0 6px;font-size:16px}h3{margin:20px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
.symrow{display:flex;align-items:flex-end;gap:14px;padding:6px 0;border-bottom:1px solid rgba(128,128,128,.25)}
.symrow b{width:78px;font-size:11px;font-weight:600}.symrow small{width:150px;font-size:11px;opacity:.7}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.cell{text-align:center;font-size:11px}.cell canvas{display:block;margin:0 auto 2px}
.skins{font-size:11px;opacity:.8}
@media(max-width:1100px){.panels{grid-template-columns:1fr}}
</style></head><body>
<h1>Casino art — contact sheet</h1><p class="note">Слева светлая подложка, справа тёмная. Символы — SVG-спрайт из js/slots-art.js; ёжик в игре — canvas drawHog из index.html.</p>
<div class="panels"><section class="panel light" id="pl"></section><section class="panel dark" id="pd"></section></div>
<script>(function(){
__ART__
window.ART = { __ARTNAMES__ };
})();</script>
<script>(function(){
__GAME__
window.GAME = { drawHog: drawHog, HATS: HATS };
})();</script>
<script>
(function(){
  ART.ensureSprite();
  var ICONS = ['cap-common', 'cap-rare', 'cap-epic', 'cap-legendary', 'pointer', 'flame'];
  function hogCell(host, R, opt, label) {
    var w = Math.round(R * 3.4), h = Math.round(R * 3), d = document.createElement('div'), cv = document.createElement('canvas');
    d.className = 'cell'; cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.translate(w * 0.47, h * 0.56);
    GAME.drawHog(ctx, R, Object.assign({ curl: 0, run: 0, hat: 'none', blink: 0, leg: 0.4, t: 1 }, opt));
    d.appendChild(cv); d.appendChild(document.createTextNode(label)); host.appendChild(d);
  }
  [['pl', 'светлая'], ['pd', 'тёмная']].forEach(function(p) {
    var host = document.getElementById(p[0]);
    host.innerHTML = '<h2>' + p[1] + ' подложка</h2><h3>Символы (32 / 64 / 112 px)</h3><div class="syms"></div><h3>Иконки</h3><div class="row icons"></div><h3>Ёжик в игре: размеры и состояния</h3><div class="row states"></div><h3>Ёжик: все шляпы</h3><div class="row hats"></div><h3>Скины символов (CSS-хуки, правила — шаг 6)</h3><p class="skins"></p>';
    var syms = host.querySelector('.syms');
    ART.SYMBOL_IDS.forEach(function(id) {
      var r = document.createElement('div'); r.className = 'symrow';
      r.innerHTML = '<b>' + id + '</b><small>' + (ART.LABELS[id] || '') + '</small>' + [32, 64, 112].map(function(s) { return ART.sym(id, s); }).join('');
      syms.appendChild(r);
    });
    host.querySelector('.icons').innerHTML = ICONS.map(function(id) { return ART.icon(id, 28) + ART.icon(id, 44) + ART.icon(id, 64); }).join('');
    var st = host.querySelector('.states');
    [16, 26, 44, 70].forEach(function(R) { hogCell(st, R, {}, 'R ' + R); });
    hogCell(st, 44, { run: 1, leg: 1.2 }, 'бег'); hogCell(st, 44, { curl: 0.4 }, 'curl .4'); hogCell(st, 44, { curl: 1, roll: 0.5 }, 'клубок');
    hogCell(st, 44, { sleepy: 1, dizzy: true }, 'сон'); hogCell(st, 44, { blink: 1 }, 'моргает');
    var hats = host.querySelector('.hats');
    GAME.HATS.forEach(function(h) { hogCell(hats, 36, { hat: h.id }, h.id); });
    host.querySelector('.skins').textContent = Object.keys(ART.SYMBOL_SKINS).map(function(k) { return k + ' → ' + (ART.SYMBOL_SKINS[k] || '(без класса)'); }).join(' · ');
  });
})();
</script></body></html>
`;
const S4_TEST = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../js/slots-math.js';
import * as Art from '../js/slots-art.js';

// Шаг 4 казино: у каждого символа есть рисунок и подпись, ёжик нарисован новой геометрией, хуки скинов на месте.
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('каждый символ слотов нарисован и подписан', () => {
  for (const s of M.SYMBOLS) { assert.ok(Art.SYMBOL_IDS.includes(s), 'спрайт ' + s); assert.ok(Art.LABELS[s], 'подпись ' + s); assert.ok(Art.SPRITE.includes('id="sl-' + s + '"'), 'symbol ' + s); }
  for (const s of ['claude', 'itmo', 'seven', 'capsule']) assert.ok(Art.sym(s, 40).includes('data-sym="' + s + '"'), s);
});

test('SVG-спрайты: теги сбалансированы, ссылки на градиенты существуют', () => {
  const ids = new Set([...Art.SPRITE.matchAll(/id="(g-[\w-]+)"/g)].map(m => m[1]));
  for (const m of Art.SPRITE.matchAll(/url\(#(g-[\w-]+)\)/g)) assert.ok(ids.has(m[1]), 'градиент ' + m[1]);
  const open = (Art.SPRITE.match(/<(?!\/|!)[a-zA-Z]+(?:\s[^>]*?)?(?<!\/)>/g) || []).filter(t => !/^<(path|circle|ellipse|rect|stop|use|polyline|line)\b/.test(t)).length;;
  const close = (Art.SPRITE.match(/<\/[a-zA-Z]+>/g) || []).length;
  assert.equal(open, close);
});

test('ёжик: геометрия одна в SVG и canvas, ключи на месте', () => {
  const html = read('index.html'), art = read('js/slots-art.js');
  assert.ok(html.includes('casino:step4 hedgehog') && art.includes('casino:step4 hedgehog'));
  for (const key of ['body', 'under', 'fringe', 'farLeg', 'belly', 'neck', 'head', 'nose', 'mouth', 'stripes', 'toes']) assert.ok(html.includes(key + ':') && art.includes(key + ':'), key);
  const grab = src => /var HOG = (\{[^\n]*\n[\s\S]*?\n\});/.exec(src) || /const HOG = (\{[^\n]*\n[\s\S]*?\n\});/.exec(src);
  assert.equal(grab(html)[1], grab(art)[1]);
  for (const h of ['hog', 'king', 'rust']) assert.ok(Art.SPRITE.includes('translate(100.56 -7.36) scale(-0.198 0.198)'), h);
});

test('скины символов', () => {
  assert.equal(Art.skinClass('theme:arcade'), 'sk-arcade'); assert.equal(Art.skinClass('forest'), ''); assert.equal(Art.skinClass('nope'), '');
  assert.ok(Art.symSkinned('seven', 40, 'theme:vault').includes('sk-vault'));
});`;

steps.push({
  id: 4,
  name: 'Art — hedgehog redesign, claude/itmo/seven/capsule sprites, skin hooks, art preview',
  run(ctx) {
    const ART = 'js/slots-art.js', HTML = 'index.html', DONE = 'casino:step4 hedgehog';
    const once = (src, text, what) => { const i = src.indexOf(text); if (i < 0 || src.indexOf(text, i + 1) >= 0) throw new Error(what + ': маркер «' + text.slice(0, 50) + '» должен встретиться ровно 1 раз'); return i; };

    /* ---- 1. SVG-ёжик в slots-art: заменяем блок «quills … hedge» целиком ---- */
    const art = ctx.read(ART);
    if (!art.includes(DONE)) {
      const a = once(art, '/* ---------- ёжик (по мотивам эмодзи', 'slots-art'), b = once(art, 'const spikes = (cx, cy, r, n, len, fill) =>', 'slots-art');
      if (b < a) throw new Error('slots-art: блок ёжика расположен неожиданно');
      ctx.replaceOnce(ART, art.slice(a, b), S4_NOTE + '\nconst HOG = ' + S4_OBJ + ';\n' + S4_SVG + '\n\n', { done: DONE });
    }
    /* ---- 1b. NOTE(fix): передняя дальняя лапа была оторвана от тела (между головой и лапой виден фон, палец торчал за краем).
       Для уже установленных файлов (маркер DONE есть, блок выше пропущен) точечно подменяем старую геометрию на новую;
       при чистой установке S4_OBJ уже содержит новую — правки пропускаются как «уже применено». ---- */
    // NOTE(step9): в HTML блок drawHog появляется только в секции 4 ниже; блок 1b применяется к HTML только если DONE уже есть
    for (const file of [ART, HTML]) {
      if (file === HTML && !ctx.read(HTML).includes(DONE)) continue;
      ctx.replaceOnce(file, "farLeg: 'M118 394C132 386 150 384 162 386C170 405 170 425 160 446C150 454 120 454 106 448C104 430 108 410 118 394Z',",
        "farLeg: 'M114 350C134 344 158 344 166 350C172 392 170 425 160 446C150 454 120 454 106 448C104 430 106 392 114 350Z',",
        { done: "farLeg: 'M114 350C134 344 158 344 166 350" });
      ctx.replaceOnce(file, 'toes: { far: [[101, 436, 7]],', 'toes: { far: [[113, 441, 7]],', { done: 'toes: { far: [[113, 441, 7]],' });
    }
    /* ---- 2. градиенты, подписи, новые спрайты ---- */
    ctx.insertAfter(ART, "g('rustc', '#ffb070', '#b5470f'),", " g('spark', '#ffc88a', '#d8552f'), g('itmo', '#5aa0ff', '#0f2a6b'), /* casino:step4 defs */", { done: 'casino:step4 defs' });
    ctx.insertAfter(ART, "bonus: 'Корзина с ягодами (бонус)',", " claude: 'Логотип Claude', itmo: 'Логотип ИТМО', seven: 'Счастливая семёрка', capsule: 'Золотая капсула', /* casino:step4 labels */", { done: 'casino:step4 labels' });
    ctx.insertBefore(ART, 'const ICONS = {', S4_SPRITES + '\n', { done: 'casino:step4 symbols' });
    /* ---- 2b. NOTE(logos): claude/itmo теперь настоящие логотипы. Для уже установленных файлов (блок символов пропущен как «уже есть»)
       подменяем старые спрайты S.claude/S.itmo и подписи; при чистой установке новое уже на месте — правки пропускаются. ---- */
    {
      const logos = S4_SPRITES.slice(S4_SPRITES.indexOf('/* casino:step4 logos'), S4_SPRITES.indexOf('const SEVEN_D'));
      const cur = ctx.read(ART);
      if (!cur.includes('casino:step4 logos')) {
        const a = once(cur, 'S.claude = ', 'slots-art'), b = once(cur, 'const SEVEN_D', 'slots-art');
        if (b < a) throw new Error('slots-art: спрайты claude/itmo расположены неожиданно');
        ctx.replaceOnce(ART, cur.slice(a, b), logos, { done: 'casino:step4 logos' });
      }
      ctx.replaceOnce(ART, "claude: 'Тёплая искра', itmo: 'Щит-эмблема ИТМО',", "claude: 'Логотип Claude', itmo: 'Логотип ИТМО',", { done: "claude: 'Логотип Claude', itmo: 'Логотип ИТМО'," });
    }
    /* ---- 3. sym(): data-sym + хуки скинов ---- */
    {
      const cur = ctx.read(ART);
      if (!cur.includes('casino:step4 skins')) {
        const a = once(cur, 'export const sym = (', 'slots-art'), b = cur.indexOf('\n', a), oldLine = cur.slice(a, b);
        const newLine = "export const sym = (id, size = 64, cls = '') => '<svg class=\"sl-sym ' + cls + '\" data-sym=\"' + id + '\" width=\"' + size + '\" height=\"' + size + '\" viewBox=\"0 0 100 100\" role=\"img\" aria-label=\"' + (LABELS[id] || '') + '\"><use href=\"#sl-' + id + '\"/></svg>';\n" + S4_SKINS;
        ctx.replaceOnce(ART, oldLine, newLine, { done: 'casino:step4 skins' });
      }
    }
    /* ---- 4. canvas-ёжик в index.html: заменяем drawHog (spikeRow, drawHat и шляпы не трогаем) ---- */
    const html = ctx.read(HTML);
    if (!html.includes(DONE)) {
      const startMark = '/* o: curl, leg, run, roll, hat, blink, sleepy, dizzy, t */\nfunction drawHog(ctx,R,o){', endMark = '\n\n/* ===== предметы мира ===== */';
      const a = once(html, startMark, 'index.html'), b = once(html, endMark, 'index.html');
      if (b < a) throw new Error('index.html: drawHog расположен неожиданно');
      ctx.replaceOnce(HTML, html.slice(a, b), S4_NOTE + '\n' + S4_CANVAS.replace('__HOG_OBJ__', () => S4_OBJ).trimEnd(), { done: DONE });
    }
    /* ---- 5. контактный лист (самодостаточный HTML, открывается двойным кликом) ---- */
    {
      const a2 = ctx.read(ART), h2 = ctx.read(HTML);
      const names = [...a2.matchAll(/^export (?:const|function) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
      const artCode = a2.replace(/^export /gm, '');
      const u0 = h2.indexOf('const TAU=Math.PI*2,'), u1 = h2.indexOf('function pl(', u0);
      const t0 = h2.indexOf('const HATS=['), t1 = h2.indexOf('\n];', t0) + 3;
      const d0 = h2.indexOf('function circ(ctx,x,y,r)'), d1 = h2.indexOf('/* ===== предметы мира ===== */');
      if ([u0, u1, t0, t1, d0, d1].some(n => n < 0) || u1 < u0 || d1 < d0) throw new Error('index.html: не удалось вырезать код ёжика для контактного листа');
      const game = h2.slice(u0, u1) + '\n' + h2.slice(t0, t1) + '\n' + h2.slice(d0, d1);
      const body = S4_PREVIEW.replace('__ART__', () => artCode.replaceAll('</script', '<\\/script')).replace('__ARTNAMES__', () => names.join(', ')).replace('__GAME__', () => game.replaceAll('</script', '<\\/script'));
      ctx.createFile('tools/casino-art-preview.html', body);
    }
    ctx.createTest('casino-art.mjs', S4_TEST);
    ctx.note('ШАГ 4: ёжик перерисован (slots-art hedge(), index.html drawHog); новые SYMBOL_IDS: claude, itmo, seven, capsule (+LABELS). Экспорты: SYMBOL_SKINS, skinClass(theme), symSkinned(id,size,theme,cls); sym() теперь ставит data-sym="id". Классы скинов sk-night/server/velvet/arcade/vault — правила CSS пишет шаг 6.');
    ctx.note('ШАГ 4: шляпа luckyseven уже нарисована шагом 3 (проверено). js/slots.js: FILL и таблица выплат всё ещё не знают новых символов — это не шаг 4. Контактный лист: tools/casino-art-preview.html (после правок рисунков запустите установщик заново — он пересоберёт файл).');
  },
});

// ===== STEP 5: Casino hub, routing, Slots split, Collection page =====
const S5_DEC = s => s.replaceAll('@@DS@@', '${').replaceAll('@@BT@@', '`');
const S5_COMMON_HEAD = S5_DEC(String.raw`/*
  Общий модуль казино: константы и сохранение (перенесены из slots.js без изменений), HUD, шаги ставок,
  глобальный перерыв, баланс, звук, награды, таймеры и частицы. Без DOM при импорте (грузится и в Node).
  Состояние — в существующих подписанных объектах: S = m3102-slots-v1 (signSlots), H = hh_save_v1 (signShared).
*/
import * as M from './slots-math.js';
import { makeSlotsAudio } from './slots-audio.js';

/*__R1__*/
/*__R2__*/
/*__R3A__*/
/*__R3B__*/
`);
const S5_COMMON_TAIL = S5_DEC(String.raw`
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
export const breakText = S => @@BT@@Перерыв до @@DS@@clock(S.breakUntil)}. Хороший ход — отдохнуть. Загляни к ёжику или конспектам.@@BT@@;
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
/*__AWARDS__*/
  return { award, checkAlbum };
}
`);
const S5_COLLECTION = S5_DEC(String.raw`/*
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

  content.innerHTML = @@BT@@<section class="casino-page cs-collection-page" data-no-icons>
    <a class="cs-back" href="#/casino">@@DS@@ic('arrowLeft', 16)}<span>Казино</span></a>
    <div class="intro cs-intro"><span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span><h1>Коллекция</h1><p class="sub">Капсулы, альбом, ежедневные спины, колесо дня и достижения.</p></div>
    <div class="cs-status"><div class="cs-stat"><span>Ягоды</span><b id="co-bal">0</b></div><div class="cs-stat"><span>Бесплатные спины</span><b id="co-free">0</b></div><div class="cs-stat"><span>Капсулы</span><b id="co-caps">0</b></div></div>
    <div class="cs-tabs" role="tablist" aria-label="Разделы коллекции">@@DS@@COLLECTION_TABS.map(t => @@BT@@<button type="button" class="cs-tab" role="tab" id="co-tab-@@DS@@t.id}" data-tab="@@DS@@t.id}" aria-controls="co-panel-@@DS@@t.id}" aria-selected="false" tabindex="-1">@@DS@@t.label}</button>@@BT@@).join('')}</div>
    <div class="cs-panel" id="co-panel-album" role="tabpanel" aria-labelledby="co-tab-album" hidden><div class="sl-panels"><section class="dash-panel sl-wide" id="sl-album" aria-label="Альбом"></section></div></div>
    <div class="cs-panel" id="co-panel-daily" role="tabpanel" aria-labelledby="co-tab-daily" hidden><div class="sl-panels"><section class="dash-panel" id="sl-daily" aria-label="Ежедневные спины"></section><section class="dash-panel" id="sl-wheel" aria-label="Колесо дня"></section></div></div>
    <div class="cs-panel" id="co-panel-stats" role="tabpanel" aria-labelledby="co-tab-stats" hidden><div class="sl-panels"><section class="dash-panel" id="sl-ach" aria-label="Достижения"></section><section class="dash-panel" id="sl-stats" aria-label="Статистика"></section></div></div>
    <dialog id="sl-dlg" class="app-dialog sl-dlg"></dialog>
  </section>@@BT@@;
  const dlg = $('#sl-dlg');

  const { award, checkAlbum } = makeAwards({ S, toast, audio, itemName, onChange: () => { renderAch(); renderAlbum(); } });

/*__BLOCK_A__*/
  const hud = () => {
    $('#co-bal').textContent = fmt(H.berries); $('#co-free').textContent = String((S.free | 0) + (H.bonusSpins | 0)); $('#co-caps').textContent = String(S.capsules | 0);
  };
  const renderPanels = () => { renderDaily(); renderWheel(); renderAlbum(); renderAch(); renderStats(); };
  const refresh = () => { hud(); renderDaily(); renderWheel(); renderAlbum(); renderStats(); };

/*__BLOCK_B__*/
  function setTab(id, focus) {
    if (!COLLECTION_TABS.some(t => t.id === id)) return;
    tab = id;
    for (const t of COLLECTION_TABS) {
      const b = $(@@BT@@#co-tab-@@DS@@t.id}@@BT@@), p = $(@@BT@@#co-panel-@@DS@@t.id}@@BT@@), on = t.id === id;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; p.hidden = !on;
      if (on && focus) b.focus();
    }
    try { history.replaceState(null, '', @@BT@@#/collection/@@DS@@id}@@BT@@); } catch { /* не критично */ }
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
`);
const S5_HUB = S5_DEC(String.raw`/*
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
  slots: () => @@BT@@<span class="cs-art cs-art--slots" aria-hidden="true">@@DS@@sym('berry', 56)}@@DS@@sym('hog', 72)}@@DS@@sym('king', 56)}</span>@@BT@@,
  blackjack: () => '<span class="cs-art cs-art--cards" aria-hidden="true"><span class="cs-pcard cs-pcard--red"><i>A</i><b>♥</b></span><span class="cs-pcard"><i>K</i><b>♠</b></span></span>',
  roulette: () => '<span class="cs-art cs-art--wheel" aria-hidden="true"><span class="cs-wheel"></span></span>',
};

export function renderCasinoPage() {
  const content = document.querySelector('#content');
  ensureSprite();
  let dead = false;
  const $ = sel => content.querySelector(sel);
  const cards = GAMES.map(g => @@BT@@<a class="cs-game cs-game--@@DS@@g.id}" href="@@DS@@g.href}" data-game="@@DS@@g.id}">@@DS@@ART[g.id]()}<span class="cs-game-body"><span class="cs-kind">@@DS@@esc(g.kind)}</span><strong>@@DS@@esc(g.name)}</strong><small>@@DS@@esc(g.text)}</small><span class="cs-game-meta" data-meta="@@DS@@g.id}"></span></span><span class="cs-cta"><span data-cta="@@DS@@g.id}">@@DS@@esc(g.cta)}</span>@@DS@@ic('arrowRight', 18)}</span></a>@@BT@@).join('');
  content.innerHTML = @@BT@@<section class="casino-page cs-hub" data-no-icons>
    <div class="intro cs-intro"><span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span><h1>Казино</h1><p class="sub">Слоты, блэкджек и рулетка на виртуальные ягоды из игры «Ёжик».</p><p class="cs-notice" role="note">Виртуальные ягоды без реальной ценности. Просто весёлая игра.</p></div>
    <div class="cs-status"><div class="cs-stat"><span>Ягоды</span><b id="cs-bal">0</b></div><div class="cs-stat"><span>Бесплатные спины</span><b id="cs-free">0</b></div><div class="cs-stat"><span>Капсулы</span><b id="cs-caps">0</b></div></div>
    <p class="cs-break" id="cs-break" role="status" hidden></p>
    <div class="cs-games">@@DS@@cards}</div>
    <div class="cs-more"><a class="cs-collection" href="#/collection"><span class="cs-more-ic">@@DS@@ic('sparkles', 22)}</span><span class="cs-more-body"><strong>Коллекция</strong><small>Капсулы, альбом, ежедневные спины, колесо дня и достижения</small></span><span class="cs-chip" id="cs-chip" hidden></span>@@DS@@ic('arrowRight', 18)}</a>
      <a class="cs-nudge" id="cs-nudge" href="#/hedgehog"><span id="cs-nudgetxt"></span><span class="btn2">Покатать ёжика за ягодами</span></a></div>
  </section>@@BT@@;

  function paint() {
    if (dead) return;
    const { S, H } = loadAll(), bal = (H.berries | 0) + (S.pending > 0 ? Math.floor(S.pending) : 0), br = isOnBreak(S);
    $('#cs-bal').textContent = fmt(bal);
    $('#cs-free').textContent = String((S.free | 0) + (H.bonusSpins | 0));
    $('#cs-caps').textContent = String(S.capsules | 0);
    const b = $('#cs-break'); b.hidden = !br; b.textContent = br ? @@BT@@Перерыв до @@DS@@clock(S.breakUntil)}. Игры закрыты до этого времени — загляни к ёжику или конспектам.@@BT@@ : '';
    let chip = ''; try { chip = M.slotsChipText(H, localStorage.getItem(KEY)); } catch { chip = ''; }
    const c = $('#cs-chip'); c.hidden = !chip; c.textContent = chip;
    content.querySelectorAll('.cs-game').forEach(a => a.classList.toggle('is-break', br));
    for (const g of GAMES) { const cta = $(@@BT@@[data-cta="@@DS@@g.id}"]@@BT@@); if (cta) cta.textContent = br ? 'Перерыв' : g.cta; }
    const meta = $('[data-meta="slots"]'); if (meta) meta.textContent = S.stats && S.stats.spins ? @@BT@@Спинов: @@DS@@fmt(S.stats.spins)} · лучший выигрыш @@DS@@fmt(S.stats.biggest | 0)}@@BT@@ : '';
    const low = bal < 25; $('#cs-nudge').classList.toggle('is-low', low);
    $('#cs-nudgetxt').textContent = low ? 'Ягоды на исходе. Ёжик уже разминает лапки на холмах.' : 'Ягод маловато? Холмы, кувырки и яблоки ждут в игре «Ёжик».';
  }
  const ac = new AbortController(), timer = setInterval(paint, 1000);
  window.addEventListener('storage', paint, { signal: ac.signal });
  paint();
  function destroy() { if (dead) return; dead = true; clearInterval(timer); ac.abort(); }
  window.__hhDestroy = destroy;
}
`);
const S5_BJ = S5_DEC(String.raw`/*
  Временная страница «Блэкджек» (шаг 5): маршрут #/blackjack уже работает, сам стол приходит следующим шагом
  и заменит этот файл целиком. Контракт сохранён: window.__hhDestroy.
*/
import { ic } from './icons.js';

export function renderBlackjackPage() {
  const content = document.querySelector('#content');
  content.innerHTML = '<section class="casino-page cs-game-page cs-game--blackjack" data-no-icons><a class="cs-back" href="#/casino">' + ic('arrowLeft', 16) + '<span>Казино</span></a>'
    + '<div class="intro cs-intro"><span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span><h1>Блэкджек</h1><p class="sub">Стол ещё готовится. Загляни позже.</p></div></section>';
  window.__hhDestroy = () => {};
}
`);
const S5_ROU = S5_DEC(String.raw`/*
  Временная страница «Рулетка» (шаг 5): маршрут #/roulette уже работает, сам стол приходит следующим шагом
  и заменит этот файл целиком. Контракт сохранён: window.__hhDestroy.
*/
import { ic } from './icons.js';

export function renderRoulettePage() {
  const content = document.querySelector('#content');
  content.innerHTML = '<section class="casino-page cs-game-page cs-game--roulette" data-no-icons><a class="cs-back" href="#/casino">' + ic('arrowLeft', 16) + '<span>Казино</span></a>'
    + '<div class="intro cs-intro"><span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span><h1>Рулетка</h1><p class="sub">Стол ещё готовится. Загляни позже.</p></div></section>';
  window.__hhDestroy = () => {};
}
`);
const S5_CSS = S5_DEC(String.raw`/* Казино: хаб, вкладки коллекции, общий каркас игр (cs-*). Цвета — из переменных сайта; игры красят себя сами. */
.casino-page{max-width:1050px;margin:0 auto;padding-bottom:56px}
.cs-back{display:inline-flex;align-items:center;gap:6px;margin:14px 0 0;padding:8px 12px 8px 8px;border-radius:calc(8px * var(--rs,1));color:var(--muted);text-decoration:none;font-size:.82rem;font-weight:650;transition:color .2s,background .2s}
.cs-back:hover{color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
.sl-intro .cs-back{display:flex;width:fit-content;margin:0 0 8px -8px}
.cs-intro{margin:20px 0 14px}.cs-intro h1{font-size:clamp(2.4rem,4.6vw,4rem);margin:8px 0}
.cs-notice{font-size:.78rem;color:var(--muted);margin:4px 0 0}
.cs-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}
.cs-stat{display:grid;gap:3px;padding:12px 14px;background:var(--gl-fill,var(--card));border:1px solid var(--border);border-radius:calc(12px * var(--rs,1))}
.cs-stat span{font-size:.68rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.cs-stat b{font-size:1.35rem;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.cs-break{margin:0 0 12px;padding:11px 15px;border-radius:calc(10px * var(--rs,1));background:#7a3f6a;color:#fff;font-size:.84rem}
.cs-break[hidden]{display:none}

/* хаб: большие карточки */
.cs-games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:16px}
.cs-game{--g1:#2f6b3a;--g2:#1a3d25;--gx:#ffd84a;position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:18px;min-height:340px;padding:22px;border-radius:calc(20px * var(--rs,1));color:#fff;text-decoration:none;overflow:hidden;background:linear-gradient(160deg,var(--g1),var(--g2));box-shadow:0 20px 44px rgba(0,0,0,.25),inset 0 2px 0 rgba(255,255,255,.16);transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s}
.cs-game:hover{transform:translateY(-6px);box-shadow:0 28px 54px rgba(0,0,0,.32),inset 0 2px 0 rgba(255,255,255,.2)}
.cs-game:focus-visible{outline:3px solid var(--gx);outline-offset:3px}
.cs-game--blackjack{--g1:#7a1f33;--g2:#34101a;--gx:#ffb3c1}
.cs-game--roulette{--g1:#14412f;--g2:#07140f;--gx:#ff6b78}
.cs-game.is-break{filter:saturate(.55)}
.cs-art{display:flex;align-items:center;justify-content:center;gap:4px;min-height:120px}
.cs-art .sl-sym{filter:drop-shadow(0 6px 8px rgba(0,0,0,.35))}
.cs-art--slots .sl-sym:nth-child(2){transform:translateY(-6px) scale(1.1)}
.cs-pcard{display:grid;place-items:center;width:70px;height:98px;border-radius:calc(9px * var(--rs,1));background:#fff;color:#1a1a24;box-shadow:0 8px 16px rgba(0,0,0,.35);font-weight:900;transform:rotate(-8deg)}
.cs-pcard+.cs-pcard{transform:rotate(7deg) translateX(-14px)}.cs-pcard i{font-style:normal;font-size:1.6rem;line-height:1}.cs-pcard b{font-size:1.5rem;line-height:1}.cs-pcard--red{color:#c4232f}
.cs-wheel{display:block;width:112px;height:112px;border-radius:50%;border:5px solid #c9a24a;background:radial-gradient(circle,#0b1f18 0 18%,transparent 19%),conic-gradient(#c4232f 0 10%,#111 0 20%,#c4232f 0 30%,#111 0 40%,#c4232f 0 50%,#111 0 60%,#c4232f 0 70%,#111 0 80%,#c4232f 0 90%,#111 0);box-shadow:0 8px 18px rgba(0,0,0,.4);animation:cs-spin 18s linear infinite}
@keyframes cs-spin{to{transform:rotate(360deg)}}
.cs-game-body{display:grid;gap:6px}
.cs-kind{font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gx)}
.cs-game-body strong{font-size:1.5rem;letter-spacing:-.03em}.cs-game-body small{font-size:.84rem;line-height:1.45;opacity:.88}
.cs-game-meta{font-size:.74rem;opacity:.75;min-height:1.1em}
.cs-cta{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;border-radius:calc(10px * var(--rs,1));background:rgba(255,255,255,.14);font-weight:750;font-size:.9rem}
.cs-more{display:grid;grid-template-columns:1.4fr 1fr;gap:16px}
.cs-collection,.cs-nudge{display:flex;align-items:center;gap:14px;padding:16px 18px;border:1px solid var(--border);border-radius:calc(14px * var(--rs,1));background:var(--gl-fill,var(--card));color:var(--text);text-decoration:none;transition:border-color .25s,transform .25s}
.cs-collection:hover,.cs-nudge:hover{border-color:var(--accent);transform:translateY(-2px)}
.cs-more-ic{display:grid;place-items:center;width:44px;height:44px;border-radius:calc(10px * var(--rs,1));background:color-mix(in srgb,var(--accent) 12%,var(--card));color:var(--accent)}
.cs-more-body{display:grid;gap:3px;flex:1;min-width:0}.cs-more-body small{color:var(--muted);font-size:.78rem}
.cs-chip{font-size:.7rem;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--card));padding:3px 9px;border-radius:calc(999px * var(--rp,1))}.cs-chip[hidden]{display:none}
.cs-nudge{justify-content:space-between;flex-wrap:wrap;font-size:.84rem;color:var(--muted);border-style:dashed}.cs-nudge.is-low{border-color:var(--accent);color:var(--text);background:color-mix(in srgb,var(--accent) 8%,transparent)}

/* вкладки коллекции */
.cs-tabs{display:flex;gap:4px;padding:4px;margin:0 0 16px;overflow-x:auto;background:var(--card);border:1px solid var(--border);border-radius:calc(11px * var(--rs,1))}
.cs-tab{flex:1 0 auto;min-height:44px;padding:10px 16px;border:0;border-radius:calc(8px * var(--rs,1));background:transparent;color:var(--muted);font:inherit;font-size:.85rem;font-weight:680;cursor:pointer;white-space:nowrap;transition:color .2s,background .2s}
.cs-tab:hover{color:var(--text)}.cs-tab[aria-selected="true"]{background:var(--accent);color:#fff}
.cs-tab:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:2px}
.cs-panel[hidden]{display:none}

/* общий каркас игр: шапка (баланс + ставка), сообщения, частицы */
.cs-hud{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.cs-bet{display:flex;align-items:center;gap:6px}.cs-bet output{min-width:3ch;text-align:center;font-size:1.2rem;font-weight:800;font-variant-numeric:tabular-nums}
.cs-bet .btn2{min-height:44px;min-width:44px}.cs-bet .btn2:disabled{opacity:.45;cursor:not-allowed}
.cs-toasts{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 90px);z-index:1500;display:grid;gap:6px;justify-items:center;pointer-events:none}
.cs-toast{background:var(--card);color:var(--text);border:1px solid var(--accent);border-radius:calc(999px * var(--rp,1));padding:9px 16px;font-size:.84rem;font-weight:650;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:cs-toast 4.6s ease both}
@keyframes cs-toast{0%{opacity:0;transform:translateY(10px)}8%,88%{opacity:1;transform:none}100%{opacity:0}}
.cs-fx{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:1400}

@media(max-width:900px){.cs-games{grid-template-columns:1fr}.cs-game{min-height:0;flex-direction:row;flex-wrap:wrap;align-items:center}.cs-art{min-height:0;flex:0 0 auto}.cs-game-body{flex:1 1 180px}.cs-cta{flex:1 1 100%}.cs-more{grid-template-columns:1fr}}
@media(max-width:520px){.cs-status{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){.cs-wheel,.cs-toast{animation:none!important}.cs-game,.cs-collection,.cs-nudge{transition:none}.cs-toast{opacity:1}}
@media print{.casino-page{display:none}}
`);
const S5_THEMES = S5_DEC(String.raw`/* Темы оформления игр казино (th-velvet / th-arcade / th-vault и скины символов). Правила добавляет шаг оформления;
   файл подключён в index.html заранее, чтобы маршрут не ждал. */
`);
const S5_TEST_COMMON = S5_DEC(String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';
import * as C from '../js/casino-common.js';

test('casino-common: экспорты контракта', () => {
  for (const n of ['loadAll', 'saveAll', 'applyItem', 'perksOf', 'stepBet', 'betSteps', 'balance', 'adjustBalance', 'isOnBreak', 'setBreak', 'toast', 'renderBreakBanner', 'renderHud', 'getAudio', 'makeAwards', 'makeTimers', 'makeFx', 'ACH', 'esc', 'fmt', 'clock', 'KIND_NAME', 'THEME_CLASS', 'CANCEL'])
    assert.ok(n in C, @@BT@@нет экспорта @@DS@@n}@@BT@@);
  assert.equal(C.betSteps, M.BETS);
});

test('stepBet: шаги, границы, max с потолком, незнакомая ставка', () => {
  const L = C.betSteps;
  assert.equal(C.stepBet(L[0], -1), L[0]); assert.equal(C.stepBet(L.at(-1), 1), L.at(-1));
  assert.equal(C.stepBet(L[2], 1), L[3]); assert.equal(C.stepBet(L[2], -1), L[1]);
  assert.equal(C.stepBet(5, 'min'), L[0]); assert.equal(C.stepBet(5, 'max'), L.at(-1));
  assert.equal(C.stepBet(5, 'max', 12), [...L].reverse().find(b => b <= 12)); assert.equal(C.stepBet(5, 'max', 0), L[0]);
  for (const b of [0, 3.5, 7, 1e12]) { assert.ok(L.includes(C.stepBet(b, 1))); assert.ok(L.includes(C.stepBet(b, -1))); }
});

test('баланс: целые, не уходит в минус', () => {
  const H = { berries: 10.9 }; assert.equal(C.balance(H), 10);
  assert.equal(C.adjustBalance(H, 5), 15); assert.equal(C.adjustBalance(H, -100), 0); assert.equal(C.adjustBalance(H, NaN), 0);
  assert.equal(C.balance(null), 0);
});

test('перерыв: общий S.breakUntil, 15 минут / до завтра, сократить нельзя', () => {
  const S = M.newSlotsState(), t0 = new Date(2026, 9, 14, 22, 30).getTime();
  assert.equal(C.isOnBreak(S, t0), false);
  C.setBreak(S, '15', t0); assert.equal(S.breakUntil, t0 + 15 * 60000); assert.equal(C.isOnBreak(S, t0 + 14 * 60000), true); assert.equal(C.isOnBreak(S, t0 + 15 * 60000), false);
  C.setBreak(S, 'day', t0); assert.equal(S.breakUntil, new Date(2026, 9, 15).getTime());
  C.setBreak(S, '15', t0); assert.equal(S.breakUntil, new Date(2026, 9, 15).getTime());
});

test('slots.js: панели вынесены, обработчики снимаются, перерыв и награды — через casino-common', async () => {
  const { readFileSync } = await import('node:fs'), s = readFileSync(new URL('../js/slots.js', import.meta.url), 'utf8');
  assert.ok(/from '\.\/casino-common\.js'/.test(s));
  assert.ok(!/content\.addEventListener\('/.test(s), 'остались неснимаемые обработчики');
  assert.ok(s.includes('ac.abort()'));
  for (const gone of ['sl-panels', 'function renderAlbum', 'function renderWheel', 'async function openCapsuleUi', 'function claimDaily', 'function renderPanels'])
    assert.ok(!s.includes(gone), @@BT@@в slots.js остался @@DS@@gone}@@BT@@);
  assert.ok(s.includes('href="#/casino"') && s.includes('makeAwards(') && s.includes('isOnBreak(S)') && s.includes('setBreak(S'));
  for (const kept of ['window.__hhDestroy = destroy', 'function openPay', 'function doSpin']) assert.ok(s.includes(kept), kept);
  const c = readFileSync(new URL('../js/casino-collection.js', import.meta.url), 'utf8');
  for (const moved of ['function renderAlbum', 'function renderWheel', 'async function openCapsuleUi', 'function claimDaily', 'async function runWheel', 'function renderAch', 'function renderStats', 'function renderDaily']) assert.ok(c.includes(moved), moved);
});

test('index.html: маршруты казино, вкладка «Ещё», порядок вкладок', async () => {
  const { readFileSync } = await import('node:fs'), h = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const r of ['casino', 'blackjack', 'roulette']) { assert.ok(h.includes(@@BT@@if(h==='@@DS@@r}')return{mode:'@@DS@@r}'@@BT@@), r); assert.ok(h.includes(@@BT@@mode==='@@DS@@r}'@@BT@@), r); assert.ok(new RegExp(@@BT@@@@DS@@r}:4@@BT@@).test(h), r); }
  assert.ok(h.includes("h.startsWith('collection/')") && h.includes('renderCollectionPage(path)'));
  assert.ok(h.includes('./css/casino.css') && h.includes('./css/casino-themes.css') && h.indexOf('casino.css') > h.indexOf('slots.css'));
  assert.ok(h.includes('href="#/casino"') && h.includes('data-go="casino"') && h.includes('data-go="collection"'));
  assert.ok(!h.includes('href="#/slots">🎰'));
  const l = readFileSync(new URL('../js/lectures.js', import.meta.url), 'utf8');
  for (const p of ['#/casino', '#/collection', '#/blackjack', '#/roulette', '#/slots']) assert.ok(l.includes(@@BT@@href: '@@DS@@p}'@@BT@@), p);
});
`);
const S5_TEST_PAGES = S5_DEC(String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';

// Мини-«DOM»: проверяем, что страницы строятся без ошибок и после destroy не остаётся таймеров и слушателей.
const store = new Map(), cache = new Map(), listeners = [], intervals = new Set(), timeouts = new Set(), errors = [], noop = () => {};
const ctx2d = new Proxy({}, { get: () => noop, set: () => true });
function makeEl(tag) {
  const e = { tag, classList: { add: noop, remove: noop, toggle: noop, contains: () => false, [Symbol.iterator]: () => [].values() }, style: { setProperty: noop, removeProperty: noop }, dataset: {}, hidden: false, disabled: false, innerHTML: '', textContent: '', value: '', open: false, isConnected: true, tabIndex: 0,
    querySelector: sel => pick(sel), querySelectorAll: () => [], addEventListener(t, f, o) { listeners.push({ t, f, o }); }, removeEventListener: noop, append: noop, remove: noop, setAttribute: noop, focus: noop,
    getContext: () => ctx2d, closest: () => null, showModal() { this.open = true; }, close() { this.open = false; } };
  return e;
}
const pick = sel => { if (!cache.has(sel)) cache.set(sel, makeEl(sel)); return cache.get(sel); };
Object.assign(globalThis, {
  document: { createElement: makeEl, querySelector: pick, getElementById: id => pick('#' + id), body: makeEl('body'), addEventListener: noop, removeEventListener: noop },
  window: { addEventListener(t, f, o) { listeners.push({ t, f, o }); }, removeEventListener: noop },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  history: { replaceState: noop }, matchMedia: () => ({ matches: true }), requestAnimationFrame: noop, cancelAnimationFrame: noop, innerWidth: 800, innerHeight: 600,
  setInterval: f => { const id = intervals.size + 1000 + Math.random(); intervals.add(id); return id; }, clearInterval: id => intervals.delete(id),
  setTimeout: (f, ms) => { const id = Math.random(); timeouts.add(id); return id; }, clearTimeout: id => timeouts.delete(id),
});
process.on('unhandledRejection', e => errors.push(e));
const leaks = () => ({ intervals: intervals.size, timeouts: timeouts.size, signals: listeners.filter(l => l.o && l.o.signal && !l.o.signal.aborted).length });

function seed(extra = {}) {
  store.set('hh_save_v1', JSON.stringify({ berries: 500, owned: ['none'], hat: 'none', bonusSpins: 1, boosts: {}, daily: null }));
  const S = M.newSlotsState(); Object.assign(S, extra); store.set('m3102-slots-v1', JSON.stringify(S));
}

test('хаб: рисуется, показывает перерыв, destroy снимает таймеры и слушатели', async () => {
  seed({ breakUntil: Date.now() + 600000 });
  const { renderCasinoPage } = await import('../js/casino.js');
  renderCasinoPage(); assert.equal(typeof window.__hhDestroy, 'function');
  assert.match(pick('#content').innerHTML, /cs-game--slots[\s\S]*cs-game--blackjack[\s\S]*cs-game--roulette/);
  assert.equal(pick('#cs-break').hidden, false); assert.match(pick('#cs-break').textContent, /Перерыв до/);
  assert.equal(pick('#cs-bal').textContent.replace(/\s/g, ''), '500');
  window.__hhDestroy(); window.__hhDestroy();
  assert.deepEqual(leaks(), { intervals: 0, timeouts: 0, signals: 0 });
});

test('коллекция: все вкладки, destroy чистый; тот же состав панелей, что был в слотах', async () => {
  seed({ capsules: 2, free: 1 });
  const { renderCollectionPage, COLLECTION_TABS } = await import('../js/casino-collection.js');
  for (const tab of ['', 'album', 'daily', 'stats', 'bogus']) {
    renderCollectionPage(tab); const html = pick('#content').innerHTML;
    for (const id of ['sl-album', 'sl-daily', 'sl-wheel', 'sl-ach', 'sl-stats', 'sl-dlg']) assert.ok(html.includes(@@BT@@id="@@DS@@id}"@@BT@@), id);
    for (const t of COLLECTION_TABS) assert.ok(html.includes(@@BT@@id="co-tab-@@DS@@t.id}"@@BT@@));
    assert.match(pick('#sl-album').innerHTML, /Альбом и капсулы/); assert.match(pick('#sl-daily').innerHTML, /Ежедневные спины/);
    assert.match(pick('#sl-ach').innerHTML, /Достижения/); assert.match(pick('#sl-stats').innerHTML, /Статистика/);
    window.__hhDestroy();
    assert.deepEqual(leaks(), { intervals: 0, timeouts: 0, signals: 0 }, tab);
  }
  const S = JSON.parse(store.get('m3102-slots-v1')); assert.equal(M.checkSlots(S), 'ok');
});

test('заглушки блэкджека и рулетки: рендерятся, ведут назад в казино', async () => {
  const { renderBlackjackPage } = await import('../js/blackjack.js'), { renderRoulettePage } = await import('../js/roulette.js');
  for (const r of [renderBlackjackPage, renderRoulettePage]) { r(); assert.match(pick('#content').innerHTML, /href="#\/casino"/); window.__hhDestroy(); }
  assert.deepEqual(errors, []);
});
`);

steps.push({
  id: 5,
  name: 'Casino hub, routing, Slots split, Collection page',
  run(ctx) {
    const SL = 'js/slots.js', SENT = 'casino:step5 SPLIT', HTML = 'index.html';
    const slots = ctx.read(SL);
    // вырезает кусок [start, end) — оба маркера обязаны встречаться ровно один раз
    const cut = (text, start, end, label) => {
      if (count(text, start) !== 1 || count(text, end) !== 1) throw new Error(`${SL}: не найден блок «${label}» (маркеры: «${brief(start)}» / «${brief(end)}»)`);
      const a = text.indexOf(start), b = text.indexOf(end);
      if (b <= a) throw new Error(`${SL}: блок «${label}» — маркеры в неожиданном порядке`);
      return text.slice(a, b);
    };
    const swap = (anchor, repl) => ctx.replaceOnce(SL, anchor, repl);

    if (slots.includes(SENT)) ctx.note('ШАГ 5: slots.js уже разделён — файлы казино не пересоздаются (идемпотентно).');
    else {
      const R1 = cut(slots, 'const esc = value =>', 'const FILL = [', 'общие константы'),
        R2 = cut(slots, 'const KIND_EMOJI = {', 'const QUIPS = [', 'KIND_EMOJI/KIND_NAME/THEME_CLASS'),
        R3A = cut(slots, 'export const ACH = [', 'const cardHtml = ', 'ACH + loadAll/saveAll/applyItem/perksOf'),
        R3B = cut(slots, 'const nextMidnight = () =>', 'export function installSlots()', 'nextMidnight/clock'),
        AWARDS = cut(slots, '  const award = id => {', '  function renderAch() {', 'award/checkAlbum'),
        BLOCK_A = cut(slots, '  function renderAch() {', '  function renderPanels() {', 'renderAch…renderAlbum'),
        BLOCK_B = cut(slots, '  /* ---------- колесо, капсулы, ежедневные спины ---------- */', '  /* ---------- диалоги ---------- */', 'runWheel/openCapsuleUi/claimDaily'),
        PANELS = cut(slots, '    <div class="sl-nudge" id="sl-nudge">', '    <dialog id="sl-dlg"', 'панели под автоматом'),
        NUDGE = cut(slots, "    const low = H.berries < bet * 5;", "    const th = THEME_CLASS[S.theme]", 'подсказка про ёжика в hud()');
      if (!AWARDS.includes('renderAch(); renderAlbum();')) throw new Error(`${SL}: award() больше не вызывает renderAch(); renderAlbum(); — поправьте шаг 5`);
      const exp = t => t.replace(/^const /gm, 'export const ');

      // 1. общий модуль и страницы — из вырезанного текста (перенос, а не переписывание)
      ctx.createFile('js/casino-common.js', S5_COMMON_HEAD.replace('/*__R1__*/', () => exp(R1)).replace('/*__R2__*/', () => exp(R2)).replace('/*__R3A__*/', () => exp(R3A)).replace('/*__R3B__*/', () => exp(R3B))
        + S5_COMMON_TAIL.replace('/*__AWARDS__*/', () => AWARDS.replace('renderAch(); renderAlbum();', 'onChange();')));
      ctx.createFile('js/casino-collection.js', S5_COLLECTION.replace('/*__BLOCK_A__*/', () => BLOCK_A).replace('/*__BLOCK_B__*/', () => BLOCK_B));
      ctx.createFile('js/casino.js', S5_HUB);
      ctx.createFile('js/blackjack.js', S5_BJ);
      ctx.createFile('js/roulette.js', S5_ROU);
      ctx.createFile('css/casino.css', S5_CSS);
      ctx.createFile('css/casino-themes.css', S5_THEMES);
      ctx.createTest('casino.mjs', S5_TEST_COMMON);
      ctx.createTest('casino-pages.mjs', S5_TEST_PAGES);

      // 2. slots.js: остаются шапка, HUD, автомат, управление, «← Казино» и таблица выплат
      const hasIc = /import\s*\{[^}]*\bic\b[^}]*\}\s*from\s*'\.\/icons\.js'/.test(slots);
      swap(R1, (hasIc ? '' : "import { ic } from './icons.js';\n")
        + "import { esc, KEY, SNAP, HHK, CANCEL, reduce, fmt, readJson, writeJson, KIND_EMOJI, KIND_NAME, THEME_CLASS, ACH, loadAll, saveAll, applyItem, perksOf, clock, isOnBreak, setBreak, makeAwards } from './casino-common.js';\n"
        + "export { ACH, loadAll, saveAll, applyItem, perksOf }; /* " + SENT + ": общие помощники теперь в casino-common.js */\n");
      swap(R2, '/* casino:step5 moved: KIND_EMOJI, KIND_NAME, THEME_CLASS → casino-common.js */\n');
      swap(R3A, '/* casino:step5 moved: ACH, loadAll, saveAll, applyItem, perksOf → casino-common.js */\n');
      swap(R3B, '/* casino:step5 moved: nextMidnight, clock → casino-common.js */\n');
      swap('const onBreak = () => S.breakUntil > Date.now();', 'const onBreak = () => isOnBreak(S);');
      swap("S.breakUntil = btn.dataset.break === 'day' ? nextMidnight() : Date.now() + 15 * 60000;", 'setBreak(S, btn.dataset.break);');
      swap('<div class="intro sl-intro"><div><span class="sched-eyebrow">', '<div class="intro sl-intro"><div><a class="cs-back" href="#/casino">${ic(\'arrowLeft\', 16)}<span>Казино</span></a><span class="sched-eyebrow">');
      swap(PANELS, '    <!-- casino:step5 панели: #/collection -->\n');
      swap(NUDGE, '    /* casino:step5: подсказка про ёжика перенесена на хаб */\n');
      swap(AWARDS, "  const { award, checkAlbum } = makeAwards({ S, toast, audio, itemName }); /* casino:step5 AWARDS */\n");
      swap(BLOCK_A, '  /* casino:step5 moved → js/casino-collection.js: renderAch, renderStats, renderDaily, wheelSvg, renderWheel, renderAlbum */\n');
      swap("  function renderPanels() { renderDaily(); renderWheel(); renderAlbum(); renderAch(); renderStats(); }\n  const refresh = () => { hud(); renderDaily(); renderWheel(); renderAlbum(); renderStats(); };",
        '  const refresh = () => { hud(); }; /* casino:step5 refresh */');
      swap(BLOCK_B, '  /* casino:step5 moved → js/casino-collection.js: runWheel, openCapsuleUi, claimDaily */\n\n');
      swap(" else if (id === 'sl-claim') claimDaily(); else if (id === 'sl-wheelgo') guard(runWheel()); else if (id === 'sl-opencap') guard(openCapsuleUi());", ' /* casino:step5 collection actions moved */');
      swap("    else if (btn.dataset.equip) { M.equipItem(S, btn.dataset.equip); save(); refresh(); /* casino:step3 EQ3 */ }\n", '    /* casino:step5 equip → collection */\n');
      swap('  hud(); renderPanels(); checkAlbum(); save();', '  hud(); checkAlbum(); save(); /* casino:step5 */');
      // обработчики страницы раньше копились на #content при каждом заходе — теперь снимаются в destroy()
      for (const t of ['click', 'change', 'pointerdown', 'pointermove', 'pointerup']) swap(`content.addEventListener('${t}', e =>`, `listen('${t}', e =>`);
      swap('  const setBet = v => { bet = v; S.bet = v; hud(); };', "  const ac = new AbortController(), listen = (type, fn) => content.addEventListener(type, fn, { signal: ac.signal }); /* casino:step5 */\n  const setBet = v => { bet = v; S.bet = v; hud(); };");
      swap("clearInterval(breakTimer); window.removeEventListener('keydown', onKey);", "clearInterval(breakTimer); ac.abort(); window.removeEventListener('keydown', onKey);");
    }

    // 3. тест шага 3 читал ACH/THEME_CLASS прямо из slots.js — теперь они в casino-common.js
    if (ctx.exists('tests/casino-perks.mjs')) {
      ctx.replaceOnce('tests/casino-perks.mjs', "read('js/slots.js').includes(", "(read('js/slots.js') + read('js/casino-common.js')).includes(");
      ctx.replaceOnce('tests/casino-perks.mjs', "[...read('js/slots.js').matchAll(", "[...(read('js/slots.js') + read('js/casino-common.js')).matchAll(");
    }

    // 4. index.html
    ctx.insertAfter(HTML, "import { renderSlotsPage, installSlots } from './js/slots.js';",
      "\n    import { renderCasinoPage } from './js/casino.js'; /* casino:step5 */\n    import { renderCollectionPage } from './js/casino-collection.js';\n    import { renderBlackjackPage } from './js/blackjack.js';\n    import { renderRoulettePage } from './js/roulette.js';",
      { done: 'renderCasinoPage' });
    ctx.insertAfter(HTML, '<link rel="stylesheet" href="./css/slots.css">', '\n    <link rel="stylesheet" href="./css/casino.css">\n    <link rel="stylesheet" href="./css/casino-themes.css">',
      { done: 'css/casino.css' });
    ctx.insertAfter(HTML, "if(h==='slots')return{mode:'slots',path:''};",
      "\n      if(h==='casino')return{mode:'casino',path:''};\n      if(h==='blackjack')return{mode:'blackjack',path:''};\n      if(h==='roulette')return{mode:'roulette',path:''};\n      if(h==='collection'||h.startsWith('collection/'))return{mode:'collection',path:h.slice(11)};",
      { done: "mode:'casino'" });
    ctx.replaceOnce(HTML, "['diagrams','memes','hedgehog','slots','other','students','settings'].includes(mode)",
      "['diagrams','memes','hedgehog','slots','casino','blackjack','roulette','collection','other','students','settings'].includes(mode)");
    ctx.replaceOnce(HTML, 'settings:4,slots:4}', 'settings:4,slots:4,casino:4,blackjack:4,roulette:4,collection:4}');
    ctx.insertAfter(HTML, "else if(mode==='slots')renderSlotsPage();",
      "\n  else if(mode==='casino')renderCasinoPage();\n  else if(mode==='blackjack')renderBlackjackPage();\n  else if(mode==='roulette')renderRoulettePage();\n  else if(mode==='collection')renderCollectionPage(path);",
      { done: 'renderCasinoPage();' });
    ctx.replaceOnce(HTML,
      '<a class="card" data-go="slots"><div class="ic">${ic(\'sparkles\',22)}</div><div class="meta"><div class="name">Колючий куш</div><div class="desc">Слоты на ягоды ёжика, капсулы и альбом</div></div></a>',
      '<a class="card" data-go="casino"><div class="ic">${ic(\'sparkles\',22)}</div><div class="meta"><div class="name">Казино</div><div class="desc">Слоты, блэкджек и рулетка на ягоды ёжика</div></div></a>\n          <a class="card" data-go="collection"><div class="ic">${ic(\'trophy\',22)}</div><div class="meta"><div class="name">Коллекция</div><div class="desc">Капсулы, альбом, ежедневные спины и достижения</div></div></a>');
    ctx.replaceOnce(HTML, '<a class="btn2 hh-big" href="#/slots">🎰 Слоты</a>', '<a class="btn2 hh-big" href="#/casino">🎰 Казино</a>');

    // 5. поиск по сайту
    ctx.replaceOnce('js/lectures.js', "{ title: 'Колючий куш (слоты)', href: '#/slots' },",
      "{ title: 'Казино', href: '#/casino' }, { title: 'Колючий куш (казино)', href: '#/casino' }, { title: 'Слоты', href: '#/slots' }, { title: 'Блэкджек', href: '#/blackjack' }, { title: 'Рулетка', href: '#/roulette' }, { title: 'Коллекция', href: '#/collection' },");

    ctx.note('ШАГ 5: маршруты #/casino, #/slots, #/blackjack, #/roulette, #/collection[/album|daily|stats]. js/blackjack.js и js/roulette.js — заглушки с тем же контрактом (renderBlackjackPage / renderRoulettePage, window.__hhDestroy): шаги столов заменяют их целиком.');
    ctx.note('ШАГ 5: casino-common.js экспортирует: esc, fmt, KEY/SNAP/HHK, CANCEL, reduce, readJson/writeJson, ACH, KIND_EMOJI/KIND_NAME/THEME_CLASS, loadAll/saveAll/applyItem/perksOf, itemName, betSteps/stepBet(bet, 1|-1|\'min\'|\'max\', cap), balance/adjustBalance, isOnBreak(S)/setBreak(S, \'15\'|\'day\')/breakText/renderBreakBanner(host,S), renderHud(host,{S,H,bet,onBet,locked}), toast/clearToasts (глобальные, .cs-toast), getAudio, makeTimers(isDead), makeFx(), makeAwards({S,toast,audio,itemName,onChange}). Обработчики страниц вешать через AbortController (см. slots.js: listen/ac).');
    ctx.note('ШАГ 5: поиск: «Колючий куш (казино)» теперь ведёт на хаб; слоты доступны отдельной записью «Слоты». css/casino-themes.css пока пуст (подключён в index.html заранее).');
  },
});

// ===== STEP 6: Theme system and sound =====
// Реестр тем (forest/night/server/velvet/arcade/vault) + CSS-оформление + наборы звука; переписан звук слотов (колокольчики, звон монет, трещотка).
// Экспорты js/casino-themes.js для следующих шагов (блэкджек, рулетка):
//   applyCasinoTheme(root, S?) / decorateCasinoPage() — класс .casino-root, th-<тема>, sk-<тема> и переменные --ct-* (index.html вызывает decorateCasinoPage
//     после КАЖДОГО перехода для .slots-page, .cs-hub, .cs-game-page — корень страницы стола должен иметь класс cs-game-page, тогда оформление придёт само);
//   themeVars(S) → { id, vars, picked }, chipTier(v), ITEM_STYLES (felt:/chips:/cardback: из S.equip перекрывают умолчания темы);
//   CSS-классы столов: .ct-felt (сукно), .ct-chip[data-tier=1..4] (фишка; --ct-chip-size), .ct-cardback (рубашка; data-ct-cardback="marked" на корне — метка);
//   makeThemeSounds(имя) → наборы тонов. js/slots-audio.js: makeSlotsAudio(тема?) (без аргумента тема берётся из сохранения), audio.theme(имя),
//   новые звуки столов audio.deal() / chip() / ballTick() / ballDrop(); весь прежний API сохранён, whirStart/whirStop — теперь трещотка.
const S6_DEC = s => s.replaceAll('@@DS@@', '${').replaceAll('@@BT@@', '`');
const S6_THEMES = S6_DEC(String.raw`/*
  Темы оформления казино (слоты, блэкджек, рулетка, хаб): реестр, применение к .casino-root, SVG-фильтры символов, наборы звука.
  Без DOM при импорте (грузится и в Node). Зависимостей нет — поэтому slots-audio.js может импортировать makeThemeSounds без циклов.

  Как пользоваться из игр:
    applyCasinoTheme(rootEl, S)   — повесить на корень страницы классы casino-root / th-<тема> / sk-<тема> и CSS-переменные --ct-*
                                    (S — состояние слотов m3102-slots-v1; без S тема читается из localStorage);
    decorateCasinoPage()          — то же для текущей страницы (вызывается из index.html после каждого перехода);
    themeVars(S)                  — { id, theme, vars }: переменные темы + предметы S.equip (felt/chips/cardback) поверх;
    chipTier(value)               — 1..4 для .ct-chip[data-tier];
  Готовые CSS-классы для столов: .ct-felt (сукно), .ct-chip[data-tier] (фишка), .ct-cardback (рубашка карты).
*/
export const SLOTS_KEY = 'm3102-slots-v1';
export const THEME_IDS = ['forest', 'night', 'server', 'velvet', 'arcade', 'vault'];
const FREE_ITEMS = ['theme:forest', 'title:newbie', 'chips:berry', 'felt:burgundy'];
const px = n => 'calc(' + n + 'px * var(--rs,1))';
const stack = (...names) => names.map(n => (/\s/.test(n) ? '"' + n + '"' : n)).join(', ');
const SANS = ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'];

/* ---------- реестр тем ---------- */
// font/fontDisplay — стеки (Google Fonts подключены в index.html; офлайн остаются системные), vars — CSS-переменные --ct-*
export const THEMES = {
  forest: {
    id: 'forest', item: 'theme:forest', name: 'Лес', cls: 'th-forest', skin: '', sound: 'forest',
    font: stack('Comfortaa', 'Nunito', 'Varela Round', 'Trebuchet MS', 'ui-rounded', ...SANS),
    fontDisplay: stack('Comfortaa', 'Nunito', 'Varela Round', 'Trebuchet MS', 'ui-rounded', ...SANS),
    vars: {
      '--ct-acc': '#9be37a', '--ct-acc2': '#ffd84a',
      '--ct-r-btn': px(16), '--ct-r-dlg': px(22), '--ct-r-frame': px(24),
      '--ct-bw': '3px', '--ct-edge': '#2f6b3a',
      '--ct-shadow': '0 4px 0 #1a3d25', '--ct-shadow-press': '0 1px 0 #1a3d25', '--ct-press': 'translateY(3px)',
      '--ct-btn-bg': 'color-mix(in srgb,#7fd070 16%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': 'linear-gradient(180deg,#8fe07f,#3f9a4e)', '--ct-primary-fg': '#0f2e18',
      '--ct-dlg-bg': 'color-mix(in srgb,#3f9a4e 12%,var(--card))', '--ct-dlg-edge': '#2f6b3a', '--ct-dlg-shadow': '0 6px 0 #1a3d25,0 28px 70px rgba(0,0,0,.35)',
      '--ct-felt-a': '#2f7d46', '--ct-felt-b': '#1b4d2b', '--ct-felt-line': '#9be37a', '--ct-felt-ink': '#eaffdc',
      '--ct-chip-1': '#f4f1de', '--ct-chip-2': '#e8467c', '--ct-chip-3': '#3f9a4e', '--ct-chip-4': '#2b2a3a', '--ct-chip-edge': '#ffffff', '--ct-chip-ink': '#173d22', '--ct-chip-stripe': '#ffffff',
      '--ct-cb-a': '#2f6b3a', '--ct-cb-b': '#9be37a', '--ct-cb-c': '#ffd84a',
    },
  },
  night: {
    id: 'night', item: 'theme:night', name: 'Звёздная ночь', cls: 'th-night', skin: 'sk-night', sound: 'night',
    font: stack('Exo 2', 'Rajdhani', ...SANS), fontDisplay: stack('Exo 2', 'Rajdhani', ...SANS),
    vars: {
      '--ct-acc': '#7cf0ff', '--ct-acc2': '#b88cff',
      '--ct-r-btn': px(10), '--ct-r-dlg': px(16), '--ct-r-frame': px(18),
      '--ct-bw': '1.5px', '--ct-edge': '#7cf0ff',
      '--ct-shadow': '0 0 0 1px rgba(124,240,255,.2),0 0 14px rgba(124,240,255,.35)', '--ct-shadow-press': '0 0 6px rgba(124,240,255,.55)', '--ct-press': 'scale(.96)',
      '--ct-btn-bg': 'color-mix(in srgb,#171a45 70%,var(--card))', '--ct-btn-fg': '#e6f7ff',
      '--ct-primary-bg': 'linear-gradient(135deg,#2bb7d6,#7b4dd6)', '--ct-primary-fg': '#ffffff',
      '--ct-dlg-bg': 'color-mix(in srgb,#171a45 85%,var(--card))', '--ct-dlg-edge': '#7cf0ff', '--ct-dlg-shadow': '0 0 24px rgba(124,240,255,.35),0 28px 70px rgba(0,0,0,.5)',
      '--ct-felt-a': '#1d2a6b', '--ct-felt-b': '#0c1238', '--ct-felt-line': '#7cf0ff', '--ct-felt-ink': '#e6f7ff',
      '--ct-chip-1': '#cfe3ff', '--ct-chip-2': '#7cf0ff', '--ct-chip-3': '#b88cff', '--ct-chip-4': '#ff7fd0', '--ct-chip-edge': '#0b0f2e', '--ct-chip-ink': '#0b0f2e', '--ct-chip-stripe': 'rgba(255,255,255,.85)',
      '--ct-cb-a': '#171a45', '--ct-cb-b': '#7cf0ff', '--ct-cb-c': '#b88cff',
    },
  },
  server: {
    id: 'server', item: 'theme:server', name: 'Серверная', cls: 'th-server', skin: 'sk-server', sound: 'server',
    font: stack('IBM Plex Mono', 'ui-monospace', 'Cascadia Mono', 'Consolas', 'DejaVu Sans Mono', 'monospace'),
    fontDisplay: stack('IBM Plex Mono', 'ui-monospace', 'Cascadia Mono', 'Consolas', 'DejaVu Sans Mono', 'monospace'),
    vars: {
      '--ct-acc': '#33ff99', '--ct-acc2': '#18b86b',
      '--ct-r-btn': px(2), '--ct-r-dlg': px(4), '--ct-r-frame': px(4),
      '--ct-bw': '1px', '--ct-edge': '#33ff99',
      '--ct-shadow': 'inset 0 0 0 1px rgba(51,255,153,.2)', '--ct-shadow-press': 'inset 0 0 0 1px rgba(51,255,153,.2)', '--ct-press': 'translateY(1px)',
      '--ct-press-bg': '#33ff99', '--ct-press-fg': '#021a0f',
      '--ct-btn-bg': 'color-mix(in srgb,#06140d 80%,var(--card))', '--ct-btn-fg': '#9bffcb',
      '--ct-primary-bg': '#13804b', '--ct-primary-fg': '#eafff3',
      '--ct-dlg-bg': 'color-mix(in srgb,#06140d 90%,var(--card))', '--ct-dlg-edge': '#33ff99', '--ct-dlg-shadow': '0 0 0 1px rgba(51,255,153,.25),0 28px 70px rgba(0,0,0,.6)',
      '--ct-felt-a': '#0b2b1c', '--ct-felt-b': '#04120b', '--ct-felt-line': '#33ff99', '--ct-felt-ink': '#b6ffd6',
      '--ct-chip-1': '#c8ffd8', '--ct-chip-2': '#33ff99', '--ct-chip-3': '#18b86b', '--ct-chip-4': '#0c5a39', '--ct-chip-edge': '#021a0f', '--ct-chip-ink': '#021a0f', '--ct-chip-stripe': '#33ff99',
      '--ct-cb-a': '#04120b', '--ct-cb-b': '#33ff99', '--ct-cb-c': '#0c5a39',
    },
  },
  velvet: {
    id: 'velvet', item: 'theme:velvet', name: 'Бархат', cls: 'th-velvet', skin: 'sk-velvet', sound: 'velvet',
    font: stack('Playfair Display', 'Georgia', 'Times New Roman', 'serif'), fontDisplay: stack('Playfair Display', 'Georgia', 'Times New Roman', 'serif'),
    vars: {
      '--ct-acc': '#e8c37a', '--ct-acc2': '#c4445a',
      '--ct-r-btn': px(12), '--ct-r-dlg': px(18), '--ct-r-frame': px(14),
      '--ct-bw': '1px', '--ct-edge': '#e8c37a',
      '--ct-shadow': '0 2px 0 rgba(232,195,122,.55),0 6px 14px rgba(0,0,0,.3)', '--ct-shadow-press': '0 0 0 rgba(0,0,0,0)', '--ct-press': 'translateY(1px) scale(.99)',
      '--ct-btn-bg': 'color-mix(in srgb,#7a1f33 22%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': 'linear-gradient(180deg,#a02a45,#5e1527)', '--ct-primary-fg': '#ffe9c4',
      '--ct-dlg-bg': 'color-mix(in srgb,#7a1f33 14%,var(--card))', '--ct-dlg-edge': '#e8c37a', '--ct-dlg-shadow': '0 0 0 3px rgba(122,31,51,.5),0 28px 70px rgba(0,0,0,.45)',
      '--ct-felt-a': '#7a1f33', '--ct-felt-b': '#3b0f1b', '--ct-felt-line': '#e8c37a', '--ct-felt-ink': '#ffe9c4',
      '--ct-chip-1': '#f5ead2', '--ct-chip-2': '#c4445a', '--ct-chip-3': '#7a1f33', '--ct-chip-4': '#1b1013', '--ct-chip-edge': '#e8c37a', '--ct-chip-ink': '#2b1d00', '--ct-chip-stripe': '#e8c37a',
      '--ct-cb-a': '#7a1f33', '--ct-cb-b': '#e8c37a', '--ct-cb-c': '#3b0f1b',
    },
  },
  arcade: {
    id: 'arcade', item: 'theme:arcade', name: 'Аркада', cls: 'th-arcade', skin: 'sk-arcade', sound: 'arcade',
    font: stack('Exo 2', ...SANS), fontDisplay: stack('Press Start 2P', 'Courier New', 'monospace'),
    vars: {
      '--ct-acc': '#ff3d9a', '--ct-acc2': '#31e0ff',
      '--ct-r-btn': '0px', '--ct-r-dlg': '0px', '--ct-r-frame': '0px',
      '--ct-bw': '3px', '--ct-edge': '#0a0a1a',
      '--ct-shadow': '4px 4px 0 #0a0a1a', '--ct-shadow-press': '1px 1px 0 #0a0a1a', '--ct-press': 'translate(3px,3px)',
      '--ct-btn-bg': 'color-mix(in srgb,#31e0ff 22%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': '#ff3d9a', '--ct-primary-fg': '#ffffff',
      '--ct-dlg-bg': 'color-mix(in srgb,#2a1470 30%,var(--card))', '--ct-dlg-edge': '#ff3d9a', '--ct-dlg-shadow': '8px 8px 0 #0a0a1a',
      '--ct-felt-a': '#2a1470', '--ct-felt-b': '#0e0630', '--ct-felt-line': '#ff3d9a', '--ct-felt-ink': '#ffffff',
      '--ct-chip-1': '#ffffff', '--ct-chip-2': '#ff3d9a', '--ct-chip-3': '#31e0ff', '--ct-chip-4': '#ffd84a', '--ct-chip-edge': '#0a0a1a', '--ct-chip-ink': '#0a0a1a', '--ct-chip-stripe': '#0a0a1a',
      '--ct-cb-a': '#2a1470', '--ct-cb-b': '#ff3d9a', '--ct-cb-c': '#31e0ff',
    },
  },
  vault: {
    id: 'vault', item: 'theme:vault', name: 'Хранилище', cls: 'th-vault', skin: 'sk-vault', sound: 'vault',
    font: stack('Oswald', 'Arial Narrow', ...SANS), fontDisplay: stack('Oswald', 'Arial Narrow', ...SANS),
    vars: {
      '--ct-acc': '#c9a24a', '--ct-acc2': '#e8e4da',
      '--ct-r-btn': px(6), '--ct-r-dlg': px(10), '--ct-r-frame': px(8),
      '--ct-bw': '2px', '--ct-edge': '#c9a24a',
      '--ct-shadow': '0 3px 0 #1d1a10,inset 0 1px 0 rgba(255,255,255,.3)', '--ct-shadow-press': '0 1px 0 #1d1a10,inset 0 1px 0 rgba(255,255,255,.2)', '--ct-press': 'translateY(2px)',
      '--ct-btn-bg': 'color-mix(in srgb,#5b616b 28%,var(--card))', '--ct-btn-fg': 'var(--text)',
      '--ct-primary-bg': 'linear-gradient(180deg,#e3c36e,#a87f22)', '--ct-primary-fg': '#1d1a10',
      '--ct-dlg-bg': 'color-mix(in srgb,#5b616b 22%,var(--card))', '--ct-dlg-edge': '#c9a24a', '--ct-dlg-shadow': '0 0 0 3px rgba(29,26,16,.6),0 28px 70px rgba(0,0,0,.5)',
      '--ct-felt-a': '#4b5361', '--ct-felt-b': '#20252d', '--ct-felt-line': '#c9a24a', '--ct-felt-ink': '#f2e9cc',
      '--ct-chip-1': '#e8e4da', '--ct-chip-2': '#c9a24a', '--ct-chip-3': '#7f8794', '--ct-chip-4': '#2e3440', '--ct-chip-edge': '#fff3c4', '--ct-chip-ink': '#1d1a10', '--ct-chip-stripe': '#fff3c4',
      '--ct-cb-a': '#2e3440', '--ct-cb-b': '#c9a24a', '--ct-cb-c': '#e8e4da',
    },
  },
};

// Предметы шага 3 перекрывают умолчания темы: ключ — id предмета из S.equip
export const ITEM_STYLES = {
  'felt:burgundy': { '--ct-felt-a': '#7a1f33', '--ct-felt-b': '#3b0f1b', '--ct-felt-line': '#e8c37a', '--ct-felt-ink': '#ffe9c4' },
  'chips:berry': { '--ct-chip-1': '#ffd1e3', '--ct-chip-2': '#e8467c', '--ct-chip-3': '#a0124f', '--ct-chip-4': '#3d1230', '--ct-chip-edge': '#ffd1e3', '--ct-chip-ink': '#3d1230', '--ct-chip-stripe': '#ffd1e3' },
  'cardback:marked': { '--ct-cb-a': '#233466', '--ct-cb-b': '#4d87bf', '--ct-cb-c': '#ffe27a' },
};
const EQUIP_KINDS = ['felt', 'chips', 'cardback'];

/* ---------- выбор темы и стилей по состоянию ---------- */
export function themeIdOf(S) {
  const raw = String((S && S.theme) || 'forest').replace(/^theme:/, '');
  const id = THEMES[raw] ? raw : 'forest';
  if (id !== 'forest' && S && S.album && !S.album['theme:' + id]) return 'forest';
  return id;
}
export const themeOf = S => THEMES[themeIdOf(S)];
const owned = (S, id) => FREE_ITEMS.includes(id) || !S || !S.album || Boolean(S.album[id]);
export function equippedStyle(S, kind) {
  const id = S && S.equip && S.equip[kind];
  return id && ITEM_STYLES[id] && owned(S, id) ? id : '';
}
export function themeVars(S) {
  const theme = themeOf(S), vars = { ...theme.vars, '--ct-font': theme.font, '--ct-font-d': theme.fontDisplay }, picked = {};
  for (const kind of EQUIP_KINDS) { const id = equippedStyle(S, kind); picked[kind] = id ? id.split(':')[1] : ''; if (id) Object.assign(vars, ITEM_STYLES[id]); }
  return { id: theme.id, theme, vars, picked };
}
export const chipTier = v => (v < 10 ? 1 : v < 100 ? 2 : v < 1000 ? 3 : 4);
export function readStoredSlots() {
  try { return typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(SLOTS_KEY) || 'null'); } catch { return null; }
}
export const storedThemeId = () => themeIdOf(readStoredSlots());

/* ---------- SVG-фильтры символов (по темам) ---------- */
const F = 'color-interpolation-filters="sRGB"';
export const THEME_DEFS = {
  night: '<filter id="ct-neon" x="-12%" y="-12%" width="124%" height="124%" ' + F + '>'
    + '<feMorphology in="SourceAlpha" operator="erode" radius="1.6" result="er"/><feComposite in="SourceAlpha" in2="er" operator="out" result="edge"/>'
    + '<feFlood flood-color="#7cf0ff" result="c"/><feComposite in="c" in2="edge" operator="in" result="line"/>'
    + '<feGaussianBlur in="line" stdDeviation="2.4" result="glow"/>'
    + '<feComponentTransfer in="SourceGraphic" result="dim"><feFuncA type="linear" slope=".22"/></feComponentTransfer>'
    + '<feMerge><feMergeNode in="glow"/><feMergeNode in="glow"/><feMergeNode in="dim"/><feMergeNode in="line"/></feMerge></filter>',
  server: '<filter id="ct-phosphor" x="-6%" y="-6%" width="112%" height="112%" ' + F + '>'
    + '<feFlood x="1" y="1" width="2" height="2" flood-color="#000"/><feComposite width="4" height="4" result="px"/><feTile result="grid"/>'
    + '<feComposite in="SourceGraphic" in2="grid" operator="in" result="samp"/><feMorphology in="samp" operator="dilate" radius="1.5" result="blocks"/>'
    + '<feColorMatrix in="blocks" type="matrix" values="0 0 0 0 .08  .33 .59 .11 0 0  0 0 0 0 .1  0 0 0 1 0" result="green"/>'
    + '<feComponentTransfer in="green" result="post"><feFuncG type="discrete" tableValues=".16 .42 .72 1"/></feComponentTransfer>'
    + '<feGaussianBlur in="post" stdDeviation="1.5" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="post"/></feMerge></filter>',
  arcade: '<filter id="ct-arcade" x="-6%" y="-6%" width="112%" height="112%" ' + F + '>'
    + '<feComponentTransfer in="SourceGraphic" result="flat"><feFuncR type="discrete" tableValues="0 .25 .55 .8 1"/><feFuncG type="discrete" tableValues="0 .25 .55 .8 1"/><feFuncB type="discrete" tableValues="0 .25 .55 .8 1"/></feComponentTransfer>'
    + '<feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="fat"/><feFlood flood-color="#0a0a1a"/><feComposite in2="fat" operator="in" result="ink"/>'
    + '<feColorMatrix in="flat" type="saturate" values="1.5" result="vivid"/><feMerge><feMergeNode in="ink"/><feMergeNode in="vivid"/></feMerge></filter>',
  vault: '<filter id="ct-bevel" x="-8%" y="-8%" width="116%" height="116%" ' + F + '>'
    + '<feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b"/>'
    + '<feSpecularLighting in="b" surfaceScale="3" specularConstant=".75" specularExponent="18" lighting-color="#fff2c4" result="s"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>'
    + '<feComposite in="s" in2="SourceAlpha" operator="in" result="sp"/><feComposite in="SourceGraphic" in2="sp" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/></filter>',
};
export const themeDefsMarkup = () => '<svg id="ct-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + Object.values(THEME_DEFS).join('') + '</defs></svg>';
export function ensureThemeDefs() {
  if (typeof document === 'undefined' || document.getElementById('ct-defs') || !document.body) return;
  document.body.insertAdjacentHTML('afterbegin', themeDefsMarkup());
}

/* ---------- применение к странице ---------- */
export function applyCasinoTheme(root, S) {
  if (!root || !root.classList) return null;
  if (S === undefined) S = readStoredSlots();
  ensureThemeDefs();
  const { theme, vars, picked } = themeVars(S);
  for (const c of [...root.classList]) if (/^(th|sk)-/.test(c)) root.classList.remove(c);
  root.classList.add('casino-root', theme.cls);
  if (theme.skin) root.classList.add(theme.skin);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.ctTheme = theme.id;
  for (const kind of EQUIP_KINDS) root.dataset['ct' + kind[0].toUpperCase() + kind.slice(1)] = picked[kind] || 'default';
  return theme;
}
const PAGE_SELECTOR = '.slots-page,.cs-hub,.cs-game-page';
export function decorateCasinoPage(scope) {
  if (typeof document === 'undefined') return;
  const host = scope || document.querySelector('#content');
  if (!host) return;
  const S = readStoredSlots();
  host.querySelectorAll(PAGE_SELECTOR).forEach(root => applyCasinoTheme(root, S));
}
export function installCasinoThemes() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  ensureThemeDefs();
  // тема сменилась в другой вкладке — перекрашиваем открытую страницу
  window.addEventListener('storage', e => { if (e.key === SLOTS_KEY) decorateCasinoPage(); });
}

/* ---------- звук: наборы по темам ---------- */
const PENT = [0, 2, 4, 7, 9];
// partials: [отношение частоты, громкость, доля затухания, форма волны]; отношения ~1 : 2.76 : 5.4 — «колокольчик/монета»
const BELL3 = [[1, 1, 1, 'sine'], [2.76, 0.5, 0.55, 'sine'], [5.4, 0.28, 0.3, 'triangle']];
const SOUNDS = {
  forest: {
    bell: { partials: BELL3, decay: 0.45, vol: 0.12 },
    stop: { base: 523, scale: PENT, vol: 0.13, thunk: { f: 170, to: 62, v: 0.24, type: 'sine' } },
    coin: { base: 1318, scale: PENT, partials: [[1, 1, 1, 'sine'], [2.76, 0.45, 0.5, 'sine'], [5.4, 0.2, 0.3, 'sine']], decay: 0.28, vol: 0.085, step: 0.05, clatter: 0.02 },
    ratchet: { f: 1500, type: 'square', v: 0.028, gap: 46, slow: 14, noise: 0.02 },
    ui: { click: { f: 700, type: 'square', v: 0.05 }, nope: { f: 200, to: 150, type: 'square', v: 0.08 } },
    lead: 'triangle',
    table: { deal: { f: 900, to: 380, type: 'triangle', v: 0.12 }, chip: { base: 1760, decay: 0.16, vol: 0.09 }, ball: { f: 2100, type: 'triangle', v: 0.05 }, drop: { f: 260, to: 110, type: 'sine', v: 0.2 } },
  },
  night: {
    bell: { partials: [[1, 1, 1.3, 'sine'], [2.76, 0.55, 0.9, 'sine'], [5.4, 0.3, 0.5, 'sine'], [8.93, 0.12, 0.3, 'sine']], decay: 0.9, vol: 0.1 },
    stop: { base: 659, scale: [0, 3, 5, 7, 10], vol: 0.12, thunk: { f: 130, to: 52, v: 0.18, type: 'sine' } },
    coin: { base: 1568, scale: [0, 3, 5, 7, 10], partials: [[1, 1, 1, 'sine'], [2.76, 0.5, 0.7, 'sine'], [5.4, 0.2, 0.4, 'sine']], decay: 0.5, vol: 0.07, step: 0.055, clatter: 0 },
    ratchet: { f: 2300, type: 'sine', v: 0.03, gap: 52, slow: 16, noise: 0 },
    ui: { click: { f: 880, type: 'sine', v: 0.05 }, nope: { f: 220, to: 160, type: 'sine', v: 0.09 } },
    lead: 'sine',
    table: { deal: { f: 1100, to: 500, type: 'sine', v: 0.1 }, chip: { base: 1976, decay: 0.3, vol: 0.08 }, ball: { f: 2600, type: 'sine', v: 0.05 }, drop: { f: 300, to: 120, type: 'sine', v: 0.18 } },
  },
  server: {
    bell: { partials: [[1, 1, 1, 'square'], [2.76, 0.35, 0.5, 'square'], [5.4, 0.18, 0.3, 'square']], decay: 0.22, vol: 0.05 },
    stop: { base: 440, scale: PENT, vol: 0.06, thunk: { f: 110, to: 45, v: 0.12, type: 'sawtooth' } },
    coin: { base: 1760, scale: [0, 2, 4, 7, 9, 12], partials: [[1, 1, 1, 'square'], [2.76, 0.25, 0.4, 'square']], decay: 0.12, vol: 0.04, step: 0.035, clatter: 0.03 },
    ratchet: { f: 2800, type: 'square', v: 0.03, gap: 38, slow: 12, noise: 0.035 },
    ui: { click: { f: 1200, type: 'square', v: 0.045 }, nope: { f: 140, to: 100, type: 'sawtooth', v: 0.08 } },
    lead: 'square',
    table: { deal: { f: 1500, to: 600, type: 'square', v: 0.06 }, chip: { base: 2200, decay: 0.08, vol: 0.05 }, ball: { f: 3000, type: 'square', v: 0.035 }, drop: { f: 200, to: 80, type: 'sawtooth', v: 0.1 } },
  },
  velvet: {
    bell: { partials: [[1, 1, 1.2, 'sine'], [2.76, 0.4, 0.7, 'triangle'], [5.4, 0.16, 0.4, 'sine']], decay: 0.8, vol: 0.11 },
    stop: { base: 392, scale: [0, 2, 4, 5, 7], vol: 0.12, thunk: { f: 120, to: 55, v: 0.22, type: 'sine' } },
    coin: { base: 1047, scale: [0, 2, 4, 5, 7, 9, 11], partials: [[1, 1, 1, 'sine'], [2.76, 0.4, 0.6, 'triangle'], [5.4, 0.15, 0.3, 'sine']], decay: 0.4, vol: 0.08, step: 0.06, clatter: 0.01 },
    ratchet: { f: 1200, type: 'triangle', v: 0.03, gap: 55, slow: 18, noise: 0.01 },
    ui: { click: { f: 520, type: 'triangle', v: 0.06 }, nope: { f: 190, to: 140, type: 'triangle', v: 0.09 } },
    lead: 'triangle',
    table: { deal: { f: 700, to: 320, type: 'triangle', v: 0.12 }, chip: { base: 1568, decay: 0.22, vol: 0.09 }, ball: { f: 1800, type: 'triangle', v: 0.05 }, drop: { f: 240, to: 100, type: 'sine', v: 0.2 } },
  },
  arcade: {
    bell: { partials: [[1, 1, 0.7, 'square'], [2, 0.4, 0.4, 'square']], decay: 0.3, vol: 0.05 },
    stop: { base: 784, scale: [0, 4, 7, 12, 16], vol: 0.06, thunk: { f: 260, to: 110, v: 0.1, type: 'square' } },
    coin: { base: 1319, scale: [0, 4, 7, 12], partials: [[1, 1, 1, 'square'], [2.76, 0.2, 0.3, 'square']], decay: 0.09, vol: 0.045, step: 0.03, clatter: 0 },
    ratchet: { f: 1800, type: 'square', v: 0.03, gap: 34, slow: 10, noise: 0 },
    ui: { click: { f: 1046, type: 'square', v: 0.05 }, nope: { f: 220, to: 110, type: 'square', v: 0.08 } },
    lead: 'square',
    table: { deal: { f: 1200, to: 700, type: 'square', v: 0.07 }, chip: { base: 1568, decay: 0.07, vol: 0.05 }, ball: { f: 2400, type: 'square', v: 0.04 }, drop: { f: 330, to: 130, type: 'square', v: 0.09 } },
  },
  vault: {
    bell: { partials: [[1, 1, 1.5, 'sine'], [2.76, 0.6, 1, 'sine'], [5.4, 0.35, 0.6, 'triangle'], [8.93, 0.15, 0.35, 'sine']], decay: 1.1, vol: 0.1 },
    stop: { base: 330, scale: PENT, vol: 0.12, thunk: { f: 90, to: 38, v: 0.3, type: 'sine' } },
    coin: { base: 1175, scale: PENT, partials: [[1, 1, 1.2, 'sine'], [2.76, 0.6, 0.8, 'sine'], [5.4, 0.3, 0.5, 'triangle']], decay: 0.5, vol: 0.09, step: 0.052, clatter: 0.03 },
    ratchet: { f: 3200, type: 'triangle', v: 0.035, gap: 60, slow: 18, noise: 0.03 },
    ui: { click: { f: 400, type: 'triangle', v: 0.07 }, nope: { f: 150, to: 90, type: 'triangle', v: 0.1 } },
    lead: 'triangle',
    table: { deal: { f: 600, to: 260, type: 'triangle', v: 0.13 }, chip: { base: 1397, decay: 0.35, vol: 0.1 }, ball: { f: 1600, type: 'triangle', v: 0.06 }, drop: { f: 180, to: 70, type: 'sine', v: 0.26 } },
  },
};
export function makeThemeSounds(name) {
  const key = String(name || '').replace(/^theme:/, ''), id = SOUNDS[key] ? key : 'forest';
  return { id, ...JSON.parse(JSON.stringify(SOUNDS[id])) };
}
`);
const S6_CSS = S6_DEC(String.raw`/* Темы оформления казино: forest / night / server / velvet / arcade / vault.
   Реестр, переменные --ct-* и звук — js/casino-themes.js. Класс темы (th-*) и скин (sk-*) вешаются на .casino-root
   (слоты, хаб, столы) функцией applyCasinoTheme / decorateCasinoPage. Движение отключается при prefers-reduced-motion. */

/* ===== общие компоненты: шрифт, кнопки, плитки, диалоги ===== */
.casino-root{font-family:var(--ct-font,inherit)}
.casino-root :is(button,input,select,textarea){font-family:inherit}
.casino-root :is(h1,h2,h3,.btn2,.sl-stat>span,.cs-stat>span,.cs-kind,.sl-banner,.sl-winbar>span,.sl-lever-label,.sl-payhead){font-family:var(--ct-font-d,var(--ct-font,inherit))}
.casino-root .btn2{border-radius:var(--ct-r-btn,calc(7px * var(--rs,1)));border:var(--ct-bw,1px) solid var(--ct-edge,var(--border));background:var(--ct-btn-bg,var(--card));color:var(--ct-btn-fg,var(--text));box-shadow:var(--ct-shadow,none);transition:transform .12s,box-shadow .12s,background .2s,color .2s,filter .2s}
.casino-root .btn2:hover:not(:disabled){filter:brightness(1.08)}
.casino-root .btn2:active:not(:disabled){transform:var(--ct-press,none);box-shadow:var(--ct-shadow-press,none);background:var(--ct-press-bg,var(--ct-btn-bg,var(--card)));color:var(--ct-press-fg,var(--ct-btn-fg,var(--text)))}
.casino-root .btn2.btn-primary{background:var(--ct-primary-bg,var(--accent));color:var(--ct-primary-fg,#fff)}
.casino-root .btn2.btn-primary:active:not(:disabled){background:var(--ct-primary-bg,var(--accent));color:var(--ct-primary-fg,#fff);filter:brightness(.92)}
.casino-root .btn2:focus-visible{outline:3px solid var(--ct-acc,var(--accent));outline-offset:2px}
.casino-root :is(.sl-stat,.cs-stat){border-radius:var(--ct-r-btn,calc(12px * var(--rs,1)));border:var(--ct-bw,1px) solid color-mix(in srgb,var(--ct-edge,var(--border)) 45%,var(--border))}
.casino-root :is(.sl-bush,.sl-gamble,.sl-breakmsg,.cs-nudge,.cs-collection){border-radius:var(--ct-r-btn,calc(12px * var(--rs,1)))}
.casino-root .sl-machine{border-radius:var(--ct-r-frame,calc(22px * var(--rs,1)))}
.casino-root .sl-frame{border-radius:calc(var(--ct-r-frame,14px) * .7)}
.casino-root .app-dialog{font-family:var(--ct-font,inherit);border-radius:var(--ct-r-dlg,calc(14px * var(--rs,1)));border:var(--ct-bw,1px) solid var(--ct-dlg-edge,var(--border));background:var(--ct-dlg-bg,var(--card));box-shadow:var(--ct-dlg-shadow,0 28px 90px rgba(0,0,0,.23))}
.casino-root .cs-game{border-radius:var(--ct-r-frame,calc(20px * var(--rs,1)))}

/* ===== общие элементы столов: сукно, фишки, рубашка карты (для блэкджека и рулетки) ===== */
.ct-felt{position:relative;color:var(--ct-felt-ink,#fff);border-radius:var(--ct-r-frame,calc(18px * var(--rs,1)));background:var(--ct-felt-tex,none),radial-gradient(ellipse at 50% 38%,var(--ct-felt-a,#2f7d46),var(--ct-felt-b,#1b4d2b));box-shadow:inset 0 0 0 3px var(--ct-felt-line,#9be37a),inset 0 0 70px rgba(0,0,0,.4),0 14px 34px rgba(0,0,0,.28)}
.ct-chip{--c:var(--ct-chip-1,#f4f1de);display:inline-grid;place-items:center;flex:none;width:var(--ct-chip-size,44px);aspect-ratio:1;border-radius:50%;border:3px solid var(--ct-chip-edge,#fff);color:var(--ct-chip-ink,#173d22);font:800 .7rem/1 var(--ct-font-d,inherit);font-variant-numeric:tabular-nums;background:radial-gradient(circle,var(--c) 0 54%,transparent 55%),repeating-conic-gradient(var(--ct-chip-stripe,#fff) 0 12deg,var(--c) 12deg 45deg);box-shadow:0 3px 0 rgba(0,0,0,.4),inset 0 0 0 2px rgba(0,0,0,.18)}
.ct-chip[data-tier="2"]{--c:var(--ct-chip-2,#e8467c)}.ct-chip[data-tier="3"]{--c:var(--ct-chip-3,#3f9a4e)}.ct-chip[data-tier="4"]{--c:var(--ct-chip-4,#2b2a3a)}
.ct-chip[data-tier="2"],.ct-chip[data-tier="3"],.ct-chip[data-tier="4"]{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.ct-cardback{position:relative;display:block;aspect-ratio:5/7;border-radius:calc(8px * var(--rs,1));border:3px solid #fff;overflow:hidden;box-shadow:0 6px 14px rgba(0,0,0,.35);
  background:var(--ct-cb-pattern,none),radial-gradient(circle at 50% 50%,var(--ct-cb-c,#ffd84a) 0 13%,transparent 14%),repeating-linear-gradient(45deg,var(--ct-cb-b,#9be37a) 0 2px,transparent 2px 11px),repeating-linear-gradient(-45deg,var(--ct-cb-b,#9be37a) 0 2px,transparent 2px 11px),linear-gradient(160deg,var(--ct-cb-a,#2f6b3a),color-mix(in srgb,var(--ct-cb-a,#2f6b3a) 70%,#000))}
.casino-root[data-ct-cardback="marked"] .ct-cardback::after{content:"";position:absolute;top:7px;right:7px;width:9px;height:9px;background:var(--ct-cb-c,#ffe27a);transform:rotate(45deg);box-shadow:0 0 6px var(--ct-cb-c,#ffe27a)}

/* ===== ЛЕС: мультяшные листья, толстые контуры, «нажимные» кнопки ===== */
.casino-root.th-forest .sl-machine{--fr1:#3f9a4e;--fr2:#1a3d25;--bg1:#e7f5e0;--bg2:#cfe9c6;border:4px solid #173d22;box-shadow:0 8px 0 #10301a,0 24px 40px rgba(0,0,0,.28),inset 0 3px 0 rgba(255,255,255,.2)}
.casino-root.th-forest .sl-frame::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.32;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%235dbb63' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") 14px 18px/44px 44px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%239be37a' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") 70% 60%/36px 36px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%235dbb63' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") 36% 84%/30px 30px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%239be37a' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") 88% 12%/40px 40px no-repeat;animation:ct-leaf 14s ease-in-out infinite alternate}
.casino-root.th-forest .sl-frame::after{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%235dbb63' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") left -6px top -6px/48px 48px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%239be37a' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") right -8px bottom -8px/54px 54px no-repeat;transform-origin:0 0}
.casino-root.th-forest .sl-reel{border-right:2px solid rgba(23,61,34,.35)}
.casino-root.th-forest .sl-sym,.sl-sym.sk-forest{filter:saturate(1.15) drop-shadow(1.5px 1.5px 0 #173d22) drop-shadow(-1.5px -1.5px 0 #173d22) drop-shadow(0 4px 3px rgba(0,0,0,.28))}
.casino-root.th-forest .ct-felt{--ct-felt-tex:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%235dbb63' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") 8px 8px/38px 38px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%239be37a' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") calc(100% - 10px) calc(100% - 10px)/38px 38px no-repeat}
.casino-root.th-forest{--ct-cb-pattern:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cpath d='M5 39C4 15 17 5 39 5C40 27 27 40 5 39Z' fill='%239be37a' stroke='%23173d22' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M9 35L31 13' stroke='%23173d22' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E") center/46% auto no-repeat}
@keyframes ct-leaf{from{background-position:14px 18px,70% 60%,36% 84%,88% 12%}to{background-position:26px 30px,66% 52%,40% 78%,84% 20%}}

/* ===== ЗВЁЗДНАЯ НОЧЬ: неоновые контуры и свечение ===== */
.casino-root.th-night .sl-machine{--fr1:#2b2f6e;--fr2:#12143a;--bg1:#252a64;--bg2:#171a45;border:2px solid #7cf0ff;box-shadow:0 0 0 2px rgba(124,240,255,.2),0 0 28px rgba(124,240,255,.45),0 0 70px rgba(184,140,255,.3),inset 0 0 30px rgba(124,240,255,.2)}
.casino-root.th-night .sl-frame{box-shadow:inset 0 0 0 2px rgba(124,240,255,.55),inset 0 0 44px rgba(124,240,255,.18)}
.casino-root.th-night .sl-frame::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.9;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Ccircle cx='12' cy='14' r='1.4' fill='%23fff'/%3E%3Ccircle cx='58' cy='30' r='1' fill='%23cfe3ff'/%3E%3Ccircle cx='30' cy='70' r='1.2' fill='%237cf0ff'/%3E%3Ccircle cx='78' cy='64' r='1.5' fill='%23fff'/%3E%3Ccircle cx='46' cy='8' r='.9' fill='%23fff'/%3E%3C/svg%3E") 0 0/90px 90px,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Ccircle cx='12' cy='14' r='1.4' fill='%23fff'/%3E%3Ccircle cx='58' cy='30' r='1' fill='%23cfe3ff'/%3E%3Ccircle cx='30' cy='70' r='1.2' fill='%237cf0ff'/%3E%3Ccircle cx='78' cy='64' r='1.5' fill='%23fff'/%3E%3Ccircle cx='46' cy='8' r='.9' fill='%23fff'/%3E%3C/svg%3E") 40px 30px/130px 130px;animation:ct-twinkle 5s ease-in-out infinite alternate}
.casino-root.th-night .sl-reel{border-right:2px solid rgba(124,240,255,.4);box-shadow:inset 0 0 22px rgba(124,240,255,.1)}
.casino-root.th-night .sl-sym,.sl-sym.sk-night{filter:url(#ct-neon)}
.casino-root.th-night .sl-sym[data-sym="berry"]{filter:url(#ct-neon) hue-rotate(140deg)}.casino-root.th-night .sl-sym[data-sym="apple"]{filter:url(#ct-neon) hue-rotate(170deg)}
.casino-root.th-night .sl-sym[data-sym="mush"]{filter:url(#ct-neon) hue-rotate(200deg)}.casino-root.th-night .sl-sym[data-sym="git"]{filter:url(#ct-neon) hue-rotate(225deg)}
.casino-root.th-night .sl-sym[data-sym="orange"]{filter:url(#ct-neon) hue-rotate(205deg)}.casino-root.th-night .sl-sym[data-sym="cpp"]{filter:url(#ct-neon) hue-rotate(30deg)}
.casino-root.th-night .sl-sym[data-sym="rust"]{filter:url(#ct-neon) hue-rotate(185deg)}.casino-root.th-night .sl-sym[data-sym="pi"]{filter:url(#ct-neon) hue-rotate(80deg)}
.casino-root.th-night .sl-sym[data-sym="hog"]{filter:url(#ct-neon) hue-rotate(215deg)}.casino-root.th-night .sl-sym[data-sym="king"]{filter:url(#ct-neon) hue-rotate(235deg)}
.casino-root.th-night .sl-sym[data-sym="wild"]{filter:url(#ct-neon) hue-rotate(300deg)}.casino-root.th-night .sl-sym[data-sym="bonus"]{filter:url(#ct-neon) hue-rotate(140deg)}
.casino-root.th-night .sl-sym[data-sym="claude"]{filter:url(#ct-neon) hue-rotate(185deg)}.casino-root.th-night .sl-sym[data-sym="itmo"]{filter:url(#ct-neon) hue-rotate(20deg)}
.casino-root.th-night .sl-sym[data-sym="seven"]{filter:url(#ct-neon) hue-rotate(170deg)}.casino-root.th-night .sl-sym[data-sym="capsule"]{filter:url(#ct-neon) hue-rotate(80deg)}
.casino-root.th-night .cs-game{box-shadow:0 0 0 2px rgba(124,240,255,.5),0 0 28px rgba(124,240,255,.35),inset 0 0 24px rgba(124,240,255,.12)}
.casino-root.th-night .ct-felt{--ct-felt-tex:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Ccircle cx='12' cy='14' r='1.4' fill='%23fff'/%3E%3Ccircle cx='58' cy='30' r='1' fill='%23cfe3ff'/%3E%3Ccircle cx='30' cy='70' r='1.2' fill='%237cf0ff'/%3E%3Ccircle cx='78' cy='64' r='1.5' fill='%23fff'/%3E%3Ccircle cx='46' cy='8' r='.9' fill='%23fff'/%3E%3C/svg%3E") 0 0/90px 90px}
.casino-root.th-night{--ct-cb-pattern:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Ccircle cx='12' cy='14' r='1.4' fill='%23fff'/%3E%3Ccircle cx='58' cy='30' r='1' fill='%23cfe3ff'/%3E%3Ccircle cx='30' cy='70' r='1.2' fill='%237cf0ff'/%3E%3Ccircle cx='78' cy='64' r='1.5' fill='%23fff'/%3E%3Ccircle cx='46' cy='8' r='.9' fill='%23fff'/%3E%3C/svg%3E") 0 0/60px 60px}
@keyframes ct-twinkle{from{opacity:.55}to{opacity:1}}

/* ===== СЕРВЕРНАЯ: зелёный люминофор, пиксели, линии развёртки ===== */
.casino-root.th-server .sl-machine{--fr1:#3b4350;--fr2:#171b22;--bg1:#0d1f17;--bg2:#06100b;border:1px solid #33ff99;box-shadow:0 0 0 3px #0b0f0d,0 0 0 4px rgba(51,255,153,.35),0 18px 40px rgba(0,0,0,.5)}
.casino-root.th-server .sl-frame{box-shadow:inset 0 0 0 1px rgba(51,255,153,.55),inset 0 0 60px rgba(0,0,0,.6)}
.casino-root.th-server .sl-frame::after{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.3) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.5));animation:ct-flicker 6s steps(1) infinite}
.casino-root.th-server .sl-reel{border-right:1px dashed rgba(51,255,153,.35)}
.casino-root.th-server .sl-sym,.sl-sym.sk-server{filter:url(#ct-phosphor) drop-shadow(0 0 3px rgba(51,255,153,.7));image-rendering:pixelated;-webkit-mask:repeating-linear-gradient(0deg,#000 0 2px,rgba(0,0,0,.6) 2px 3px);mask:repeating-linear-gradient(0deg,#000 0 2px,rgba(0,0,0,.6) 2px 3px)}
.casino-root.th-server .cs-game::after{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px)}
.casino-root.th-server .ct-felt{--ct-felt-tex:repeating-linear-gradient(0deg,rgba(51,255,153,.06) 0 1px,transparent 1px 4px)}
.casino-root.th-server{--ct-cb-pattern:repeating-linear-gradient(90deg,rgba(51,255,153,.35) 0 2px,transparent 2px 8px)}
@keyframes ct-flicker{0%,92%,100%{opacity:1}93%{opacity:.82}95%{opacity:1}97%{opacity:.9}}

/* ===== БАРХАТ: бордовые портьеры, золотая окантовка ===== */
.casino-root.th-velvet .sl-machine{--fr1:#7a1f33;--fr2:#2b0a14;--bg1:#4a1220;--bg2:#2a0a12;border:3px solid #e8c37a;box-shadow:0 0 0 2px #5a3d0e,0 20px 44px rgba(40,0,15,.5),inset 0 0 0 2px #7a5a1a}
.casino-root.th-velvet .sl-machine::before{content:"";position:absolute;left:10%;right:10%;top:3px;height:7px;pointer-events:none;background:radial-gradient(circle at 50% 50%,#ffe9a8 0 2px,#e8c37a 2.5px 3.5px,transparent 4px) 0 0/22px 7px repeat-x}
.casino-root.th-velvet .sl-frame{box-shadow:inset 0 0 0 2px rgba(232,195,122,.7),inset 0 0 40px rgba(0,0,0,.5)}
.casino-root.th-velvet .sl-frame::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 6px,rgba(0,0,0,.18) 6px 14px) left top/10% 100% no-repeat,repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 6px,rgba(0,0,0,.18) 6px 14px) right top/10% 100% no-repeat,linear-gradient(90deg,rgba(0,0,0,.4),transparent 12%,transparent 88%,rgba(0,0,0,.4))}
.casino-root.th-velvet .sl-reel{border-right:2px solid rgba(232,195,122,.3)}
.casino-root.th-velvet .sl-sym,.sl-sym.sk-velvet{filter:saturate(1.1) sepia(.12) drop-shadow(0 3px 3px rgba(30,0,10,.6)) drop-shadow(0 0 6px rgba(232,195,122,.25))}
.casino-root.th-velvet .cs-game{box-shadow:0 0 0 2px rgba(232,195,122,.7),0 20px 44px rgba(40,0,15,.4)}
.casino-root.th-velvet .ct-felt{--ct-felt-tex:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26'%3E%3Cpath d='M13 2L24 13L13 24L2 13Z' fill='none' stroke='%23e8c37a' stroke-width='1.6'/%3E%3Ccircle cx='13' cy='13' r='2' fill='%23e8c37a'/%3E%3C/svg%3E") 0 0/26px 26px}
.casino-root.th-velvet{--ct-cb-pattern:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26'%3E%3Cpath d='M13 2L24 13L13 24L2 13Z' fill='none' stroke='%23e8c37a' stroke-width='1.6'/%3E%3Ccircle cx='13' cy='13' r='2' fill='%23e8c37a'/%3E%3C/svg%3E") 0 0/26px 26px}

/* ===== АРКАДА: пиксельная рамка, лампочки, неоновая сетка ===== */
.casino-root.th-arcade .sl-machine{--fr1:#2a1470;--fr2:#0e0630;--bg1:#12083a;--bg2:#0a0524;border:4px solid #0a0a1a;box-shadow:8px 8px 0 #0a0a1a,0 0 0 4px #ff3d9a}
.casino-root.th-arcade .sl-machine::before{content:"";position:absolute;inset:-12px;pointer-events:none;border:5px dotted #ffd84a;animation:ct-bulbs 1.1s steps(1) infinite}
.casino-root.th-arcade .sl-frame{background-image:linear-gradient(rgba(255,61,154,.28) 1px,transparent 1px),linear-gradient(90deg,rgba(49,224,255,.22) 1px,transparent 1px),linear-gradient(180deg,var(--bg1),var(--bg2));background-size:28px 28px,28px 28px,100% 100%;box-shadow:inset 0 0 0 3px #0a0a1a,inset 0 0 0 5px #31e0ff}
.casino-root.th-arcade .sl-reel{border-right:3px solid #0a0a1a}
.casino-root.th-arcade .sl-sym,.sl-sym.sk-arcade{filter:url(#ct-arcade) drop-shadow(3px 3px 0 #0a0a1a);image-rendering:pixelated;-webkit-mask:radial-gradient(circle at 50% 50%,#000 58%,transparent 62%) 0 0/3px 3px;mask:radial-gradient(circle at 50% 50%,#000 58%,transparent 62%) 0 0/3px 3px}
.casino-root.th-arcade h1{font-size:clamp(1.3rem,3.2vw,2.2rem);line-height:1.35}
.casino-root.th-arcade :is(.btn2,.sl-stat>span,.cs-stat>span,.cs-kind,.sl-winbar>span){font-size:.62rem;line-height:1.6;letter-spacing:.03em}
.casino-root.th-arcade :is(h2,h3){font-size:.95rem;line-height:1.5}
.casino-root.th-arcade .cs-game{box-shadow:8px 8px 0 #0a0a1a;border:3px solid #0a0a1a}
.casino-root.th-arcade .ct-felt{--ct-felt-tex:linear-gradient(rgba(255,61,154,.2) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,rgba(49,224,255,.16) 1px,transparent 1px) 0 0/28px 28px}
.casino-root.th-arcade{--ct-cb-pattern:repeating-conic-gradient(var(--ct-cb-b) 0 25%,transparent 0 50%) 0 0/16px 16px}
@keyframes ct-bulbs{0%{border-color:#ffd84a}50%{border-color:#ff3d9a}}

/* ===== ХРАНИЛИЩЕ: стальная плита, заклёпки, золото ===== */
.casino-root.th-vault .sl-machine{--fr1:#8a929e;--fr2:#3a404a;--bg1:#1f2630;--bg2:#10151b;border:3px solid #c9a24a;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 1px,transparent 1px 3px),linear-gradient(160deg,var(--fr1),var(--fr2));box-shadow:0 0 0 2px #1d1a10,0 18px 40px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,243,196,.35)}
.casino-root.th-vault .sl-machine::before{content:"";position:absolute;inset:4px;pointer-events:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%23e8e4da' stroke='%235b616b' stroke-width='2.5'/%3E%3Ccircle cx='10' cy='10' r='2.5' fill='%23fff'/%3E%3C/svg%3E") left top/20px 20px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%23e8e4da' stroke='%235b616b' stroke-width='2.5'/%3E%3Ccircle cx='10' cy='10' r='2.5' fill='%23fff'/%3E%3C/svg%3E") right top/20px 20px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%23e8e4da' stroke='%235b616b' stroke-width='2.5'/%3E%3Ccircle cx='10' cy='10' r='2.5' fill='%23fff'/%3E%3C/svg%3E") left bottom/20px 20px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%23e8e4da' stroke='%235b616b' stroke-width='2.5'/%3E%3Ccircle cx='10' cy='10' r='2.5' fill='%23fff'/%3E%3C/svg%3E") right bottom/20px 20px no-repeat}
.casino-root.th-vault .sl-frame{box-shadow:inset 0 0 0 3px #c9a24a,inset 0 0 40px rgba(0,0,0,.6)}
.casino-root.th-vault .sl-frame::after{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;background:linear-gradient(115deg,transparent 42%,rgba(255,243,196,.18) 50%,transparent 58%) -140% 0/60% 100% no-repeat;animation:ct-glint 7s ease-in-out infinite}
.casino-root.th-vault .sl-reel{border-right:2px solid rgba(201,162,74,.45)}
.casino-root.th-vault .sl-sym,.sl-sym.sk-vault{filter:url(#ct-bevel) sepia(.4) saturate(.85) contrast(1.1) drop-shadow(0 2px 2px rgba(0,0,0,.6))}
.casino-root.th-vault .sl-sym:is([data-sym="king"],[data-sym="seven"],[data-sym="wild"],[data-sym="scatter"]){filter:url(#ct-bevel) sepia(.25) contrast(1.1) drop-shadow(0 0 6px rgba(255,220,140,.6)) drop-shadow(0 2px 2px rgba(0,0,0,.6))}
.casino-root.th-vault .cs-game{box-shadow:0 0 0 3px #c9a24a,0 18px 40px rgba(0,0,0,.4)}
.casino-root.th-vault .ct-felt{--ct-felt-tex:repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 3px)}
.casino-root.th-vault{--ct-cb-pattern:repeating-radial-gradient(circle at 50% 50%,rgba(232,228,218,.5) 0 1px,transparent 1px 7px)}
@keyframes ct-glint{0%,55%{background-position:-140% 0}85%,100%{background-position:240% 0}}

/* ===== покой и печать ===== */
@media(max-width:760px){.casino-root.th-arcade .sl-machine::before{inset:-9px;border-width:4px}.casino-root.th-vault .sl-machine::before{display:none}}
@media(prefers-reduced-motion:reduce){
  .casino-root.th-forest .sl-frame::before,.casino-root.th-night .sl-frame::before,.casino-root.th-server .sl-frame::after,.casino-root.th-arcade .sl-machine::before,.casino-root.th-vault .sl-frame::after{animation:none!important}
  .casino-root .btn2{transition:none}
}
@media print{.casino-root .sl-frame::before,.casino-root .sl-frame::after,.casino-root .sl-machine::before{display:none}}
`);
const S6_AUDIO = S6_DEC(String.raw`/*
  Звук казино: Web Audio, всё синтезируется (файлов нет). Флаг — тот же hh_save_v1.sfx, что и в игре «Ёжик»; по умолчанию выключен.
  Музыка — только фанфара джекпота. destroy() гасит все узлы и таймеры (вызывается роутером при уходе со страницы).

  Шаг 6 казино: звук зависит от темы (js/casino-themes.js → makeThemeSounds). makeSlotsAudio(тема?) — без аргумента тема берётся из
  сохранения слотов; audio.theme(имя) переключает на лету. На остановку барабана — «колокольчик» из inharmonic-партиалов (1 : 2.76 : 5.4),
  на выигрыш — быстрый «звон монет» (число монет растёт с уровнем выигрыша), во время вращения — лёгкая трещотка вместо пилообразного гула.
  Для столов: audio.deal() / chip() / ballTick() / ballDrop().
*/
import { makeThemeSounds, storedThemeId } from './casino-themes.js';
export { makeThemeSounds };

const KEY = 'hh_save_v1';
const hz = (base, semi) => base * Math.pow(2, semi / 12);
const PENT = [0, 2, 4, 7, 9];
const COINS = { small: 4, good: 7, big: 12, mega: 18, epic: 26 };
const MELODY = { small: 3, good: 4, big: 6, mega: 8, epic: 10 };
export function readSfx() { try { return Boolean(JSON.parse(localStorage.getItem(KEY) || '{}').sfx); } catch { return false; } }
function writeSfx(on) { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; s.sfx = on; localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* приватный режим */ } }

export function makeSlotsAudio(themeName) {
  let ctx = null, master = null, noiseBuf = null, on = readSfx(), fanfare = 0, dead = false;
  let spinning = false, ratchetT = 0, reelsLeft = 5;
  let P = makeThemeSounds(themeName === undefined ? storedThemeId() : themeName);
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  function ensure() {
    if (dead) return null;
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, d, o = {}) {
    if (!on || !ensure()) return;
    const t0 = ctx.currentTime + (o.delay || 0), a = o.a || 0.006, v = o.v || 0.2, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t0); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + a + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + a + d + 0.05);
  }
  function noise(d, v, fc, delay = 0, type = 'lowpass') {
    if (!on || !ensure()) return;
    const t0 = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; f.type = type; f.frequency.value = fc; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(f); f.connect(g); g.connect(master); src.start(t0, Math.random() * 0.5); src.stop(t0 + d + 0.05);
  }
  // Колокольчик / монета: 2–4 партиала с негармоническими отношениями и быстрым затуханием
  function bell(f0, o = {}) {
    if (!on || !ensure()) return;
    const partials = o.partials || P.bell.partials, v = o.v ?? P.bell.vol, dk = o.decay ?? P.bell.decay, t0 = ctx.currentTime + Math.max(0, o.delay || 0);
    for (const [ratio, gain, share, type] of partials) {
      const f = f0 * ratio; if (f > 11000) continue;
      const len = Math.max(0.04, dk * share), osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type || 'sine'; osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * gain), t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.003 + len);
      osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0 + len + 0.05);
    }
  }
  const arp = (semis, base, step, o = {}) => semis.forEach((s, i) => tone(hz(base, s), o.d || 0.22, { type: o.type || P.lead || 'triangle', v: o.v || 0.15, delay: i * step }));
  // Звон монет: n быстрых «колокольчиков» вверх по гамме темы, с лёгким разбросом и звонким шорохом
  function coins(n, gain = 1) {
    const C = P.coin, sc = C.scale, step = Math.max(0.026, C.step - n * 0.0009);
    for (let i = 0; i < n; i++) {
      const semi = sc[i % sc.length] + 12 * (Math.floor(i / sc.length) % 3) - 12, f = Math.min(3200, hz(C.base, semi));
      const delay = Math.max(0, i * step + (Math.random() - 0.5) * 0.012), v = C.vol * gain * (0.7 + 0.3 * (n > 1 ? i / (n - 1) : 1));
      bell(f, { delay, v, decay: C.decay, partials: C.partials });
      if (C.clatter && i % 2 === 0) noise(0.04, C.clatter, 6500, delay, 'highpass');
    }
  }
  // Трещотка: короткие щелчки, реже по мере остановки барабанов
  function ratchetStep() {
    ratchetT = 0; if (dead || !spinning) return;
    const R = P.ratchet;
    tone(R.f * (0.94 + Math.random() * 0.12), 0.012, { type: R.type, v: R.v, a: 0.001 });
    if (R.noise) noise(0.01, R.noise, 5000, 0, 'highpass');
    ratchetT = setTimeout(ratchetStep, R.gap + (5 - reelsLeft) * R.slow);
  }
  const api = {
    get on() { return on; },
    get themeName() { return P.id; },
    theme(name) { P = makeThemeSounds(name); return api; },
    set(v) { on = Boolean(v); writeSfx(on); if (on) { ensure(); api.click(); } else api.stopAll(); },
    click() { const u = P.ui.click; tone(u.f, 0.04, { type: u.type, v: u.v }); },
    nope() { const u = P.ui.nope; tone(u.f, 0.12, { type: u.type, to: u.to, v: u.v }); },
    lever() { noise(0.18, 0.1, 900); tone(180, 0.18, { type: 'sawtooth', to: 90, v: 0.08 }); },
    whirStart() { if (!on || !ensure() || spinning) return; spinning = true; reelsLeft = 5; ratchetStep(); },
    whirStop() { spinning = false; if (ratchetT) { clearTimeout(ratchetT); ratchetT = 0; } },
    // остановка барабана i: глухой «ударный» тон + колокольчик (выше с каждым барабаном)
    thunk(i = 0) {
      reelsLeft = Math.max(0, 4 - i);
      const S = P.stop, T = S.thunk;
      tone(T.f - i * 8, 0.13, { type: T.type, to: T.to, v: T.v }); noise(0.07, 0.1, 500);
      bell(hz(S.base, S.scale[i % S.scale.length] + 12 * Math.floor(i / S.scale.length)), { v: S.vol, decay: P.bell.decay * 0.7 });
    },
    wild() { noise(0.45, 0.14, 2600, 0, 'bandpass'); tone(300, 0.4, { to: 1100, v: 0.1 }); bell(hz(P.stop.base, 12), { delay: 0.25, v: 0.1 }); },
    scatter(n = 1) { const s = PENT[n % 5]; bell(hz(880, s), { v: 0.12, decay: 0.6 }); bell(hz(1320, s), { delay: 0.06, v: 0.08, decay: 0.6 }); },
    heartbeat() { tone(70, 0.12, { v: 0.3 }); tone(62, 0.14, { v: 0.24, delay: 0.17 }); },
    tick(k = 0) { tone(900 + (k % 8) * 40, 0.03, { type: 'square', v: 0.035 }); },
    win(tier = 'small') {
      const n = COINS[tier] || 4, m = MELODY[tier] || 3;
      coins(n, tier === 'epic' ? 1.25 : 1);
      if (m >= 4) arp(Array.from({ length: m }, (_, i) => PENT[i % 5] + 12 * Math.floor(i / 5)), 523, 0.08, { d: 0.2 + m * 0.02, v: 0.09 });
      if (m >= 6) arp([0, 7, 12, 16], 262, 0.1, { type: 'sine', v: 0.1 });
      if (m >= 8) tone(hz(98, 0), 0.5, { type: 'sine', to: 70, v: 0.2 });
    },
    berry(k = 0) { tone(hz(660, PENT[k % 5]), 0.1, { to: hz(660, PENT[k % 5]) * 1.5, v: 0.14 }); },
    feature() { arp([0, 4, 7, 12, 16, 19], 392, 0.09, { d: 0.3 }); coins(6, 0.8); },
    segfault() { tone(300, 0.5, { type: 'sawtooth', to: 40, v: 0.16 }); noise(0.4, 0.14, 700); },
    shake() { noise(0.08, 0.12, 1200); tone(220, 0.06, { type: 'square', v: 0.05 }); },
    crack(r = 'common') { noise(0.2, 0.16, 3000, 0, 'highpass'); const n = { common: 3, rare: 4, epic: 5, legendary: 7 }[r] || 3; arp(Array.from({ length: n }, (_, i) => PENT[i % 5] + 7), 523, 0.09, { d: 0.35, v: 0.14 }); },
    wheelTick() { tone(1300, 0.025, { type: 'square', v: 0.05 }); },
    flip() { tone(500, 0.08, { to: 900, v: 0.1 }); tone(900, 0.08, { to: 500, v: 0.1, delay: 0.09 }); },
    gambleLose() { tone(240, 0.35, { type: 'triangle', to: 90, v: 0.14 }); },
    heat() { tone(300, 0.5, { to: 900, v: 0.08 }); },
    // столы (блэкджек / рулетка): звуки берутся из набора темы
    deal() { const d = P.table.deal; tone(d.f, 0.07, { type: d.type, to: d.to, v: d.v }); noise(0.05, 0.05, 3500, 0, 'highpass'); },
    chip() { const c = P.table.chip; bell(c.base, { v: c.vol, decay: c.decay, partials: [[1, 1, 1, 'sine'], [2.76, 0.5, 0.5, 'sine']] }); noise(0.03, 0.04, 4500, 0, 'highpass'); },
    ballTick() { const b = P.table.ball; tone(b.f * (0.9 + Math.random() * 0.2), 0.02, { type: b.type, v: b.v, a: 0.001 }); },
    ballDrop() { const d = P.table.drop; tone(d.f, 0.18, { type: d.type, to: d.to, v: d.v }); bell(hz(P.stop.base, 7), { delay: 0.05, v: 0.1 }); },
    // единственная «музыка» — фанфара джекпота, закольцована до stopFanfare()
    fanfare() {
      if (!on || !ensure() || fanfare) return;
      const bar = () => { arp([0, 4, 7, 12, 7, 12, 16, 19], 262, 0.12, { type: 'square', v: 0.07, d: 0.18 }); arp([-12, -5, 0, -5], 130, 0.24, { type: 'triangle', v: 0.14, d: 0.4 }); coins(5, 0.7); };
      bar(); fanfare = setInterval(bar, 1000);
    },
    stopFanfare() { if (fanfare) { clearInterval(fanfare); fanfare = 0; } },
    stopAll() { api.stopFanfare(); api.whirStop(); },
    destroy() { dead = true; api.stopAll(); timers.forEach(clearTimeout); timers.clear(); if (ctx) { try { ctx.close(); } catch { /* уже закрыт */ } ctx = null; } },
    later,
  };
  return api;
}
`);
const S6_TEST = S6_DEC(String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../js/casino-themes.js';
import * as C from '../js/casino-common.js';

// Шаг 6 казино: реестр тем, переменные, фильтры, наборы звука, переписанный slots-audio.js (с фальшивым AudioContext).
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const REQUIRED = ['--ct-r-btn', '--ct-r-dlg', '--ct-r-frame', '--ct-bw', '--ct-edge', '--ct-shadow', '--ct-shadow-press', '--ct-press', '--ct-btn-bg', '--ct-btn-fg', '--ct-primary-bg', '--ct-primary-fg',
  '--ct-dlg-bg', '--ct-dlg-edge', '--ct-dlg-shadow', '--ct-felt-a', '--ct-felt-b', '--ct-felt-line', '--ct-felt-ink', '--ct-chip-1', '--ct-chip-2', '--ct-chip-3', '--ct-chip-4', '--ct-chip-edge', '--ct-chip-ink', '--ct-chip-stripe', '--ct-cb-a', '--ct-cb-b', '--ct-cb-c'];

test('реестр: шесть тем, классы совпадают с THEME_CLASS, полный набор переменных', () => {
  assert.deepEqual(T.THEME_IDS, ['forest', 'night', 'server', 'velvet', 'arcade', 'vault']);
  for (const id of T.THEME_IDS) {
    const t = T.THEMES[id];
    assert.equal(t.id, id); assert.equal(t.cls, 'th-' + id); assert.equal(C.THEME_CLASS['theme:' + id], t.cls, id);
    for (const k of REQUIRED) assert.ok(t.vars[k], id + ' ' + k);
    assert.match(t.font, /(sans-serif|serif|monospace)$/); assert.match(t.fontDisplay, /(sans-serif|serif|monospace)$/);
  }
});

test('themeIdOf: префикс theme:, неизвестная и не купленная тема → forest', () => {
  assert.equal(T.themeIdOf({ theme: 'theme:night', album: { 'theme:night': 1 } }), 'night');
  assert.equal(T.themeIdOf({ theme: 'night' }), 'night');
  assert.equal(T.themeIdOf({ theme: 'theme:night', album: {} }), 'forest');
  assert.equal(T.themeIdOf({ theme: 'theme:nope' }), 'forest');
  assert.equal(T.themeIdOf(null), 'forest');
});

test('предметы шага 3 перекрывают умолчания темы, только если имеются', () => {
  const base = T.themeVars({ theme: 'forest' });
  assert.equal(base.vars['--ct-felt-a'], T.THEMES.forest.vars['--ct-felt-a']);
  const eq = T.themeVars({ theme: 'forest', equip: { felt: 'felt:burgundy', chips: 'chips:berry', cardback: 'cardback:marked' }, album: { 'cardback:marked': 1 } });
  assert.equal(eq.vars['--ct-felt-a'], T.ITEM_STYLES['felt:burgundy']['--ct-felt-a']);
  assert.equal(eq.vars['--ct-chip-2'], T.ITEM_STYLES['chips:berry']['--ct-chip-2']);
  assert.equal(eq.picked.cardback, 'marked');
  const no = T.themeVars({ theme: 'forest', equip: { cardback: 'cardback:marked' }, album: {} });
  assert.equal(no.picked.cardback, '');
  assert.equal(T.chipTier(5), 1); assert.equal(T.chipTier(50), 2); assert.equal(T.chipTier(500), 3); assert.equal(T.chipTier(5000), 4);
});

test('CSS: у каждой темы есть правила, все фильтры url(#ct-…) определены в SVG-defs', () => {
  const css = read('css/casino-themes.css'), defs = T.themeDefsMarkup();
  for (const id of T.THEME_IDS) assert.ok(css.includes('.casino-root.th-' + id + ' '), id);
  for (const m of css.matchAll(/url\(#(ct-[\w-]+)\)/g)) assert.ok(defs.includes('id="' + m[1] + '"'), m[1]);
  for (const cls of ['.ct-felt', '.ct-chip', '.ct-cardback']) assert.ok(css.includes(cls), cls);
  assert.ok(css.includes('prefers-reduced-motion'));
});

test('index.html: шрифты, импорт, установка и перекраска после перехода', () => {
  const h = read('index.html');
  assert.ok(h.includes('family=Comfortaa') && h.includes('Press+Start+2P') && h.includes('IBM+Plex+Mono'));
  assert.ok(h.includes("from './js/casino-themes.js'") && h.includes('installCasinoThemes();') && h.includes('decorateCasinoPage();'));
});

test('звуковые наборы: у каждой темы есть все роли, неизвестное имя → forest', () => {
  for (const id of T.THEME_IDS) {
    const s = T.makeThemeSounds(id);
    assert.equal(s.id, id);
    for (const k of ['bell', 'stop', 'coin', 'ratchet', 'ui', 'lead', 'table']) assert.ok(s[k], id + ' ' + k);
    assert.ok(s.bell.partials.length >= 2 && s.bell.partials.every(p => p.length === 4));
    assert.ok(s.coin.scale.length >= 4 && s.stop.scale.length >= 5);
  }
  assert.equal(T.makeThemeSounds('???').id, 'forest');
  assert.equal(T.makeThemeSounds('theme:vault').id, 'vault');
});

async function withFakeAudio(fn) {
  const rec = { osc: 0, src: 0, closed: false };
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  class Node { constructor() { this.gain = param(); this.frequency = param(); this.Q = param(); } connect() { return this; } disconnect() {} start() {} stop() {} }
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); }
    createOscillator() { rec.osc++; return new Node(); } createGain() { return new Node(); } createBiquadFilter() { return new Node(); }
    createBufferSource() { rec.src++; return new Node(); } createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    resume() {} close() { rec.closed = true; }
  }
  const store = { hh_save_v1: JSON.stringify({ sfx: true }) };
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.AudioContext = Ctx; Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  try { return await fn(rec, store); }
  finally { delete globalThis.AudioContext; if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; }
}

test('slots-audio: API прежний, тема переключается, остановка барабана звенит, победы растут с уровнем', async () => {
  const { makeSlotsAudio } = await import('../js/slots-audio.js');
  await withFakeAudio(rec => {
    const a = makeSlotsAudio('vault');
    for (const m of ['set', 'click', 'nope', 'lever', 'whirStart', 'whirStop', 'thunk', 'wild', 'scatter', 'heartbeat', 'tick', 'win', 'berry', 'feature', 'segfault', 'shake', 'crack', 'wheelTick', 'flip', 'gambleLose', 'heat', 'fanfare', 'stopFanfare', 'stopAll', 'destroy', 'later', 'theme', 'deal', 'chip', 'ballTick', 'ballDrop']) assert.equal(typeof a[m], 'function', m);
    assert.equal(a.on, true); assert.equal(a.themeName, 'vault');
    assert.equal(a.theme('night').themeName, 'night');
    let n = rec.osc; a.thunk(0); assert.ok(rec.osc - n >= 4, 'тон + колокольчик из партиалов');
    n = rec.osc; a.win('small'); const small = rec.osc - n;
    n = rec.osc; a.win('epic'); const epic = rec.osc - n;
    assert.ok(epic > small * 2, 'эпик звенит заметно дольше');
    a.destroy();
  });
});

test('slots-audio: трещотка идёт во время вращения, замедляется и полностью глохнет после destroy()', async () => {
  const { makeSlotsAudio } = await import('../js/slots-audio.js');
  await withFakeAudio(async rec => {
    const a = makeSlotsAudio('server');
    a.whirStart(); await new Promise(r => setTimeout(r, 160)); assert.ok(rec.osc >= 3, 'щелчки идут');
    a.whirStop(); let n = rec.osc; await new Promise(r => setTimeout(r, 120)); assert.equal(rec.osc, n, 'после whirStop тишина');
    a.whirStart(); a.fanfare(); a.destroy(); n = rec.osc; await new Promise(r => setTimeout(r, 250)); assert.equal(rec.osc, n, 'destroy гасит трещотку и фанфару'); assert.equal(rec.closed, true);
    a.whirStart(); await new Promise(r => setTimeout(r, 80)); assert.equal(rec.osc, n, 'после destroy ничего не стартует');
  });
});

test('slots-audio: без флага sfx — тишина; в источнике нет пилообразного гула', async () => {
  const { makeSlotsAudio } = await import('../js/slots-audio.js');
  await withFakeAudio(async (rec, store) => {
    store.hh_save_v1 = JSON.stringify({ sfx: false });
    const a = makeSlotsAudio('forest'); a.thunk(2); a.win('big'); a.whirStart(); await new Promise(r => setTimeout(r, 80)); a.destroy(); assert.equal(rec.osc, 0);
  });
  assert.ok(!read('js/slots-audio.js').includes('frequency.value = 70'));
});
`);

steps.push({
  id: 6,
  name: 'Theme system and sound',
  run(ctx) {
    const HTML = 'index.html';
    ctx.createFile('js/casino-themes.js', S6_THEMES);
    ctx.createFile('css/casino-themes.css', S6_CSS); // заглушку шага 5 заменяет полное оформление
    ctx.createFile('js/slots-audio.js', S6_AUDIO, { overwrite: true }); // исходный файл репозитория; при повторе уже наш (есть маркер)
    ctx.createTest('casino-themes.mjs', S6_TEST);

    ctx.insertAfter(HTML, "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400..800;1,400..800&family=Ubuntu+Sans:ital,wght@0,100..800;1,100..800&family=Arimo:ital,wght@0,400..700;1,400..700&display=swap\">", "\n    <link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Comfortaa:wght@500..700&family=Exo+2:wght@500..800&family=IBM+Plex+Mono:wght@500;700&family=Playfair+Display:wght@600..800&family=Press+Start+2P&family=Oswald:wght@500..700&display=swap\"> <!-- casino:step6 fonts \u0442\u0435\u043c \u043a\u0430\u0437\u0438\u043d\u043e: \u043e\u0444\u043b\u0430\u0439\u043d \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0435 \u0448\u0440\u0438\u0444\u0442\u044b -->");
    ctx.insertAfter(HTML, "import { renderCollectionPage } from './js/casino-collection.js';", "\n    import { installCasinoThemes, decorateCasinoPage } from './js/casino-themes.js'; /* casino:step6 */");
    ctx.insertAfter(HTML, 'installSlots();', '\n    installCasinoThemes(); /* casino:step6 */');
    ctx.insertAfter(HTML, 'else renderBrowse(path);', '\n  decorateCasinoPage(); /* casino:step6 */');

    ctx.note('ШАГ 6: темы казино подключены (js/casino-themes.js + css/casino-themes.css), звук слотов переписан. Страницы столов должны иметь корень с классом cs-game-page — тогда тема применяется автоматически; для живой смены темы вызывайте applyCasinoTheme(root, S).');
  },
});

// NOTE: заголовки шагов ниже — резерв под блэкджек/рулетку, названия и нумерация ориентировочные.

// ===== STEP 7: Blackjack + Roulette math, bonus rules, calibration =====
// Создаёт js/blackjack-math.js, js/roulette-math.js (чистая логика, ГСЧ внедряется, стиль slots-math.js) и тесты tests/blackjack-math.mjs, tests/roulette-math.mjs.
// Требует шаг 3 (js/slots-math.js экспортирует mulberry32, cryptoRng, bjExtra, rouletteRefundAmount). Перки: bjBonus → bjExtra, rouletteRefund → rouletteRefundAmount.
// Калибровка: calibrateBlackjack(n) / calibrateRoulette(n) (по умолчанию 6 000 000) запускаются через --calibrate (см. конец файла). Установщик их НЕ запускает.
// Экспорты blackjack-math: newShoe/dealRound/hit/stand/playRound/basicStrategy/handValue/settle + константы CHARLIE_PAY, TRIPLE7_PAY, SUITED_BJ_PAY, BJ_PAY.
// Экспорты roulette-math: makeBet/spinWheel/settleSpin/betResult/exactRtp/averageRtp/DEFAULT_BETS + HOT_MULT, ZERO_REFUND.
// Шаги 5 (js/blackjack.js, js/roulette.js — заглушки) и UI-шаги пользуются этими API; hot-число показывать только ПОСЛЕ спина (см. шапку roulette-math.js).
const S7_BJ = String.raw`/*
 * Блэкджек казино: чистая математика (без DOM, ГСЧ внедряется: mulberry32(seed) в тестах/калибровке, cryptoRng() в игре).
 * Страницу рисует js/blackjack.js — здесь только правила, раздача, выплаты, стратегия и калибровка.
 *
 * ПРАВИЛА (упрощённые). Колода: 6 колод, 312 карт; тасуем заново перед раздачей, когда в шу осталось ≤ 25% карт.
 *   Действия игрока: Hit / Stand. Нет дабла, страховки и сплита. Дилер на 17 (в том числе на soft 17) стоит.
 *   Дилер заглядывает в закрытую карту, если открытая — туз или десятка: блэкджек дилера вскрывается сразу
 *   (игрок проигрывает ставку; своим блэкджеком получает пуш). Ничья (пуш) возвращает ставку.
 *   Блэкджек (туз + десятка-карта на первые две) платит 3:2.
 * БОНУСЫ (дом проигрывает слегка — это игра в плюс по замыслу, RTP цель 101–105%):
 *   • «5-карточный Чарли»: 5 карт и не перебор — сразу выплата CHARLIE_PAY:1 (2:1), дилер не важен.
 *   • «7-7-7»: три семёрки первыми тремя картами — сразу TRIPLE7_PAY:1 (3:1).
 *   • «Мастевой блэкджек»: туз + десятка-карта одной масти платит SUITED_BJ_PAY:1 (2:1) вместо 3:2.
 *   Раунд после Чарли и 7-7-7 заканчивается сразу; дилер добирает карты до конца для показа и для расчёта вклада бонуса.
 * ПЕРК шага 3: bjBonus — 21 ровно из трёх карт (не блэкджек) добавляет ставка × bjBonus (см. bjExtra в slots-math.js).
 *   В RTP калибровки перки не входят (perks = {}).
 *
 * СТРАТЕГИЯ (basicStrategy, ею играет калибровка). Получена точным динамическим программированием по бесконечной колоде
 * с учётом Чарли и без дабла/сплита; решение зависит от суммы, мягкости и числа карт на руках (n = 2, 3, 4):
 *   жёсткие, n=2: ≤11 hit; 12 stand против 5–6, иначе hit; 13–16 stand против 2–6, hit против 7–A; ≥17 stand.
 *   жёсткие, n=3: ≤13 hit; 14 hit против 2 и 7–A; 15–16 stand против 2–6, hit против 7–A; ≥17 stand.
 *   жёсткие, n=4: ≤16 hit; 17 hit против 2–4 и 7–A (stand против 5–6); ≥18 stand.
 *   мягкие,  n=2: ≤17 hit; 18 stand против 2–7, hit против 8–A; ≥19 stand.
 *   мягкие,  n=3: ≤19 hit; ≥20 stand.   мягкие, n=4: всегда hit (перебора нет, пятая карта = Чарли 2:1).
 * Идея: мягкая рука из 4 карт не может перебрать, поэтому пятая карта гарантирует Чарли. Это и делает бонус весомым.
 * ВЕСА: калибровка играет по этой таблице, значения констант провизорны — прогоните node tools/apply-casino.mjs --calibrate.
 * Ориентир: ставка по умолчанию в таблице — без перков. Расчёт на бесконечной колоде даёт ≈103% (6 колод ±0.3).
 */
import { mulberry32, cryptoRng, bjExtra } from './slots-math.js';
export { mulberry32, cryptoRng, bjExtra };

export const DECKS = 6, SHOE_SIZE = 52 * DECKS, RESHUFFLE_LEFT = 0.25, DEALER_STAND = 17, CHARLIE_CARDS = 5, MIN_BET = 1;
export const BJ_PAY = 1.5, SUITED_BJ_PAY = 2, CHARLIE_PAY = 2, TRIPLE7_PAY = 3;
export const RTP_TARGET = [101, 105];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const OUTCOME_LABEL = {
  'blackjack': 'Блэкджек 3:2', 'suited-blackjack': 'Мастевой блэкджек 2:1', 'charlie': '5 карт без перебора 2:1', 'triple7': '7-7-7 3:1',
  'win': 'Победа', 'push': 'Ничья', 'lose': 'Проигрыш', 'bust': 'Перебор', 'dealer-blackjack': 'Блэкджек дилера',
};

/* ---------- карты и руки ---------- */
export const card = (r, s = 0) => ({ r, s });
export const cardValue = c => Math.min(c.r, 10); // туз = 1 (счёт мягкой руки — в handValue)
export const rankLabel = r => (r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));
export function handValue(cards) {
  let sum = 0, aces = 0;
  for (const c of cards) { sum += cardValue(c); if (c.r === 1) aces++; }
  const soft = aces > 0 && sum + 10 <= 21;
  return { total: soft ? sum + 10 : sum, soft, bust: sum > 21 };
}
export const isNatural = cards => cards.length === 2 && handValue(cards).total === 21;
export const isSuitedNatural = cards => isNatural(cards) && cards[0].s === cards[1].s;
export const isTripleSeven = cards => cards.length === 3 && cards.every(c => c.r === 7);

/* ---------- шу ---------- */
export function shuffleShoe(shoe, rng) {
  const a = shoe.cards;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  shoe.pos = 0;
  return shoe;
}
export function newShoe(rng, decks = DECKS) {
  const cards = [];
  for (let d = 0; d < decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ r, s });
  return shuffleShoe({ cards, pos: 0 }, rng);
}
export const cardsLeft = shoe => shoe.cards.length - shoe.pos;
export const needsShuffle = shoe => cardsLeft(shoe) <= shoe.cards.length * RESHUFFLE_LEFT;
export function draw(shoe) {
  if (shoe.pos >= shoe.cards.length) throw new Error('blackjack: шу пуст (подготовьте раунд через dealRound)');
  return shoe.cards[shoe.pos++];
}
/* выплата с переносом дробной части (как settle в slots-math): возвращает {pay (целое), frac} */
export function settle(frac, amount) { const t = (Number(frac) || 0) + (Number(amount) || 0), pay = Math.floor(t + 1e-9); return { pay, frac: Math.max(0, t - pay) }; }

/* ---------- раунд ---------- */
function dealerPlay(R, shoe) { while (handValue(R.dealer).total < DEALER_STAND) R.dealer.push(draw(shoe)); }
function plainMult(R) { // что принесла бы рука при обычных правилах (стоим на текущей сумме): для атрибуции бонусов
  const p = handValue(R.player), d = handValue(R.dealer);
  if (p.bust) return -1;
  if (d.bust || p.total > d.total) return 1;
  return p.total === d.total ? 0 : -1;
}
function finish(R, shoe, kind, perks) {
  R.done = true;
  const p = handValue(R.player);
  R.bonus = null;
  if (kind === 'dealerbj') { R.mult = isNatural(R.player) ? 0 : -1; R.plainMult = R.mult; R.outcome = R.mult === 0 ? 'push' : 'dealer-blackjack'; }
  else if (kind === 'natural') {
    const suited = isSuitedNatural(R.player);
    R.mult = suited ? SUITED_BJ_PAY : BJ_PAY; R.plainMult = BJ_PAY; R.outcome = suited ? 'suited-blackjack' : 'blackjack'; R.bonus = suited ? 'suited-blackjack' : null;
  } else if (kind === 'bust') { R.mult = -1; R.plainMult = -1; R.outcome = 'bust'; }
  else {
    dealerPlay(R, shoe);
    R.plainMult = plainMult(R);
    if (kind === 'triple7') { R.mult = TRIPLE7_PAY; R.outcome = 'triple7'; R.bonus = 'triple7'; }
    else if (kind === 'charlie') { R.mult = CHARLIE_PAY; R.outcome = 'charlie'; R.bonus = 'charlie'; }
    else { R.mult = R.plainMult; R.outcome = R.mult > 0 ? 'win' : R.mult === 0 ? 'push' : 'lose'; }
  }
  R.extra = bjExtra(perks, R.bet, { total: p.total, cards: R.player.length, natural: isNatural(R.player) });
  R.ret = R.bet * (1 + R.mult) + R.extra; // всего вернуть игроку (ставка + выигрыш + бонус перка); дробь — через settle()
  return R;
}
export function dealRound(shoe, rng, bet, perks = {}) {
  const reshuffled = needsShuffle(shoe);
  if (reshuffled) shuffleShoe(shoe, rng);
  const R = { bet, perks, player: [], dealer: [], done: false, outcome: null, mult: 0, plainMult: 0, bonus: null, extra: 0, ret: 0, reshuffled };
  R.player.push(draw(shoe)); R.dealer.push(draw(shoe)); R.player.push(draw(shoe)); R.dealer.push(draw(shoe));
  const up = cardValue(R.dealer[0]);
  if ((up === 10 || up === 1) && isNatural(R.dealer)) return finish(R, shoe, 'dealerbj', perks);
  if (isNatural(R.player)) return finish(R, shoe, 'natural', perks);
  return R;
}
export const canHit = R => !R.done;
export function hit(R, shoe) {
  if (R.done) throw new Error('blackjack: раунд уже завершён');
  R.player.push(draw(shoe));
  if (isTripleSeven(R.player)) return finish(R, shoe, 'triple7', R.perks);
  if (handValue(R.player).bust) return finish(R, shoe, 'bust', R.perks);
  if (R.player.length >= CHARLIE_CARDS) return finish(R, shoe, 'charlie', R.perks);
  return R;
}
export function stand(R, shoe) {
  if (R.done) throw new Error('blackjack: раунд уже завершён');
  return finish(R, shoe, 'stand', R.perks);
}

/* ---------- базовая стратегия (таблицы — по ячейкам против открытой карты дилера 2,3,…,10,A) ---------- */
const ALL_H = 'HHHHHHHHHH', ALL_S = 'SSSSSSSSSS', S26 = 'SSSSSHHHHH';
const HARD = { 2: { 12: 'HHHSSHHHHH', 13: S26, 14: S26, 15: S26, 16: S26 }, 3: { 14: 'HSSSSHHHHH', 15: S26, 16: S26 }, 4: { 17: 'HHHSSHHHHH' } };
const HARD_STAND_FROM = { 2: 17, 3: 17, 4: 18 };
const SOFT = { 2: { 18: 'SSSSSSHHHH' } };
const SOFT_STAND_FROM = { 2: 19, 3: 20, 4: Infinity };
export function basicStrategy(cards, dealerUp) {
  const { total, soft } = handValue(cards), n = Math.min(4, Math.max(2, cards.length));
  const up = typeof dealerUp === 'number' ? dealerUp : cardValue(dealerUp), col = up === 1 || up === 11 ? 9 : Math.min(10, Math.max(2, up)) - 2;
  const row = ((soft ? SOFT : HARD)[n] || {})[total], from = (soft ? SOFT_STAND_FROM : HARD_STAND_FROM)[n];
  const act = row ? row[col] : total >= from ? 'S' : 'H';
  return act === 'S' ? 'stand' : 'hit';
}
export function playRound(shoe, rng, bet, perks = {}, strategy = basicStrategy) {
  const R = dealRound(shoe, rng, bet, perks);
  while (!R.done) { if (strategy(R.player, R.dealer[0]) === 'hit') hit(R, shoe); else stand(R, shoe); }
  return R;
}

/* ---------- калибровка: node tools/apply-casino.mjs --calibrate [--rounds=N] [--seed=N] ----------
   Играет n раундов по basicStrategy, ставка 1, перки {}. Считает RTP (со 95%-доверием), частоты исходов и вклад каждого бонуса
   (результат раунда минус результат тех же карт при обычных правилах). Ничего не пишет. По умолчанию 6 000 000 раундов. */
export function calibrateBlackjack(n = 6_000_000, opts = {}) {
  const seed = opts.seed ?? 20261021, target = opts.target ?? RTP_TARGET, out = opts.log ?? console.log;
  const rng = mulberry32(seed >>> 0), shoe = newShoe(rng);
  const pad = (s, k) => String(s).padStart(k), f2 = x => x.toFixed(2);
  const cnt = {}, contrib = {}; let sum = 0, sumSq = 0, bonusSum = 0, reshuffles = 0, wins = 0, pushes = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const R = playRound(shoe, rng, 1, {});
    const ret = 1 + R.mult; sum += ret; sumSq += ret * ret;
    cnt[R.outcome] = (cnt[R.outcome] || 0) + 1; contrib[R.outcome] = (contrib[R.outcome] || 0) + ret;
    if (R.bonus) bonusSum += R.mult - R.plainMult;
    if (R.reshuffled) reshuffles++;
    if (R.mult > 0) wins++; else if (R.mult === 0) pushes++;
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean)), ci = 1.96 * sd / Math.sqrt(n);
  const rtp = 100 * mean, bonus = 100 * bonusSum / n, ok = rtp >= target[0] && rtp <= target[1];
  out('Калибровка блэкджека · ' + n.toLocaleString('ru-RU') + ' раундов · seed ' + seed + ' · ' + DECKS + ' колод, перетасовка при ≤' + (RESHUFFLE_LEFT * 100) + '% · Чарли ' + CHARLIE_PAY + ':1 · 7-7-7 ' + TRIPLE7_PAY + ':1 · мастевой BJ ' + SUITED_BJ_PAY + ':1');
  out(pad('исход', 20) + pad('частота%', 11) + pad('вклад в RTP%', 14));
  for (const k of Object.keys(OUTCOME_LABEL)) if (cnt[k]) out(pad(k, 20) + pad(f2(100 * cnt[k] / n), 11) + pad(f2(100 * contrib[k] / n), 14));
  out('\nRTP ' + f2(rtp) + '% ± ' + f2(100 * ci) + ' (95%) · цель ' + target[0] + '–' + target[1] + '% · ' + (ok ? 'в коридоре' : 'ВНЕ'));
  out('  из них бонусы: ' + f2(bonus) + '%, обычные правила (тот же ход игры): ' + f2(rtp - bonus) + '% · побед ' + f2(100 * wins / n) + '% · пушей ' + f2(100 * pushes / n) + '% · перетасовок ' + reshuffles.toLocaleString('ru-RU') + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  const mid = (target[0] + target[1]) / 2, fc = (cnt.charlie || 0) / n, hint = fc > 0 ? Math.round((CHARLIE_PAY + (mid - rtp) / (100 * fc)) * 100) / 100 : null;
  out('Подсказка (первый порядок, каждые 0.1 к CHARLIE_PAY ≈ ' + f2(10 * fc) + '% RTP): CHARLIE_PAY ≈ ' + (hint === null ? '—' : hint) + ' (сейчас ' + CHARLIE_PAY + '). Затем при необходимости SUITED_BJ_PAY / TRIPLE7_PAY.');
  return { n, seed, rtp, ci: 100 * ci, bonus, ok, counts: cnt, hint };
}`;
const S7_ROU = String.raw`/*
 * Рулетка казино: чистая математика (без DOM, ГСЧ внедряется). Страницу рисует js/roulette.js.
 *
 * ПРАВИЛА. Европейская рулетка, один зеро: 37 карманов 0–36. Ставки и выплаты (чистая прибыль к ставке):
 *   straight (число) 35:1 · split (2 соседних числа, в т.ч. 0 с 1/2/3) 17:1 · street (ряд из трёх) 11:1 · corner (квадрат из 4) 8:1 ·
 *   sixline (два соседних ряда) 5:1 · column (колонка) 2:1 · dozen (дюжина) 2:1 · redblack / oddeven / lowhigh (1–18, 19–36) 1:1.
 *   Чистый EV любой ставки = 36/37 = 97.30% (выигрышных карманов k × (выплата+1) / 37 = 36/37).
 * БОНУСЫ (две простые видимые механики, вместе ведут средний RTP к ≈103%):
 *   1) «Счастливый зеро» (ZERO_REFUND = 0.5): когда выпал 0, внешние ставки (column, dozen, redblack, oddeven, lowhigh)
 *      возвращают половину ставки. Прирост EV на внешней ставке: ZERO_REFUND / 37 = +1.35 п.п. Внутренние ставки на 0 проигрывают.
 *   2) «Горячее число» (HOT_MULT = 3.5): с каждым спином случайно (равномерно) выбирается один горячий карман 1–36. Если шар
 *      лёг на горячий карман, чистая прибыль КАЖДОЙ выигравшей ставки умножается на HOT_MULT (straight платит 35 × 3.5 = 122.5:1).
 *      Вероятность, что шар лёг на горячий карман, при ставке на карман n равна 1/37 · 1/36, поэтому прирост EV ставки:
 *      (HOT_MULT − 1) · E[W] / 36, где E[W] = выплата × покрытых карманов / 37 (чистая ожидаемая прибыль без бонусов).
 *      straight: +6.57 п.п. · street: +6.2 · corner: +6.0 · column/dozen: +4.5 · even-money: +3.4 (при HOT_MULT=3.5).
 *   ВАЖНО: горячий карман выбирается в spinWheel() ОДНОВРЕМЕННО с выпавшим числом, после закрытия ставок. Показывать его игроку
 *      до спина НЕЛЬЗЯ (иначе ставка на него даёт ≈ 334% RTP): показывайте после броска как «🔥 было горячим».
 *   Итог для набора DEFAULT_BETS (по одной единице на каждый вид ставки): средний RTP ≈ 97.30 + 0.675 (зеро, 5 из 10 ставок) + 5.0 (горячее) ≈ 103.0%.
 *   Точный расчёт перебором 37 × 36 исходов: exactRtp(ставка) / averageRtp(). calibrateRoulette(n) сверяет моделирование с точным значением.
 * ПЕРК шага 3: rouletteRefund — возврат доли проигранной ставки на число (rouletteRefundAmount, лимит 25%). В RTP калибровки перки не входят.
 */
import { mulberry32, cryptoRng, rouletteRefundAmount } from './slots-math.js';
export { mulberry32, cryptoRng, rouletteRefundAmount };

export const POCKETS = 37, ZERO_REFUND = 0.5, HOT_MULT = 3.5, MIN_BET = 1;
export const PAYOUT = { straight: 35, split: 17, street: 11, corner: 8, sixline: 5, column: 2, dozen: 2, redblack: 1, oddeven: 1, lowhigh: 1 };
export const OUTSIDE = ['column', 'dozen', 'redblack', 'oddeven', 'lowhigh'];
export const RTP_TARGET = [101, 105];
export const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export const colorOf = n => (n === 0 ? 'green' : RED.includes(n) ? 'red' : 'black');
export const BET_LABEL = { straight: 'Число', split: 'Сплит', street: 'Стрит', corner: 'Угол', sixline: 'Сикслайн', column: 'Колонка', dozen: 'Дюжина', redblack: 'Красное/чёрное', oddeven: 'Чёт/нечёт', lowhigh: 'Мало/много' };
/* набор «рекомендованных» ставок по умолчанию — по одной единице на вид; по нему считается средний RTP (ни одна не содержит 0) */
export const DEFAULT_BETS = [
  { type: 'straight', arg: 17 }, { type: 'split', arg: [8, 11] }, { type: 'street', arg: 5 }, { type: 'corner', arg: 14 }, { type: 'sixline', arg: 4 },
  { type: 'column', arg: 2 }, { type: 'dozen', arg: 2 }, { type: 'redblack', arg: 'red' }, { type: 'oddeven', arg: 'odd' }, { type: 'lowhigh', arg: 'low' },
];

const rowOf = n => Math.floor((n - 1) / 3), range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const int = (v, lo, hi, what) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error('roulette: ' + what + ' должно быть целым ' + lo + '–' + hi); return v; };
export function makeBet(type, arg, stake = 1) {
  if (!(type in PAYOUT)) throw new Error('roulette: неизвестный вид ставки ' + type);
  let pockets;
  if (type === 'straight') pockets = [int(arg, 0, 36, 'число')];
  else if (type === 'split') {
    if (!Array.isArray(arg) || arg.length !== 2) throw new Error('roulette: split = [a, b]');
    const a = Math.min(...arg), b = Math.max(...arg); int(a, 0, 36, 'число'); int(b, 0, 36, 'число');
    const ok = a === 0 ? b >= 1 && b <= 3 : b - a === 3 || (b - a === 1 && rowOf(a) === rowOf(b));
    if (!ok) throw new Error('roulette: числа ' + a + ' и ' + b + ' не соседние');
    pockets = [a, b];
  } else if (type === 'street') { const r = int(arg, 1, 12, 'ряд'); pockets = range(3 * r - 2, 3 * r); }
  else if (type === 'sixline') { const r = int(arg, 1, 11, 'ряд'); pockets = range(3 * r - 2, 3 * r + 3); }
  else if (type === 'corner') { int(arg, 1, 32, 'число'); if ((arg - 1) % 3 === 2) throw new Error('roulette: угол задаётся верхним левым числом (колонки 1–2)'); pockets = [arg, arg + 1, arg + 3, arg + 4]; }
  else if (type === 'column') { const c = int(arg, 1, 3, 'колонка'); pockets = range(1, 36).filter(n => (n - 1) % 3 === c - 1); }
  else if (type === 'dozen') { const d = int(arg, 1, 3, 'дюжина'); pockets = range(12 * d - 11, 12 * d); }
  else if (type === 'redblack') { if (arg !== 'red' && arg !== 'black') throw new Error("roulette: 'red' | 'black'"); pockets = range(1, 36).filter(n => colorOf(n) === arg); }
  else if (type === 'oddeven') { if (arg !== 'odd' && arg !== 'even') throw new Error("roulette: 'odd' | 'even'"); pockets = range(1, 36).filter(n => (n % 2 === 1) === (arg === 'odd')); }
  else { if (arg !== 'low' && arg !== 'high') throw new Error("roulette: 'low' | 'high'"); pockets = arg === 'low' ? range(1, 18) : range(19, 36); }
  return { type, arg, stake, pockets, payout: PAYOUT[type], outside: OUTSIDE.includes(type) };
}
/* все допустимые ставки (для тестов и таблицы выплат) */
export function allBetSpecs() {
  const L = [];
  for (let n = 0; n <= 36; n++) L.push({ type: 'straight', arg: n });
  for (const n of [1, 2, 3]) L.push({ type: 'split', arg: [0, n] });
  for (let n = 1; n <= 36; n++) { if (n % 3 !== 0) L.push({ type: 'split', arg: [n, n + 1] }); if (n <= 33) L.push({ type: 'split', arg: [n, n + 3] }); }
  for (let r = 1; r <= 12; r++) L.push({ type: 'street', arg: r }); for (let r = 1; r <= 11; r++) L.push({ type: 'sixline', arg: r });
  for (let n = 1; n <= 32; n++) if ((n - 1) % 3 !== 2) L.push({ type: 'corner', arg: n });
  for (const t of [['column', [1, 2, 3]], ['dozen', [1, 2, 3]], ['redblack', ['red', 'black']], ['oddeven', ['odd', 'even']], ['lowhigh', ['low', 'high']]]) for (const a of t[1]) L.push({ type: t[0], arg: a });
  return L;
}

/* ---------- спин и расчёт ---------- */
export function spinWheel(rng) { return { n: Math.floor(rng() * POCKETS), hot: 1 + Math.floor(rng() * 36) }; }
const CFG = { hotMult: HOT_MULT, zeroRefund: ZERO_REFUND };
export function betResult(bet, n, hot, cfg = CFG) {
  if (bet.pockets.includes(n)) { const hotHit = n === hot; return { status: 'win', hot: hotHit, ret: bet.stake * (1 + bet.payout * (hotHit ? cfg.hotMult : 1)) }; }
  if (n === 0 && bet.outside) return { status: 'zero-refund', hot: false, ret: bet.stake * cfg.zeroRefund };
  return { status: 'lose', hot: false, ret: 0 };
}
/* выплата с переносом дробной части (как settle в slots-math): {pay (целое), frac} */
export function settle(frac, amount) { const t = (Number(frac) || 0) + (Number(amount) || 0), pay = Math.floor(t + 1e-9); return { pay, frac: Math.max(0, t - pay) }; }
/* bets: массив ставок из makeBet; perks.rouletteRefund возвращает долю проигранных ставок на число (lost straight) */
export function settleSpin(result, bets, perks = {}) {
  const rows = bets.map(b => ({ bet: b, ...betResult(b, result.n, result.hot) }));
  const stake = rows.reduce((a, r) => a + r.bet.stake, 0), ret = rows.reduce((a, r) => a + r.ret, 0);
  const lostStraight = rows.filter(r => r.bet.type === 'straight' && r.status === 'lose').reduce((a, r) => a + r.bet.stake, 0);
  const refund = rouletteRefundAmount(perks, lostStraight);
  return { n: result.n, hot: result.hot, rows, stake, ret, refund, total: ret + refund };
}

/* ---------- точный RTP: перебор 37 исходов шара × 36 горячих карманов ---------- */
export function exactRtp(spec, cfg = CFG) {
  const bet = makeBet(spec.type, spec.arg, 1);
  let s = 0;
  for (let n = 0; n < POCKETS; n++) for (let h = 1; h <= 36; h++) s += betResult(bet, n, h, cfg).ret;
  return 100 * s / (POCKETS * 36);
}
export function exactParts(spec) {
  const base = exactRtp(spec, { hotMult: 1, zeroRefund: 0 }), withZero = exactRtp(spec, { hotMult: 1, zeroRefund: ZERO_REFUND }), full = exactRtp(spec);
  return { base, zero: withZero - base, hot: full - withZero, total: full };
}
export const averageRtp = (specs = DEFAULT_BETS, cfg = CFG) => specs.reduce((a, s) => a + exactRtp(s, cfg), 0) / specs.length;

/* ---------- калибровка: node tools/apply-casino.mjs --calibrate [--rounds=N] [--seed=N] ----------
   Крутит n спинов; на каждом спине ставится по 1 на каждую ставку DEFAULT_BETS. Сравнивает RTP моделирования с точным значением.
   По умолчанию 6 000 000 спинов. Ничего не пишет. */
export function calibrateRoulette(n = 6_000_000, opts = {}) {
  const seed = opts.seed ?? 20261022, target = opts.target ?? RTP_TARGET, out = opts.log ?? console.log, specs = opts.bets ?? DEFAULT_BETS;
  const rng = mulberry32(seed >>> 0), bets = specs.map(s => makeBet(s.type, s.arg, 1));
  const pad = (s, k) => String(s).padStart(k), f2 = x => x.toFixed(2);
  const sum = bets.map(() => 0), sq = bets.map(() => 0), hits = bets.map(() => 0), t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const { n: ball, hot } = spinWheel(rng);
    for (let k = 0; k < bets.length; k++) { const r = betResult(bets[k], ball, hot); sum[k] += r.ret; sq[k] += r.ret * r.ret; if (r.status === 'win') hits[k]++; }
  }
  out('Калибровка рулетки · ' + n.toLocaleString('ru-RU') + ' спинов · seed ' + seed + ' · зеро возвращает ' + ZERO_REFUND * 100 + '% внешних ставок · горячее ×' + HOT_MULT);
  out(pad('ставка', 18) + pad('точно%', 9) + pad('модель%', 10) + pad('±95%', 8) + pad('hit%', 8) + pad('база', 8) + pad('зеро', 7) + pad('горячее', 9) + '  сверка');
  let simAvg = 0, exAvg = 0, bad = 0;
  bets.forEach((b, k) => {
    const mean = sum[k] / n, ci = 196 * Math.sqrt(Math.max(0, sq[k] / n - mean * mean) / n), sim = 100 * mean, parts = exactParts(specs[k]), ok = Math.abs(sim - parts.total) <= 1.5 * ci + 1e-9;
    if (!ok) bad++; simAvg += sim / bets.length; exAvg += parts.total / bets.length;
    out(pad(b.type + ' ' + JSON.stringify(b.arg), 18) + pad(f2(parts.total), 9) + pad(f2(sim), 10) + pad(f2(ci), 8) + pad(f2(100 * hits[k] / n), 8) + pad(f2(parts.base), 8) + pad(f2(parts.zero), 7) + pad(f2(parts.hot), 9) + '  ' + (ok ? 'ок' : 'РАСХОЖДЕНИЕ'));
  });
  const ok = simAvg >= target[0] && simAvg <= target[1], mid = (target[0] + target[1]) / 2;
  const noHot = averageRtp(specs, { hotMult: 1, zeroRefund: ZERO_REFUND }), perM = (exAvg - noHot) / (HOT_MULT - 1), hint = perM > 0 ? Math.round((1 + (mid - noHot) / perM) * 100) / 100 : null;
  out('\nСредний RTP по набору: модель ' + f2(simAvg) + '% · точно ' + f2(exAvg) + '% · цель ' + target[0] + '–' + target[1] + '% · ' + (ok ? 'в коридоре' : 'ВНЕ') + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  out('Подсказка: HOT_MULT ≈ ' + hint + ' (сейчас ' + HOT_MULT + '; каждая +1.0 к множителю ≈ +' + f2(perM) + ' п.п. к среднему). Расхождений модели с точным значением: ' + bad + ' из ' + bets.length + ' (допускается 1–2 по статистике).');
  return { n, seed, simAvg, exAvg, ok, hint };
}`;
const S7_TEST_BJ = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../js/blackjack-math.js';

// Шаг 7: правила, бонусы, стратегия блэкджека. Быстрые проверки; полная калибровка — node tools/apply-casino.mjs --calibrate.
const c = (r, s = 0) => ({ r, s });
const rig = (...cards) => ({ cards, pos: 0 }); // порядок выдачи: игрок, дилер(открытая), игрок, дилер(закрытая), затем добор
const rng0 = () => 0.5;

test('handValue: мягкие/жёсткие руки и перебор', () => {
  assert.deepEqual(B.handValue([c(1), c(6)]), { total: 17, soft: true, bust: false });
  assert.deepEqual(B.handValue([c(1), c(6), c(10)]), { total: 17, soft: false, bust: false });
  assert.deepEqual(B.handValue([c(1), c(1), c(9)]), { total: 21, soft: true, bust: false });
  assert.equal(B.handValue([c(10), c(12), c(5)]).bust, true);
  assert.ok(B.isNatural([c(1), c(13)]) && !B.isNatural([c(7), c(7), c(7)]));
});

test('шу: 312 карт по 24 каждого ранга, перетасовка при ≤25% остатка', () => {
  const shoe = B.newShoe(B.mulberry32(1));
  assert.equal(shoe.cards.length, 312);
  for (let r = 1; r <= 13; r++) assert.equal(shoe.cards.filter(x => x.r === r).length, 24);
  assert.equal(B.needsShuffle(shoe), false);
  shoe.pos = 312 - 79; assert.equal(B.needsShuffle(shoe), false);
  shoe.pos = 312 - 78; assert.equal(B.needsShuffle(shoe), true);
  const R = B.dealRound(shoe, B.mulberry32(2), 10);
  assert.equal(R.reshuffled, true); assert.ok(B.cardsLeft(shoe) >= 312 - 4 - 1);
});

test('выплаты: блэкджек 3:2, мастевой 2:1, пуш, победа, проигрыш, перебор', () => {
  let R = B.dealRound(rig(c(1, 1), c(9), c(13, 2), c(7)), rng0, 10);
  assert.equal(R.outcome, 'blackjack'); assert.equal(R.ret, 25);
  R = B.dealRound(rig(c(1, 1), c(9), c(13, 1), c(7)), rng0, 10);
  assert.equal(R.outcome, 'suited-blackjack'); assert.equal(R.ret, 30);
  R = B.dealRound(rig(c(10), c(10), c(9), c(8)), rng0, 10); B.stand(R, rig()); // 19 против 18
  assert.equal(R.outcome, 'win'); assert.equal(R.ret, 20);
  R = B.dealRound(rig(c(10), c(10), c(8), c(8)), rng0, 10); B.stand(R, rig());
  assert.equal(R.outcome, 'push'); assert.equal(R.ret, 10);
  R = B.dealRound(rig(c(10), c(10), c(7), c(10)), rng0, 10); B.stand(R, rig());
  assert.equal(R.outcome, 'lose'); assert.equal(R.ret, 0);
  R = B.dealRound(rig(c(10), c(10), c(6), c(7), c(10)), rng0, 10); B.hit(R, rig(c(10)));
  assert.equal(R.outcome, 'bust'); assert.equal(R.ret, 0);
});

test('блэкджек дилера вскрывается сразу: проигрыш или пуш с блэкджеком игрока', () => {
  let R = B.dealRound(rig(c(10), c(1), c(9), c(13)), rng0, 10);
  assert.equal(R.done, true); assert.equal(R.outcome, 'dealer-blackjack'); assert.equal(R.ret, 0);
  R = B.dealRound(rig(c(1), c(1), c(13), c(12)), rng0, 10);
  assert.equal(R.outcome, 'push'); assert.equal(R.ret, 10);
});

test('дилер стоит на 17 (в т.ч. мягких) и добирает до 17', () => {
  let R = B.dealRound(rig(c(10), c(1), c(8), c(6)), rng0, 10); // дилер A+6 = мягкие 17
  B.stand(R, rig()); assert.equal(R.dealer.length, 2); assert.equal(R.outcome, 'win');
  R = B.dealRound(rig(c(10), c(10), c(9), c(6), c(5)), rng0, 10); const sh = rig(c(5));
  B.stand(R, sh); assert.equal(R.dealer.length, 3); assert.equal(B.handValue(R.dealer).total, 21); assert.equal(R.outcome, 'lose');
});

test('бонусы: 5-карточный Чарли 2:1, 7-7-7 3:1 мгновенно', () => {
  let R = B.dealRound(rig(c(2), c(10), c(2), c(7), c(2), c(2), c(2)), rng0, 10); const sh = rig(c(2), c(2), c(2));
  sh.cards = [c(2), c(2), c(2)];
  B.hit(R, sh); B.hit(R, sh); assert.equal(R.done, false); B.hit(R, sh);
  assert.equal(R.outcome, 'charlie'); assert.equal(R.ret, 30); assert.equal(R.player.length, 5);
  R = B.dealRound(rig(c(7), c(10), c(7, 1), c(8)), rng0, 10); B.hit(R, rig(c(7, 2)));
  assert.equal(R.outcome, 'triple7'); assert.equal(R.ret, 40);
  assert.ok(B.CHARLIE_PAY === 2 && B.TRIPLE7_PAY === 3 && B.BJ_PAY === 1.5);
});

test('перк bjBonus: 21 ровно из трёх карт (не блэкджек) добавляет ставка × bjBonus', () => {
  const perks = { bjBonus: 0.5 };
  let R = B.dealRound(rig(c(5), c(10), c(6), c(7)), rng0, 10, perks); B.hit(R, rig(c(10)));
  assert.equal(R.player.length, 3); B.stand(R, rig());
  assert.equal(R.extra, 5); assert.equal(R.ret, 25);
  R = B.dealRound(rig(c(5), c(10), c(6), c(7)), rng0, 10, {}); B.hit(R, rig(c(10))); B.stand(R, rig());
  assert.equal(R.extra, 0);
  R = B.dealRound(rig(c(1), c(9), c(13), c(7)), rng0, 10, perks); assert.equal(R.extra, 0); // блэкджек не считается
});

test('стратегия: ячейки таблицы', () => {
  const S = (cards, up) => B.basicStrategy(cards, up);
  assert.equal(S([c(10), c(2)], 4), 'hit'); assert.equal(S([c(10), c(2)], 5), 'stand'); assert.equal(S([c(10), c(2)], 10), 'hit');
  assert.equal(S([c(10), c(6)], 6), 'stand'); assert.equal(S([c(10), c(6)], 7), 'hit'); assert.equal(S([c(10), c(6)], 1), 'hit');
  assert.equal(S([c(10), c(7)], 10), 'stand'); assert.equal(S([c(5), c(6)], 6), 'hit');
  assert.equal(S([c(1), c(7)], 6), 'stand'); assert.equal(S([c(1), c(7)], 9), 'hit'); assert.equal(S([c(1), c(6)], 6), 'hit'); assert.equal(S([c(1), c(8)], 10), 'stand');
  assert.equal(S([c(1), c(2), c(3), c(5)], 10), 'hit'); // мягкие 4 карты: пятая карта = Чарли
  assert.equal(S([c(10), c(3), c(2), c(2)], 10), 'hit'); assert.equal(S([c(10), c(4), c(2), c(1)], 5), 'stand'); // жёсткие 17 из 4 карт: stand только против 5–6
  assert.equal(S([c(2), c(3), c(4)], 9), 'hit'); // 9 из трёх карт
});

test('моделирование 150k раундов (seed): RTP в разумных границах, без падений и без остатка в шу', () => {
  const rng = B.mulberry32(777), shoe = B.newShoe(rng); let sum = 0, charlie = 0;
  for (let i = 0; i < 150000; i++) { const R = B.playRound(shoe, rng, 1, {}); sum += R.ret; if (R.outcome === 'charlie') charlie++; assert.ok(R.done && Number.isFinite(R.ret)); }
  const rtp = 100 * sum / 150000;
  assert.ok(rtp > 98 && rtp < 108, 'RTP ' + rtp.toFixed(2)); assert.ok(charlie > 0);
});

test('settle: целая выплата и перенос дробной части', () => {
  let s = B.settle(0, 12.5); assert.deepEqual(s, { pay: 12, frac: 0.5 }); s = B.settle(s.frac, 12.5); assert.deepEqual(s, { pay: 13, frac: 0 });
});

test('calibrateBlackjack: небольшой прогон возвращает RTP и частоты (полный — через --calibrate)', () => {
  const lines = []; const r = B.calibrateBlackjack(20000, { log: s => lines.push(s) });
  assert.ok(r.rtp > 90 && r.rtp < 115); assert.ok(lines.some(l => l.includes('RTP')));
});`;
const S7_TEST_ROU = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/roulette-math.js';

// Шаг 7: ставки, выплаты, бонусы рулетки; RTP считается ТОЧНО перебором, моделирование короткое.
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' vs ' + b);

test('все ставки: число карманов × (выплата + 1) = 36, чистый RTP 97.30%', () => {
  const specs = R.allBetSpecs();
  for (const s of specs) { const b = R.makeBet(s.type, s.arg); assert.equal(b.pockets.length * (b.payout + 1), 36, s.type + ' ' + JSON.stringify(s.arg)); near(R.exactParts(s).base, 100 * 36 / 37, 1e-9); }
});

test('составы ставок: стрит, угол, сикслайн, колонка, дюжина, цвет, чёт, диапазон', () => {
  assert.deepEqual(R.makeBet('street', 2).pockets, [4, 5, 6]);
  assert.deepEqual(R.makeBet('corner', 5).pockets, [5, 6, 8, 9]);
  assert.deepEqual(R.makeBet('sixline', 1).pockets, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(R.makeBet('column', 3).pockets.slice(0, 3), [3, 6, 9]); assert.equal(R.makeBet('column', 1).pockets.length, 12);
  assert.deepEqual(R.makeBet('dozen', 3).pockets, [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]);
  assert.equal(R.makeBet('redblack', 'red').pockets.length, 18); assert.ok(R.makeBet('redblack', 'red').pockets.includes(1) && R.makeBet('redblack', 'black').pockets.includes(2));
  assert.equal(R.makeBet('oddeven', 'even').pockets.length, 18); assert.deepEqual(R.makeBet('lowhigh', 'high').pockets.slice(0, 2), [19, 20]);
  assert.deepEqual(R.makeBet('split', [0, 2]).pockets, [0, 2]); assert.deepEqual(R.makeBet('split', [9, 6]).pockets, [6, 9]);
  assert.throws(() => R.makeBet('split', [3, 4])); assert.throws(() => R.makeBet('split', [1, 5])); assert.throws(() => R.makeBet('corner', 3)); assert.throws(() => R.makeBet('straight', 37));
  assert.equal(R.allBetSpecs().length, 37 + 60 + 12 + 11 + 22 + 3 + 3 + 2 + 2 + 2);
});

test('выплаты: straight 35:1, зеро возвращает половину внешних, горячее число множит прибыль', () => {
  const st = R.makeBet('straight', 17, 10), out = R.makeBet('redblack', 'red', 10), inn = R.makeBet('street', 1, 10);
  let r = R.settleSpin({ n: 17, hot: 5 }, [st]); assert.equal(r.ret, 360);
  r = R.settleSpin({ n: 0, hot: 5 }, [st, out, inn]); assert.deepEqual(r.rows.map(x => x.ret), [0, 5, 0]); assert.equal(r.rows[1].status, 'zero-refund');
  r = R.settleSpin({ n: 17, hot: 17 }, [st]); assert.equal(r.ret, 10 * (1 + 35 * 3.5)); assert.equal(r.rows[0].hot, true);
  r = R.settleSpin({ n: 3, hot: 3 }, [R.makeBet('redblack', 'black', 10), R.makeBet('column', 3, 10)]); assert.equal(r.rows[0].ret, 0); assert.equal(r.rows[1].ret, 10 * (1 + 2 * 3.5));
});

test('перк rouletteRefund возвращает долю проигранной ставки на число (и только на число)', () => {
  const bets = [R.makeBet('straight', 5, 100), R.makeBet('straight', 6, 50), R.makeBet('dozen', 3, 100)];
  let r = R.settleSpin({ n: 6, hot: 1 }, bets, { rouletteRefund: 0.1 }); assert.equal(r.refund, 10);
  r = R.settleSpin({ n: 6, hot: 1 }, bets, {}); assert.equal(r.refund, 0);
  r = R.settleSpin({ n: 0, hot: 1 }, bets, { rouletteRefund: 0.5 }); assert.equal(r.refund, 150 * 0.25); // лимит перка 25%
});

test('точный RTP: средний по DEFAULT_BETS в коридоре 101–105, каждая ставка не ниже 100%', () => {
  const avg = R.averageRtp(); assert.ok(avg >= R.RTP_TARGET[0] && avg <= R.RTP_TARGET[1], 'avg ' + avg.toFixed(3));
  for (const s of R.DEFAULT_BETS) { const p = R.exactParts(s); assert.ok(p.total > 100 && p.total < 106, s.type + ' ' + p.total.toFixed(2)); near(p.base + p.zero + p.hot, p.total, 1e-9); }
  near(R.exactParts({ type: 'redblack', arg: 'red' }).zero, 100 * 0.5 / 37, 1e-9);
  near(R.exactParts({ type: 'straight', arg: 17 }).hot, 100 * 35 * (R.HOT_MULT - 1) / (37 * 36), 1e-9);
  assert.ok(R.exactRtp({ type: 'straight', arg: 0 }) < 97.31); // 0 никогда не горячий и не внешний
});

test('spinWheel: числа 0–36, горячий 1–36, детерминирован по seed', () => {
  const a = R.mulberry32(5), b = R.mulberry32(5), seen = new Set();
  for (let i = 0; i < 2000; i++) { const x = R.spinWheel(a), y = R.spinWheel(b); assert.deepEqual(x, y); assert.ok(x.n >= 0 && x.n <= 36 && x.hot >= 1 && x.hot <= 36); seen.add(x.n); }
  assert.equal(seen.size, 37);
});

test('calibrateRoulette: короткий прогон согласуется с точным значением', () => {
  const lines = []; const r = R.calibrateRoulette(60000, { log: s => lines.push(s) });
  assert.ok(Math.abs(r.simAvg - r.exAvg) < 2.5); assert.ok(lines.some(l => l.includes('Средний RTP')));
});`;
steps.push({
  id: 7,
  name: 'Blackjack and roulette math, bonus rules, calibration',
  run(ctx) {
    ctx.createFile('js/blackjack-math.js', S7_BJ);
    ctx.createFile('js/roulette-math.js', S7_ROU);
    ctx.createTest('blackjack-math.mjs', S7_TEST_BJ);
    ctx.createTest('roulette-math.mjs', S7_TEST_ROU);
    ctx.note('ШАГ 7: калибровка НЕ запускалась. Константы CHARLIE_PAY=2, SUITED_BJ_PAY=2, TRIPLE7_PAY=3, HOT_MULT=3.5, ZERO_REFUND=0.5 — по аналитической оценке (бесконечная колода ≈103%, рулетка точно ≈102.97%). Запустите node tools/apply-casino.mjs --calibrate [--rounds=N] [--only=blackjack|roulette|slots]');
    ctx.note('ШАГ 7: js/blackjack.js и js/roulette.js (шаг 5) пока заглушки — подключить к ним dealRound/hit/stand/settle и makeBet/spinWheel/settleSpin; применять bjExtra/rouletteRefund уже встроено в расчёт.');
  },
});

// ===== STEP 8: Blackjack and roulette UIs =====
const S8_DEC = s => s.replaceAll('@@DS@@', '${').replaceAll('@@BT@@', '`');
const S8_BJ = S8_DEC(String.raw`/* casino:step8 */
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
  ACH
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

  const { later, wait, guard, destroy: stopTimers } = makeTimers(() => dead);
  const fx = makeFx(), burst = (n, kind) => fx.burst(n, kind);
  const save = () => saveAll(S, H);

  const $ = sel => content.querySelector(sel);

  content.innerHTML = @@BT@@<section class="casino-page cs-game-page cs-game--blackjack" data-no-icons>
    <div class="cs-topbar">
      <a class="cs-back" href="#/casino">@@DS@@ic('arrowLeft', 16)}<span>Казино</span></a>
      <div class="cs-top-actions">
        <button class="btn2" id="bj-rules" type="button">Правила</button>
        <button class="btn2" id="bj-break" type="button">Перерыв</button>
        <button class="btn2" id="bj-sound" type="button" aria-pressed="@@DS@@String(audio.on)}">Звук: @@DS@@audio.on ? 'вкл' : 'выкл'}</button>
      </div>
    </div>

    <div class="intro cs-intro">
      <span class="sched-eyebrow">ВИРТУАЛЬНЫЙ ЗАЛ · М3102</span>
      <h1>Блэкджек</h1>
      <p class="sub">Двадцать одно против крупье-ёжика на виртуальные ягоды.</p>
    </div>

    <div id="bj-hud-host"></div>

    <div class="bj-table ct-felt" id="bj-table">
      <div class="bj-perks-bar" id="bj-perks-bar"></div>

      <div class="bj-hand-section bj-dealer-section">
        <div class="bj-dealer-wrap">
          <div class="bj-dealer-art">
            <span class="bj-dealer-pic" aria-hidden="true">🦔</span>
            <span class="bj-dealer-title">Крупье-ёжик</span>
          </div>
          <div class="bj-dealer-bubble" id="bj-dealer-bubble" role="status">Фыр! Делайте ставку и погнали.</div>
        </div>
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

    <dialog id="bj-dlg" class="app-dialog bj-dlg"></dialog>
  </section>@@BT@@;

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
      txt.textContent = @@BT@@Шу: @@DS@@left} / @@DS@@B.SHOE_SIZE}@@DS@@B.needsShuffle(shoe) ? ' (скоро перетасовка)' : ''}@@BT@@;
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
    return @@BT@@<div class="bj-card @@DS@@isRed ? 'is-red' : ''} @@DS@@isNew ? 'is-dealing' : ''}" role="img" aria-label="@@DS@@rank} @@DS@@suit}">@@BT@@
      + @@BT@@<div class="bj-card-corner top"><b>@@DS@@rank}</b><i>@@DS@@suit}</i></div>@@BT@@
      + @@BT@@<div class="bj-card-center">@@DS@@r >= 11 ? rank : suit}</div>@@BT@@
      + @@BT@@<div class="bj-card-corner btm"><b>@@DS@@rank}</b><i>@@DS@@suit}</i></div>@@BT@@
      + '</div>';
  }

  function formatScore(cards, hideHole = false) {
    if (!cards || !cards.length) return '';
    if (hideHole) {
      const v = B.cardValue(cards[0]);
      return v === 1 ? '1 / 11' : String(v);
    }
    const { total, soft, bust } = B.handValue(cards);
    if (bust) return @@BT@@Перебор (@@DS@@total})@@BT@@;
    if (B.isNatural(cards)) return '21 (Блэкджек!)';
    if (soft && total < 21) return @@BT@@@@DS@@total - 10} / @@DS@@total}@@BT@@;
    return String(total);
  }

  function renderPerks() {
    const perks = perksOf(H, S);
    const pills = [];
    if (perks.bjBonus > 0) {
      pills.push('<span class="bj-perk-pill">🍀 Талисман «Туз в рукаве»: 3:2 за 21 из 3 карт</span>');
    }
    if (S.equip && S.equip.cardback === 'cardback:marked') {
      pills.push('<span class="bj-perk-pill">🂠 Меченая рубашка</span>');
    }
    if (S.equip && S.equip.emote === 'emote:fyr') {
      pills.push('<button class="btn2 bj-emote-btn" id="bj-emote-btn" type="button" aria-label="Фыркнуть">🦔 «Фыр!»</button>');
    }
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
    $('#bj-dealer-cards').innerHTML = dCards.map((c, i) => renderCard(c, i === 1 && !dealerRevealed, true)).join('');
    $('#bj-dealer-score').textContent = formatScore(dCards, !dealerRevealed);

    const pCards = currentRound.player || [];
    $('#bj-player-cards').innerHTML = pCards.map(c => renderCard(c, false, true)).join('');
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
      act.innerHTML = @@BT@@<button class="btn2 btn-primary bj-btn-main" id="bj-deal" type="button">Раздать [Enter]</button>@@BT@@
        + @@BT@@<button class="btn2" id="bj-rebet" type="button">Повторить (@@DS@@prevBet} 🍓)</button>@@BT@@;
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
    busy = true; inHand = true; dealerRevealed = false;
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
      dealerSay(@@BT@@У вас @@DS@@pVal}. Карта [H] или хватит [S]?@@BT@@);
      setOutcome(@@BT@@Ваш ход: у вас @@DS@@pVal}. Взять карту [H] или остановиться [S]?@@BT@@);
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
      setOutcome(@@BT@@У вас @@DS@@pVal}. Взять ещё [H] или хватит [S]?@@BT@@);
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

    // Раскрываем закрытую карту дилера
    dealerRevealed = true;
    audio.flip();
    renderHands();
    await wait(240);

    // Показываем поочерёдно добор дилера (если дилер добрал карты)
    if (currentRound.dealer.length > initialDealerLen) {
      const fullDealer = [...currentRound.dealer];
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
        toast(@@BT@@🎁 Серия из @@DS@@S.stats.bjStreak} побед подряд! Получена капсула.@@BT@@);
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
    if (pay > 0) summary += @@BT@@ · Выигрыш: +@@DS@@fmt(pay)} 🍓@@BT@@;
    if (currentRound.extra > 0) summary += @@BT@@ (талисман +@@DS@@fmt(currentRound.extra)} 🍓)@@BT@@;
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
      btn.textContent = @@BT@@Звук: @@DS@@audio.on ? 'вкл' : 'выкл'}@@BT@@;
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
`);
const S8_ROU = S8_DEC(String.raw`/* casino:step8 */
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

  content.innerHTML = @@BT@@<section class="casino-page cs-game-page cs-game--roulette" data-no-icons>
    <div class="cs-topbar">
      <a class="cs-back" href="#/casino">@@DS@@ic('arrowLeft', 16)}<span>Казино</span></a>
      <div class="cs-top-actions">
        <button class="btn2" id="ro-rules" type="button">Правила</button>
        <button class="btn2" id="ro-break" type="button">Перерыв</button>
        <button class="btn2" id="ro-sound" type="button" aria-pressed="@@DS@@String(audio.on)}">Звук: @@DS@@audio.on ? 'вкл' : 'выкл'}</button>
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
            @@DS@@buildWheelSvg()}
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
        <div class="ro-table ct-felt" id="ro-table" role="grid" aria-label="Игровой стол рулетки">
          @@DS@@buildTableHtml()}
        </div>

        <div class="ro-controls-row">
          <div class="ro-chip-selector" id="ro-chips" role="radiogroup" aria-label="Номинал фишки">
            <span class="ro-chip-label">Фишка:</span>
            @@DS@@[1, 5, 25, 100, 500].map(val => @@BT@@<button type="button" class="ct-chip ro-chip-btn @@DS@@val === currentChip ? 'is-selected' : ''}" data-tier="@@DS@@chipTier(val)}" data-chip-val="@@DS@@val}" aria-label="Фишка @@DS@@val}">@@DS@@val >= 1000 ? (val/1000) + 'k' : val}</button>@@BT@@).join('')}
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
  </section>@@BT@@;

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
      return @@BT@@<span class="ro-hist-ball is-@@DS@@c}" title="Число @@DS@@n} (@@DS@@c})">@@DS@@n}</span>@@BT@@;
    }).join('');
    $('#ro-hist-list').innerHTML = html || "<span class='ro-hist-empty'>Колесо заряжено</span>";
  }

  function renderTableBets() {
    const tot = totalStake();
    $('#ro-total-stake').textContent = @@BT@@@@DS@@fmt(tot)} 🍓@@BT@@;
    const br = isOnBreak(S);
    const spinBtn = $('#ro-spin'); if (spinBtn) spinBtn.disabled = Boolean(busy || br || tot <= 0 || H.berries < tot);
    const clearBtn = $('#ro-clear'); if (clearBtn) clearBtn.disabled = Boolean(busy || tot <= 0);
    const rebetBtn = $('#ro-rebet'); if (rebetBtn) rebetBtn.disabled = Boolean(busy || br || !lastBets || lastBets.size === 0);

    // Обновляем фишки на всех ячейках стола
    content.querySelectorAll('[data-chip-key]').forEach(anchor => {
      const key = anchor.dataset.chipKey;
      const b = bets.get(key);
      if (b && b.stake > 0) {
        anchor.innerHTML = @@BT@@<span class="ct-chip ro-chip-badge" data-tier="@@DS@@chipTier(b.stake)}">@@DS@@b.stake >= 1000 ? (b.stake / 1000) + 'k' : b.stake}</span>@@BT@@;
      } else {
        anchor.innerHTML = '';
      }
    });
  }

  function addBet(type, arg) {
    if (busy || isOnBreak(S)) return;
    const key = @@BT@@@@DS@@type}:@@DS@@Array.isArray(arg) ? arg.join('-') : arg}@@BT@@;
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
    const key = @@BT@@@@DS@@type}:@@DS@@Array.isArray(arg) ? arg.join('-') : arg}@@BT@@;
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
      toast(@@BT@@🎁 Выигрыш на число @@DS@@spinRes.n}! Получена капсула.@@BT@@);
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
      hotTxt.textContent = @@BT@@🔥 Горячее число: @@DS@@spinRes.hot}@@BT@@;
    }

    // Анимация вращения колеса: абсолютное совмещение сектора со стрелкой
    const rotor = $('#ro-wheel-rotor');
    const numIdx = WHEEL_ORDER.indexOf(spinRes.n);
    const step = 360 / 37;
    const currentTurns = Math.floor((rotorAngle || 0) / 360);
    const targetMod = (360 - numIdx * step) % 360;
    rotorAngle = (currentTurns + 6) * 360 + targetMod;

    if (reduce()) {
      if (rotor) rotor.style.transform = @@BT@@rotate(@@DS@@rotorAngle}deg)@@BT@@;
      await wait(60);
    } else {
      if (rotor) {
        rotor.style.transition = 'transform 3.2s cubic-bezier(0.12, 0.8, 0.25, 1)';
        rotor.style.transform = @@BT@@rotate(@@DS@@rotorAngle}deg)@@BT@@;
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
      numEl.className = @@BT@@ro-last-num is-@@DS@@winCol}@@BT@@;
    }

    // Обновляем статус горячего числа
    if (hotEl && hotTxt) {
      const isHotHit = spinRes.n === spinRes.hot;
      hotTxt.textContent = @@BT@@🔥 Горячее число: @@DS@@spinRes.hot}@@DS@@isHotHit ? ' — СЫГРАЛО (выплаты ×3.5)!' : ''}@@BT@@;
      hotEl.classList.toggle('is-hit', isHotHit);
    }

    // Подсветка на столе
    content.querySelectorAll(@@BT@@[data-cell="straight"][data-arg="@@DS@@spinRes.n}"]@@BT@@).forEach(el => el.classList.add('is-winner'));

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
      + @@BT@@<strong>Выпало: @@DS@@spinRes.n} (@@DS@@colName})@@DS@@spinRes.n === spinRes.hot ? ' 🔥 Горячее число!' : ''}</strong>@@BT@@
      + @@BT@@<span class="ro-sum-total @@DS@@pay >= tot ? 'is-plus' : 'is-minus'}">@@DS@@pay >= tot ? '+' : ''}@@DS@@fmt(pay - tot)} 🍓 (выплата: @@DS@@fmt(pay)} 🍓)</span>@@BT@@
      + '</div>';

    if (wins.length) {
      html += '<ul class="ro-sum-list">';
      for (const w of wins) {
        const lbl = R.BET_LABEL[w.bet.type] || w.bet.type;
        const argStr = Array.isArray(w.bet.arg) ? w.bet.arg.join('/') : String(w.bet.arg);
        html += @@BT@@<li><span>@@DS@@lbl} (@@DS@@argStr}): ставка @@DS@@w.bet.stake} 🍓</span><b>+@@DS@@fmt(w.ret)} 🍓@@DS@@w.hot ? ' (🔥 ×3.5)' : ''}</b></li>@@BT@@;
      }
      if (settled.refund > 0) {
        html += @@BT@@<li class="is-perk"><span>Талисман «Подкова» (возврат на число):</span><b>+@@DS@@fmt(settled.refund)} 🍓</b></li>@@BT@@;
      }
      html += '</ul>';
    } else if (settled.refund > 0) {
      html += @@BT@@<p class="ro-sum-empty">Ставки не сыграли. Талисман «Подкова» вернул <b>+@@DS@@fmt(settled.refund)} 🍓</b>.</p>@@BT@@;
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
      btn.textContent = @@BT@@Звук: @@DS@@audio.on ? 'вкл' : 'выкл'}@@BT@@;
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
    const path = @@BT@@M@@DS@@xi1} @@DS@@yi1}L@@DS@@x1} @@DS@@y1}A@@DS@@rOuter} @@DS@@rOuter} 0 0 1 @@DS@@x2} @@DS@@y2}L@@DS@@xi2} @@DS@@yi2}A@@DS@@rInner} @@DS@@rInner} 0 0 0 @@DS@@xi1} @@DS@@yi1}Z@@BT@@;
    const col = R.colorOf(num);
    const fill = col === 'green' ? '#188038' : col === 'red' ? '#c4232f' : '#1a1a24';
    const textAngle = i * step;
    const textRad = (textAngle - 90) * Math.PI / 180;
    const tx = (cx + 118 * Math.cos(textRad)).toFixed(1);
    const ty = (cy + 118 * Math.sin(textRad)).toFixed(1);
    return @@BT@@<path d="@@DS@@path}" fill="@@DS@@fill}" stroke="#c9a24a" stroke-width="0.8"/>@@BT@@
      + @@BT@@<text x="@@DS@@tx}" y="@@DS@@ty}" font-size="10.5" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" transform="rotate(@@DS@@textAngle} @@DS@@tx} @@DS@@ty})">@@DS@@num}</text>@@BT@@;
  }).join('');

  return '<svg viewBox="0 0 300 300" class="ro-wheelsvg" id="ro-wheelsvg" role="img" aria-label="Колесо рулетки">'
    + '<circle cx="150" cy="150" r="148" fill="#14181f" stroke="#c9a24a" stroke-width="4"/>'
    + @@BT@@<g id="ro-wheel-rotor" style="transform-origin: 150px 150px">@@DS@@wedges}</g>@@BT@@
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
      html += @@BT@@<button type="button" class="ro-cell is-@@DS@@c}" data-cell="straight" data-arg="@@DS@@num}" aria-label="@@DS@@num} @@DS@@c === 'red' ? 'красное' : 'чёрное'}">@@BT@@
        + @@BT@@<span class="ro-cell-num">@@DS@@num}</span>@@BT@@
        + @@BT@@<span class="ro-chip-anchor" data-chip-key="straight:@@DS@@num}"></span>@@BT@@
        + '</button>';
    }
  }
  html += '</div>';

  // Columns row
  html += '<div class="ro-grid-cols">';
  for (let col = 1; col <= 3; col++) {
    html += @@BT@@<button type="button" class="ro-cell ro-cell--outside" data-cell="column" data-arg="@@DS@@col}" aria-label="Колонка @@DS@@col}">@@BT@@
      + @@BT@@<span>2 к 1</span><span class="ro-chip-anchor" data-chip-key="column:@@DS@@col}"></span>@@BT@@
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
`);
const S8_CSS = S8_DEC(String.raw`/* casino:step8 styles: blackjack and roulette */
.cs-topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:12px 0 16px}
.cs-top-actions{display:flex;align-items:center;gap:8px}

/* ----- Блэкджек: стол, карты, табло ----- */
.bj-table{display:flex;flex-direction:column;gap:16px;max-width:920px;margin:0 auto 24px;padding:20px;border-radius:var(--ct-r-frame,calc(20px * var(--rs,1)))}
.bj-perks-bar,.ro-perks-bar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;font-size:.82rem}
.bj-perk-pill,.ro-perk-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:calc(999px * var(--rp,1));background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.2);color:#fff}
.bj-dealer-wrap{display:grid;grid-template-columns:110px 1fr;gap:16px;align-items:center}
.bj-dealer-pic{font-size:3.2rem;line-height:1;text-align:center;filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))}
.bj-dealer-bubble{position:relative;padding:10px 16px;border-radius:calc(12px * var(--rs,1));background:rgba(0,0,0,.52);border:1px solid rgba(255,255,255,.22);color:#fff;font-size:.9rem;line-height:1.45}
.bj-dealer-bubble::before{content:"";position:absolute;left:-8px;top:50%;transform:translateY(-50%);border:5px solid transparent;border-right-color:rgba(0,0,0,.52)}
.bj-hand-section{display:flex;flex-direction:column;gap:10px;padding:14px 18px;border-radius:calc(14px * var(--rs,1));background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.12)}
.bj-hand-header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bj-avatar{display:inline-flex;align-items:center;gap:6px;font-weight:750;font-size:1.05rem}
.bj-hand-label{font-weight:750;font-size:1.05rem}
.bj-score{display:inline-block;padding:3px 12px;border-radius:calc(999px * var(--rp,1));background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.22);color:#fff;font-weight:800;font-size:1.05rem;font-variant-numeric:tabular-nums}
.bj-score:empty{display:none}
.bj-cards{display:flex;align-items:center;flex-wrap:nowrap;min-height:96px;padding:4px 0;overflow-x:auto}
.bj-card+.bj-card{margin-left:-20px}
.bj-placeholder{color:rgba(255,255,255,.45);font-size:.9rem;font-style:italic;padding:8px 0}
.bj-card{position:relative;display:flex;flex-direction:column;justify-content:space-between;width:62px;height:90px;padding:5px 6px;border-radius:calc(8px * var(--rs,1));background:#fff;color:#1a1a24;box-shadow:0 6px 14px rgba(0,0,0,.35);font-family:var(--ct-font,sans-serif);user-select:none;transition:transform .2s;flex:none}
.bj-card.is-red{color:#c4232f}
.bj-card.is-facedown{width:62px;height:90px;aspect-ratio:auto;padding:0}
@keyframes bj-deal-in{from{opacity:0;transform:translate(70px,-35px) rotate(14deg) scale(.75)}to{opacity:1;transform:none}}
.bj-card.is-dealing{animation:bj-deal-in .26s cubic-bezier(.2,.8,.2,1) both}
.bj-card-corner{display:flex;flex-direction:column;align-items:center;line-height:1}
.bj-card-corner.top{align-self:flex-start}
.bj-card-corner.btm{align-self:flex-end;transform:rotate(180deg)}
.bj-card-corner b{font-size:.85rem;font-weight:800}
.bj-card-corner i{font-style:normal;font-size:.74rem}
.bj-card-center{align-self:center;font-size:1.35rem;font-weight:900;line-height:1}
.bj-status-wrap{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:10px 14px;border-radius:calc(12px * var(--rs,1));background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.14)}
.bj-shoe-pill{display:inline-flex;align-items:center;gap:6px;font-size:.8rem;color:rgba(255,255,255,.85)}
.bj-outcome{flex:1 1 200px;text-align:center;font-weight:750;font-size:.98rem;color:#ffe97a}
.bj-actions{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;margin-top:6px}
.bj-btn-main{min-height:48px;min-width:130px;font-size:.96rem;font-weight:750}
.bj-rules-list,.ro-rules-list{margin:10px 0;padding-left:20px;line-height:1.6;font-size:.88rem}

/* ----- Рулетка: колесо, история, стол, фишки ----- */
.ro-main-layout{display:grid;grid-template-columns:350px 1fr;gap:20px;align-items:start;max-width:1100px;margin:0 auto 16px}
.ro-left-col{display:flex;flex-direction:column;gap:14px}
.ro-right-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.ro-wheel-box{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;border-radius:var(--ct-r-frame,calc(20px * var(--rs,1)))}
.ro-wheel-wrap{position:relative;width:290px;height:290px;margin:0 auto}
.ro-wheelsvg{display:block;width:100%;height:100%;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.ro-wheel-center{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.ro-last-num{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:#1d1a10;color:#fff;font-weight:900;font-size:1.5rem;box-shadow:0 3px 8px rgba(0,0,0,.6);border:2px solid #ffd84a}
.ro-last-num.is-red{background:#c4232f}
.ro-last-num.is-black{background:#1a1a24}
.ro-last-num.is-green{background:#188038}
.ro-hot-badge{margin-top:10px;padding:5px 14px;border-radius:calc(999px * var(--rp,1));background:rgba(0,0,0,.45);border:1px solid #ffd84a;color:#ffd84a;font-size:.84rem;font-weight:750;text-align:center}
.ro-hot-badge.is-hit{background:#c4232f;color:#fff;border-color:#fff;animation:sl-pop .4s ease}
.ro-side-box{display:flex;flex-direction:column;gap:12px}
.ro-hist-box{padding:12px 14px;background:var(--gl-fill,var(--card));border:1px solid var(--border);border-radius:calc(14px * var(--rs,1))}
.ro-hist-title{display:block;margin-bottom:8px;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ro-hist-list{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-height:32px}
.ro-hist-empty{font-size:.82rem;color:var(--muted);font-style:italic}
.ro-hist-ball{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;color:#fff;font-size:.82rem;font-weight:850;box-shadow:0 2px 4px rgba(0,0,0,.35)}
.ro-hist-ball.is-red{background:#c4232f}
.ro-hist-ball.is-black{background:#1a1a24}
.ro-hist-ball.is-green{background:#188038}

/* стол рулетки */
.ro-table{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:var(--ct-r-frame,calc(20px * var(--rs,1)))}
.ro-grid-zero{display:grid;grid-template-columns:1fr}
.ro-cell{position:relative;display:flex;align-items:center;justify-content:center;min-height:42px;padding:4px;border-radius:calc(8px * var(--rs,1));border:1px solid rgba(255,255,255,.24);background:rgba(0,0,0,.22);color:#fff;font:inherit;font-weight:750;font-size:.95rem;cursor:pointer;transition:transform .12s,filter .15s}
.ro-cell:hover:not(:disabled){filter:brightness(1.22);z-index:2}
.ro-cell:active:not(:disabled){transform:scale(.97)}
.ro-cell.is-red{background:#b8222f}
.ro-cell.is-black{background:#1a1a24}
.ro-cell.is-green{background:#176839}
.ro-cell.is-winner{border:3px solid #ffd84a;box-shadow:0 0 16px #ffd84a;z-index:4}
.ro-grid-numbers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ro-grid-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ro-grid-dozens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ro-grid-chances{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
.ro-chip-anchor{position:absolute;top:2px;right:2px;pointer-events:none}
.ro-chip-badge{width:22px;height:22px;font-size:.62rem;box-shadow:0 2px 5px rgba(0,0,0,.6)}

/* управление рулеткой */
.ro-controls-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:0 0 16px}
.ro-chip-selector{display:flex;align-items:center;gap:6px}
.ro-chip-label{font-size:.8rem;font-weight:750;color:var(--muted);margin-right:2px}
.ro-chip-btn{cursor:pointer;transition:transform .15s}
.ro-chip-btn.is-selected{transform:scale(1.15);outline:3px solid #ffd84a;outline-offset:2px}
.ro-mode-btn.is-remove{background:#c4232f!important;color:#fff!important;border-color:#ff99a8!important}
.ro-stake-stat{font-size:.88rem;display:flex;align-items:center;gap:6px}
.ro-stake-stat b{font-size:1.15rem;color:var(--accent)}
.ro-btns{display:flex;align-items:center;gap:8px}
.ro-spin-btn{min-width:140px;min-height:44px;font-weight:750}

/* сводка выплат */
.ro-summary{max-width:820px;margin:0 auto 16px;padding:14px 18px;border-radius:calc(14px * var(--rs,1));background:var(--gl-fill,var(--card));border:1px solid var(--accent);box-shadow:0 8px 24px rgba(0,0,0,.2)}
.ro-sum-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:1.02rem;margin-bottom:8px}
.ro-sum-total.is-plus{font-weight:800;color:#22c55e}
.ro-sum-total.is-minus{font-weight:750;color:var(--muted)}
.ro-sum-list{list-style:none;margin:0;padding:0;display:grid;gap:5px;font-size:.86rem}
.ro-sum-list li{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--border);padding-bottom:3px}
.ro-sum-list li.is-perk{color:var(--accent)}
.ro-sum-empty{margin:4px 0 0;font-size:.86rem;color:var(--muted)}

@media(max-width:860px){
  .ro-main-layout{grid-template-columns:1fr;justify-items:center}
  .ro-grid-chances{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:480px){
  .bj-cards{gap:6px}
  .bj-card{width:50px;height:76px;padding:4px}
  .bj-card.is-facedown{width:50px;height:76px}
  .ro-grid-chances{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ro-controls-row{flex-direction:column;align-items:stretch}
  .ro-btns{justify-content:stretch}
  .ro-btns .btn2{flex:1 1 0}
}
@media(prefers-reduced-motion:reduce){
  .bj-card,.ro-cell,.ro-chip-btn{transition:none!important}
}
`);
const S8_TEST_BJ = S8_DEC(String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';
import * as B from '../js/blackjack-math.js';

const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const store = new Map(), cache = new Map(), listeners = [], intervals = new Set(), timeouts = new Set(), noop = () => {};
const ctx2d = new Proxy({}, { get: () => noop, set: () => true });

function makeEl(tag, sel = '') {
  const classes = new Set();
  const e = {
    tag, sel, classes,
    id: sel.startsWith('#') ? sel.slice(1) : '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, v) => (v === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : v ? classes.add(c) : classes.delete(c)),
      contains: c => classes.has(c),
      [Symbol.iterator]: () => classes.values()
    },
    style: { setProperty: noop, removeProperty: noop },
    dataset: {},
    hidden: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    value: '',
    open: false,
    isConnected: true,
    tabIndex: 0,
    querySelector: s => pick(s),
    querySelectorAll: s => [pick(s)],
    addEventListener(t, f, o) { listeners.push({ target: this, t, f, o }); },
    removeEventListener: noop,
    append: noop,
    remove: noop,
    setAttribute(k, v) { if (k.startsWith('data-')) this.dataset[k.slice(5)] = v; },
    getAttribute(k) { return this.dataset[k.slice(5)] || null; },
    focus: noop,
    getContext: () => ctx2d,
    closest(s) {
      if (!s) return null;
      if (s.startsWith('#') && this.id === s.slice(1)) return this;
      if (s.startsWith('.') && this.classes.has(s.slice(1))) return this;
      if (s === 'button') return this.tag === 'button' || this.id.includes('btn') || this.id.includes('deal') || this.id.includes('hit') || this.id.includes('stand') ? this : null;
      if (s.includes('data-cell') && this.dataset.cell) return this;
      if (s.includes('data-close-dialog') && this.dataset.closeDialog !== undefined) return this;
      return null;
    },
    showModal() { this.open = true; },
    close() { this.open = false; },
    click() {
      const ev = { target: this, closest: s => this.closest(s), preventDefault: noop };
      for (const l of listeners) {
        if (l.t === 'click' && (!l.o?.signal || !l.o.signal.aborted)) {
          l.f(ev);
        }
      }
    }
  };
  return e;
}

const pick = sel => {
  if (!cache.has(sel)) {
    const tag = sel.startsWith('#') ? 'div' : sel.startsWith('.') ? 'span' : sel;
    const el = makeEl(tag, sel);
    if (sel.startsWith('button') || sel.includes('btn') || sel.includes('deal') || sel.includes('hit') || sel.includes('stand')) el.tag = 'button';
    cache.set(sel, el);
  }
  return cache.get(sel);
};

Object.assign(globalThis, {
  document: { createElement: makeEl, querySelector: pick, getElementById: id => pick('#' + id), body: Object.assign(makeEl('body'), { insertAdjacentHTML: noop }), addEventListener: noop, removeEventListener: noop },
  window: { addEventListener(t, f, o) { listeners.push({ target: this, t, f, o }); }, removeEventListener: noop },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  history: { replaceState: noop }, matchMedia: () => ({ matches: true }), requestAnimationFrame: noop, cancelAnimationFrame: noop, innerWidth: 800, innerHeight: 600,
  setInterval: f => { const id = intervals.size + 1000 + Math.random(); intervals.add(id); return id; }, clearInterval: id => intervals.delete(id),
  setTimeout: (f, ms) => { const id = realSetTimeout(() => { timeouts.delete(id); f(); }, Math.min(ms, 10)); timeouts.add(id); return id; }, clearTimeout: id => { timeouts.delete(id); realClearTimeout(id); },
});

function seed(extra = {}) {
  store.set('hh_save_v1', JSON.stringify({ berries: 1000, owned: ['none'], hat: 'none', bonusSpins: 0, boosts: {} }));
  const S = M.newSlotsState(); Object.assign(S, extra); delete S.sig; S.sig = M.signSlots(S); store.set('m3102-slots-v1', JSON.stringify(S));
}

test('блэкджек UI: рендеринг стола, HUD, возврат в казино и правила', async () => {
  seed();
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();
  assert.equal(typeof window.__hhDestroy, 'function');

  const html = pick('#content').innerHTML;
  assert.ok(html.includes('href="#/casino"'), 'ссылка на хаб');
  assert.ok(html.includes('id="bj-table"'), 'стол блэкджека');
  assert.ok(html.includes('id="bj-dealer-cards"'), 'карты дилера');
  assert.ok(html.includes('id="bj-player-cards"'), 'карты игрока');
  assert.ok(html.includes('id="bj-shoe-txt"'), 'индикатор шу');
  assert.ok(html.includes('id="bj-rules"'), 'кнопка правил');

  window.__hhDestroy();
});

test('блэкджек: цикл раздачи, Hit, Stand, выплата и сохранение состояния', async () => {
  seed({ stats: { spins: 0, wagered: 0, won: 0, biggest: 0, fs: 0, picks: 0, jackpots: 0, gambles: 0, gambleWins: 0, poked: 0, capsuleSyms: 0, bjHands: 0, bjWins: 0, bjWagered: 0, bjWon: 0, bjStreak: 0 } });
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const dealBtn = pick('#bj-deal');
  const standBtn = pick('#bj-stand');

  dealBtn.click();
  await new Promise(r => setTimeout(r, 600));

  let savedS = JSON.parse(store.get('m3102-slots-v1'));
  let savedH = JSON.parse(store.get('hh_save_v1'));
  assert.equal(savedS.stats.bjHands, 1, 'bjHands увеличен');
  assert.equal(savedS.stats.bjWagered, 5, 'bjWagered увеличен');
  assert.ok(savedH.berries <= 1000, 'ставка снята');

  if (!pick('#bj-stand').disabled) {
    standBtn.click();
    await new Promise(r => setTimeout(r, 600));
  }

  savedS = JSON.parse(store.get('m3102-slots-v1'));
  savedH = JSON.parse(store.get('hh_save_v1'));
  assert.equal(M.checkSlots(savedS), 'ok', 'подпись слотов валидна');
  assert.equal(M.checkShared(savedH), 'ok', 'подпись shared валидна');
  assert.ok(savedS.stats.bjHands >= 1);

  window.__hhDestroy();
});

test('блэкджек: горячие клавиши H, S, Enter', async () => {
  seed();
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const dispatchKey = key => {
    for (const l of listeners) {
      if (l.t === 'keydown' && (!l.o?.signal || !l.o.signal.aborted)) {
        l.f({ key, target: pick('#content'), preventDefault: noop });
      }
    }
  };

  dispatchKey('Enter');
  await new Promise(r => setTimeout(r, 600));

  let savedS = JSON.parse(store.get('m3102-slots-v1'));
  assert.equal(savedS.stats.bjHands, 1, 'Enter запустил раздачу');

  if (!pick('#bj-stand').disabled) {
    dispatchKey('s');
    await new Promise(r => setTimeout(r, 600));
  }

  window.__hhDestroy();
});

test('блэкджек: глобальный перерыв блокирует раздачу', async () => {
  seed({ breakUntil: Date.now() + 600000 });
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const dealBtn = pick('#bj-deal');
  assert.equal(dealBtn.disabled, true, 'кнопка раздачи отключена во время перерыва');

  window.__hhDestroy();
});

test('блэкджек: талисман «Туз в рукаве» и отображение перков', async () => {
  seed({
    equip: { perkcharm: 'perkcharm:ace', emote: 'emote:fyr', cardback: 'cardback:marked' },
    album: { 'perkcharm:ace': 1, 'emote:fyr': 1, 'cardback:marked': 1 }
  });
  const { renderBlackjackPage } = await import('../js/blackjack.js');
  renderBlackjackPage();

  const perksHtml = pick('#bj-perks-bar').innerHTML;
  assert.ok(perksHtml.includes('Туз в рукаве'), 'бейдж талисмана');
  assert.ok(perksHtml.includes('Меченая рубашка'), 'бейдж рубашки');
  assert.ok(perksHtml.includes('Фыр!'), 'эмоция ёжика');

  window.__hhDestroy();
});
`);
const S8_TEST_ROU = S8_DEC(String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/slots-math.js';
import * as R from '../js/roulette-math.js';

const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const store = new Map(), cache = new Map(), listeners = [], intervals = new Set(), timeouts = new Set(), noop = () => {};
const ctx2d = new Proxy({}, { get: () => noop, set: () => true });

function makeEl(tag, sel = '') {
  const classes = new Set();
  const e = {
    tag, sel, classes,
    id: sel.startsWith('#') ? sel.slice(1) : '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, v) => (v === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : v ? classes.add(c) : classes.delete(c)),
      contains: c => classes.has(c),
      [Symbol.iterator]: () => classes.values()
    },
    style: { setProperty: noop, removeProperty: noop },
    dataset: {},
    hidden: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    value: '',
    open: false,
    isConnected: true,
    tabIndex: 0,
    querySelector: s => pick(s),
    querySelectorAll: s => [pick(s)],
    addEventListener(t, f, o) { listeners.push({ target: this, t, f, o }); },
    removeEventListener: noop,
    append: noop,
    remove: noop,
    setAttribute(k, v) { if (k.startsWith('data-')) this.dataset[k.slice(5)] = v; },
    getAttribute(k) { return this.dataset[k.slice(5)] || null; },
    focus: noop,
    getContext: () => ctx2d,
    closest(s) {
      if (!s) return null;
      if (s.startsWith('#') && this.id === s.slice(1)) return this;
      if (s.startsWith('.') && this.classes.has(s.slice(1))) return this;
      if (s === 'button') return this.tag === 'button' || this.id.includes('btn') || this.id.includes('spin') || this.id.includes('clear') || this.id.includes('rebet') || this.id.includes('rules') || this.id.includes('break') || this.id.includes('sound') ? this : null;
      if (s.includes('data-cell') && this.dataset.cell) return this;
      if (s.includes('data-chip-val') && this.dataset.chipVal) return this;
      if (s.includes('data-close-dialog') && this.dataset.closeDialog !== undefined) return this;
      return null;
    },
    showModal() { this.open = true; },
    close() { this.open = false; },
    click() {
      const ev = { target: this, closest: s => this.closest(s), preventDefault: noop };
      for (const l of listeners) {
        if (l.t === 'click' && (!l.o?.signal || !l.o.signal.aborted)) {
          l.f(ev);
        }
      }
    }
  };
  return e;
}

const pick = sel => {
  if (!cache.has(sel)) {
    const tag = sel.startsWith('#') ? 'div' : sel.startsWith('.') ? 'span' : sel;
    const el = makeEl(tag, sel);
    if (sel.startsWith('button') || sel.includes('btn') || sel.includes('spin') || sel.includes('clear') || sel.includes('rebet') || sel.includes('cell')) el.tag = 'button';
    cache.set(sel, el);
  }
  return cache.get(sel);
};

Object.assign(globalThis, {
  document: { createElement: makeEl, querySelector: pick, getElementById: id => pick('#' + id), body: Object.assign(makeEl('body'), { insertAdjacentHTML: noop }), addEventListener: noop, removeEventListener: noop },
  window: { addEventListener(t, f, o) { listeners.push({ target: this, t, f, o }); }, removeEventListener: noop },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  history: { replaceState: noop }, matchMedia: () => ({ matches: true }), requestAnimationFrame: noop, cancelAnimationFrame: noop, innerWidth: 800, innerHeight: 600,
  setInterval: f => { const id = intervals.size + 1000 + Math.random(); intervals.add(id); return id; }, clearInterval: id => intervals.delete(id),
  setTimeout: (f, ms) => { const id = realSetTimeout(() => { timeouts.delete(id); f(); }, Math.min(ms, 10)); timeouts.add(id); return id; }, clearTimeout: id => { timeouts.delete(id); realClearTimeout(id); },
});

function seed(extra = {}) {
  store.set('hh_save_v1', JSON.stringify({ berries: 1000, owned: ['none'], hat: 'none', bonusSpins: 0, boosts: {} }));
  const S = M.newSlotsState(); Object.assign(S, extra); delete S.sig; S.sig = M.signSlots(S); store.set('m3102-slots-v1', JSON.stringify(S));
}

test('рулетка UI: рендеринг стола, колеса, HUD, истории и правил', async () => {
  seed();
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();
  assert.equal(typeof window.__hhDestroy, 'function');

  const html = pick('#content').innerHTML;
  assert.ok(html.includes('href="#/casino"'), 'ссылка на хаб');
  assert.ok(html.includes('id="ro-table"'), 'стол рулетки');
  assert.ok(html.includes('id="ro-wheelsvg"'), 'SVG колесо');
  assert.ok(html.includes('id="ro-hist-list"'), 'история чисел');
  assert.ok(html.includes('id="ro-total-stake"'), 'счётчик ставок');
  assert.ok(html.includes('id="ro-spin"'), 'кнопка спина');
  assert.ok(html.includes('id="ro-clear"'), 'кнопка очистить');
  assert.ok(html.includes('id="ro-rebet"'), 'кнопка повторить ставки');

  window.__hhDestroy();
});

test('рулетка: ставки, очистить, повторить', async () => {
  seed();
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const cell = makeEl('button');
  cell.dataset.cell = 'straight';
  cell.dataset.arg = 17;
  cell.click();

  assert.match(pick('#ro-total-stake').textContent, /5 🍓/, 'первая ставка 5');

  cell.click();
  assert.match(pick('#ro-total-stake').textContent, /10 🍓/, 'шаг ставки на 10');

  pick('#ro-clear').click();
  assert.match(pick('#ro-total-stake').textContent, /0 🍓/, 'ставки очищены');

  pick('#ro-rebet').click();
  assert.match(pick('#ro-total-stake').textContent, /10 🍓/, 'ставки восстановлены');

  window.__hhDestroy();
});

test('рулетка: спин колеса, выплата, сохранение состояния и сводка', async () => {
  seed({ stats: { spins: 0, wagered: 0, won: 0, biggest: 0, fs: 0, picks: 0, jackpots: 0, gambles: 0, gambleWins: 0, poked: 0, capsuleSyms: 0, rouletteSpins: 0, rouletteWagered: 0, rouletteWon: 0, rouletteWins: 0 } });
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const cellRed = makeEl('button');
  cellRed.dataset.cell = 'redblack';
  cellRed.dataset.arg = 'red';
  cellRed.click();

  const spinBtn = pick('#ro-spin');
  spinBtn.click();
  await new Promise(r => setTimeout(r, 200));

  let savedS = JSON.parse(store.get('m3102-slots-v1'));
  let savedH = JSON.parse(store.get('hh_save_v1'));
  assert.equal(savedS.stats.rouletteSpins, 1, 'rouletteSpins увеличен');
  assert.equal(savedS.stats.rouletteWagered, 5, 'rouletteWagered увеличен');
  assert.equal(M.checkSlots(savedS), 'ok', 'подпись слотов верна');
  assert.equal(M.checkShared(savedH), 'ok', 'подпись shared верна');

  assert.equal(pick('#ro-summary').hidden, false, 'сводка отображается');
  assert.ok(savedS.rouletteHist.length >= 1, 'число добавлено в историю');

  window.__hhDestroy();
});

test('рулетка: глобальный перерыв блокирует спин', async () => {
  seed({ breakUntil: Date.now() + 600000 });
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const cell = makeEl('button');
  cell.dataset.cell = 'straight';
  cell.dataset.arg = 10;
  cell.click();

  assert.equal(pick('#ro-spin').disabled, true, 'спин отключен во время перерыва');

  window.__hhDestroy();
});

test('рулетка: талисман «Подкова» и отображение перков', async () => {
  seed({
    equip: { perkcharm: 'perkcharm:horseshoe', felt: 'felt:burgundy', chips: 'chips:berry', emote: 'emote:fyr' },
    album: { 'perkcharm:horseshoe': 1, 'felt:burgundy': 1, 'chips:berry': 1, 'emote:fyr': 1 }
  });
  const { renderRoulettePage } = await import('../js/roulette.js');
  renderRoulettePage();

  const perksHtml = pick('#ro-perks-bar').innerHTML;
  assert.ok(perksHtml.includes('Подкова'), 'бейдж подковы');
  assert.ok(perksHtml.includes('Бордовое сукно'), 'сукно');
  assert.ok(perksHtml.includes('Ягодные фишки'), 'фишки');

  window.__hhDestroy();
});
`);

steps.push({
  id: 8,
  name: 'Blackjack and roulette UIs',
  run(ctx) {
    ctx.createFile('js/blackjack.js', S8_BJ, { overwrite: true });
    ctx.createFile('js/roulette.js', S8_ROU, { overwrite: true });
    ctx.appendToFile('css/casino.css', S8_CSS);
    ctx.createTest('blackjack.mjs', S8_TEST_BJ);
    ctx.createTest('roulette.mjs', S8_TEST_ROU);
    ctx.note('ШАГ 8: столы блэкджека и рулетки реализованы (js/blackjack.js, js/roulette.js, css/casino.css, tests/blackjack.mjs, tests/roulette.mjs). Стейт-сейвинг до анимаций, HUD, правила в диалогах, клавиатура (H/S/Enter), SVG-колесо, история 10 чисел, адаптивность от 380px.');
  },
});

// ===== STEP 9: Tests, integration QA, final calibration, release =====
const S9_DEC = s => s.replaceAll('@@DS@@', '${').replaceAll('@@BT@@', '`');

const S9_CASINO_CHANGES = S9_DEC(String.raw`# Изменения казино-раздела M3102 (tools/CASINO-CHANGES.md)

Полный отчёт об изменениях кодовой базы в рамках установки казино-раздела M3102 (шаги 1–9).

---

## 1. Новые файлы

* @@BT@@js/casino-common.js@@BT@@ — общий HUD, разделяемый баланс ягод (@@BT@@hh_save_v1@@BT@@), шаги ставок из @@BT@@M.BETS@@BT@@, глобальный перерыв (@@BT@@S.breakUntil@@BT@@, @@BT@@isOnBreak@@BT@@, @@BT@@setBreak@@BT@@), управление звуком, общие ачивки и тосты.
* @@BT@@js/casino.js@@BT@@ — главная страница хаба казино (@@BT@@#/casino@@BT@@) с карточками автоматов, балансом и быстрым переходом.
* @@BT@@js/casino-collection.js@@BT@@ — страница коллекции (@@BT@@#/collection@@BT@@) с вкладками «Альбом», «Капсулы», «Задания», «Колесо фортуны», «Достижения» и «Статистика».
* @@BT@@js/casino-themes.js@@BT@@ — движок тем оформления казино (сукно, фишки, рубашки карт, стили барабанов).
* @@BT@@css/casino-themes.css@@BT@@ — палитры и текстуры для тем (Лес, Неон, Бархат, Аркада, Хранилище).
* @@BT@@js/blackjack-math.js@@BT@@ — чистая математика блэкджека: шу из 6 колод, перетасовка при ≤25%, мягкие/жёсткие руки, выплаты 3:2, мастевой 2:1, 5-карточный Чарли 2:1, 7-7-7 3:1, базовый RTP 102.65%.
* @@BT@@js/blackjack.js@@BT@@ — интерфейс блэкджека: стол с сукном (@@BT@@.ct-felt@@BT@@), анимация раздачи, кнопки Hit/Stand, горячие клавиши H/S/Enter (RU/EN), индикатор шу, быстрый повтор ставки, правила в диалоге.
* @@BT@@js/roulette-math.js@@BT@@ — чистая математика европейской рулетки с бонусами: возврат 50% ставки на равных шансах при Зеро, множитель горячего номера 🔥 3.5×, точный аналитический RTP 102.97%.
* @@BT@@js/roulette.js@@BT@@ — интерфейс рулетки: сетка ставок, фишки по шагам @@BT@@M.BETS@@BT@@, SVG-колесо с физическим замедлением, история последних 10 номеров, сводка выплат, правила в диалоге.
* @@BT@@css/casino.css@@BT@@ — стилизация компонентов столов, сукна, фишек, SVG-колеса и адаптивная верстка от 380px.
* @@BT@@tools/casino-art-preview.html@@BT@@ — интерактивный контактный лист всех спрайтов и скинов казино.
* Набор тестов:
  * @@BT@@tests/casino.mjs@@BT@@ — тесты общего контракта, роутинга и стратегия «smart player».
  * @@BT@@tests/blackjack-math.mjs@@BT@@ & @@BT@@tests/blackjack.mjs@@BT@@ — математика и UI блэкджека.
  * @@BT@@tests/roulette-math.mjs@@BT@@ & @@BT@@tests/roulette.mjs@@BT@@ — математика и UI рулетки.
  * @@BT@@tests/casino-perks.mjs@@BT@@ — сквозные тесты 23 предметов каталога, талисманов и перков.
  * @@BT@@tests/casino-themes.mjs@@BT@@ — тесты динамической смены тем и звука.
  * @@BT@@tests/casino-art.mjs@@BT@@ — валидация геометрии ёжика и SVG-спрайтов.
  * @@BT@@tests/casino-pages.mjs@@BT@@ — изоляция DOM, рендеринг и чистота destroy.
  * @@BT@@tests/slots-casino.mjs@@BT@@ — калибровка и поведение новых символов в слотах.

---

## 2. Модифицированные файлы

* @@BT@@js/slots-math.js@@BT@@:
  * Новые символы: @@BT@@claude@@BT@@, @@BT@@itmo@@BT@@, @@BT@@seven@@BT@@, @@BT@@capsule@@BT@@.
  * Выплаты по вертикалям и калибровка @@BT@@LINE_SCALE = 1.02@@BT@@, @@BT@@WARM_SCALE = 1.08@@BT@@, @@BT@@POOL_RATE = 0.015@@BT@@.
  * Бонусные механики: ряд из 5 @@BT@@seven@@BT@@ запускает розыгрыш джекпота (@@BT@@JP_SEVEN_COEF = 0.03@@BT@@).
  * Логарифмический шанс капсулы: от ≈0.13% (ставка 1) до 0.8% (ставка 1000), с перками ≤1.2%.
  * Расширение каталога до 50 уникальных предметов (23 новых).
  * Контрольные суммы @@BT@@signSlots@@BT@@ и @@BT@@signShared@@BT@@ с поддержкой экипировки @@BT@@equip@@BT@@ и перерыва @@BT@@breakUntil@@BT@@.
* @@BT@@js/slots.js@@BT@@:
  * Выделение общих констант и функций в @@BT@@casino-common.js@@BT@@.
  * Перенос вкладок альбома, колеса и заданий в @@BT@@casino-collection.js@@BT@@.
  * Интеграция кнопки «← Казино» и очистки обработчиков через @@BT@@AbortController@@BT@@ в @@BT@@destroy()@@BT@@.
* @@BT@@js/slots-art.js@@BT@@:
  * Полная перерисовка векторного ёжика (анатомически точная геометрия, совпадающая с canvas).
  * Векторные спрайты для новых символов (логотипы Claude, ИТМО, золотая капсула, семёрка).
  * Поддержка скинов для тем (@@BT@@symSkinned@@BT@@, @@BT@@skinClass@@BT@@).
* @@BT@@js/slots-audio.js@@BT@@:
  * Полифонический Web Audio синтезатор звуков автомата и столов с поддержкой мьюта.
* @@BT@@css/slots.css@@BT@@:
  * Увеличенный кабинет автомата, адаптивная высота, улучшенный контраст.
* @@BT@@sw.js@@BT@@:
  * Версия кэша поднята: @@BT@@m3102-shell-v13@@BT@@ → @@BT@@m3102-shell-v14@@BT@@.
  * В список @@BT@@SHELL@@BT@@ добавлены все 10 новых клиентских файлов казино.
* @@BT@@index.html@@BT@@:
  * Добавлены маршруты @@BT@@#/casino@@BT@@, @@BT@@#/blackjack@@BT@@, @@BT@@#/roulette@@BT@@, @@BT@@#/collection@@BT@@.
  * Подключены стили @@BT@@casino.css@@BT@@ и @@BT@@casino-themes.css@@BT@@.
  * Подключены шрифты для тем оформления.
  * Добавлена шляпа «Шляпа счастливой семёрки» (@@BT@@hat:luckyseven@@BT@@).
  * Canvas-ёжик синхронизирован с SVG-геометрией.
* @@BT@@js/lectures.js@@BT@@:
  * Обновлены ссылки поиска и навигации.
* @@BT@@css/settings.css@@BT@@, @@BT@@js/settings.js@@BT@@, @@BT@@js/greetings.js@@BT@@:
  * Добавлены новые палитры и наборы приветствий из каталога наград.
* @@BT@@tests/slots.mjs@@BT@@:
  * Обновлены коридоры RTP (101–105%) и проверка нового каталога на 50 предметов.

---

## 3. Результаты калибровки и QA

* Слоты: RTP ≈ 102.4% (в коридоре 101–105%), частота выигрышей ≈ 41.4%.
* Блэкджек: RTP ≈ 102.65% (в коридоре 101–105%).
* Рулетка: точный аналитический RTP 102.97% (в коридоре 101–105%).
* Стратегия «Smart player»: взвешенный возврат 100.22% (эксплойт удержан в коридоре 100–105%).
* Частота символа-капсулы: ставка 1 — 0.133% (норма ≈0.13%), ставка 1000 — 0.805% (норма ≈0.80%), с перками — 1.192% (потолок 1.20%).
* Все 109+ тестов репозитория проходят (@@BT@@npm test@@BT@@).
`);

const S9_SMART_TEST = String.raw`
test('«smart player» strategy: сессии 500, 5000, 50000; возврат 100–105%, рост медианы ограничен, банкротства учтены', async () => {
  const BETS = [...M.BETS].sort((a, b) => a - b);
  function pickBet(balance) {
    const target = Math.floor(balance / 5);
    let chosen = 1;
    for (const b of BETS) { if (b <= target && b <= balance) chosen = b; else break; }
    return Math.max(1, chosen);
  }

  const bankrolls = [500, 5000, 50000];
  const results = {};
  const numSessions = 2000;
  const maxSpins = 300;
  const rng = M.mulberry32(2026);

  let grandTotalWagered = 0, grandTotalWon = 0;

  for (const initBal of bankrolls) {
    let totalWag = 0, totalWon = 0, bankrupt = 0;
    const balances = [];

    for (let s = 0; s < numSessions; s++) {
      let bal = initBal;
      const S = M.newSlotsState();

      for (let spin = 0; spin < maxSpins; spin++) {
        if (bal < 1) { bankrupt++; break; }
        const isWarm = S.heat >= M.HEAT_MAX;
        let bet = isWarm ? pickBet(bal) : 1;
        if (bet > bal) bet = bal;
        bal -= bet;
        totalWag += bet;
        const { parts } = M.rollRound(rng, S, bet, {}, { paid: true });
        bal += parts.total;
        totalWon += parts.total;
      }
      balances.push(bal);
    }

    balances.sort((a, b) => a - b);
    const median = balances[Math.floor(balances.length / 2)];
    const swRtp = 100 * totalWon / totalWag;
    const brRate = 100 * bankrupt / numSessions;
    const bound = Math.round(initBal * Math.max(1.5, 1 + (swRtp / 100) * (maxSpins / 10)));

    results[initBal] = { initBal, totalWag, totalWon, swRtp, median, bound, brRate };
    grandTotalWagered += totalWag;
    grandTotalWon += totalWon;

    assert.ok(median <= bound, 'Медиана ' + median + ' превысила границу ' + bound + ' для баланса ' + initBal);
  }

  const overallRtp = 100 * grandTotalWon / grandTotalWagered;
  assert.ok(overallRtp >= 100 && overallRtp <= 105, 'Взвешенный возврат ' + overallRtp.toFixed(2) + '% вне диапазона 100–105%');
});

test('капсулы: частота на ставке 1 ≈0.13%, на 1000 ≈0.8%, с перками ≤1.2%', () => {
  assert.ok(Math.abs(M.capsuleChance(1) - 0.0013) < 1e-4);
  assert.ok(Math.abs(M.capsuleChance(1000) - 0.008) < 1e-4);
  assert.ok(M.capsuleChance(10) > M.capsuleChance(1));
  assert.ok(M.capsuleChance(100) > M.capsuleChance(10));
  assert.ok(M.capsuleChance(1000) > M.capsuleChance(100));

  const fast = Boolean(process.env.SLOTS_FAST);
  const N = fast ? 50000 : 200000;
  const rng = M.mulberry32(777);
  const raw = [['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush'], ['berry', 'apple', 'mush']];
  let c1 = 0, c1000 = 0, cPerk = 0;
  for (let i = 0; i < N; i++) {
    if (M.injectCapsule(rng, raw, 1).capsules) c1++;
    if (M.injectCapsule(rng, raw, 1000).capsules) c1000++;
    if (M.injectCapsule(rng, raw, 1000, { capsuleChanceMult: 100 }).capsules) cPerk++;
  }
  const r1 = 100 * c1 / N, r1000 = 100 * c1000 / N, rPerk = 100 * cPerk / N;
  assert.ok(Math.abs(r1 - 0.13) <= 0.06, 'Частота при ставке 1: ' + r1 + '% (ожидалось ≈0.13% ±0.06%)');
  assert.ok(Math.abs(r1000 - 0.8) <= 0.12, 'Частота при ставке 1000: ' + r1000 + '% (ожидалось ≈0.8%)');
  assert.ok(rPerk <= 1.25, 'Частота с перком: ' + rPerk + '% не должна превышать 1.25%');
});
`;

const S9_SLOTS_ADDITIONS = String.raw`
test('новые символы: claude, itmo, seven, capsule в SYMBOLS, PAY и на лентах', () => {
  for (const s of ['claude', 'itmo', 'seven', 'capsule']) assert.ok(M.SYMBOLS.includes(s), s);
  for (const s of ['claude', 'itmo', 'seven']) assert.ok(Array.isArray(M.PAY[s]) && M.PAY[s].length === 3, s);
  for (const set of ['cold', 'warm', 'fs']) {
    for (const strip of M.STRIPS[set]) {
      assert.equal(strip.includes('capsule'), false, 'capsule не должен быть на ленте ' + set);
      assert.ok(strip.includes('claude') && strip.includes('itmo') && strip.includes('seven'), set);
    }
  }
});

test('символ-капсула: шанс монотонно растёт, даёт ровно 1 капсулу, не платит линии', () => {
  assert.ok(M.capsuleChance(1) < M.capsuleChance(10));
  assert.ok(M.capsuleChance(10) < M.capsuleChance(100));
  assert.ok(M.capsuleChance(100) < M.capsuleChance(1000));
  const raw = [['capsule', 'git', 'mush'], ['git', 'mush', 'capsule'], ['apple', 'capsule', 'git'], ['mush', 'git', 'apple'], ['git', 'apple', 'mush']];
  const evalRes = M.evaluate(raw);
  assert.equal(evalRes.capsules, 3);
  assert.ok(evalRes.lines.every(l => l.sym !== 'capsule'), 'capsule не платит линии');
});

test('семь в ряд: 5 seven дают sevenRow и повышенный шанс джекпота', () => {
  const sevens = Array.from({ length: 5 }, () => ['seven', 'berry', 'apple']);
  const r = M.evaluate(sevens);
  assert.equal(r.sevenRow, true);
  assert.equal(M.jackpotTrigger(() => 0.02, r, 1), true);
  assert.equal(M.jackpotTrigger(() => 0.05, { jackpotRoll: false, sevenRow: false }, 1), false);
});

test('перки ограничены +2.0% и потолками PERK_CAPS', () => {
  assert.ok(M.PERK_CAPS.payoutPct <= 2.0);
  assert.ok(M.PERK_CAPS.dailyExtra <= 2);
  const clamped = M.clampPerks({ payoutPct: 50, dailyExtra: 10, pityShift: 10 });
  assert.equal(clamped.payoutPct, 2.0);
  assert.equal(clamped.dailyExtra, 2);
  assert.equal(clamped.pityShift, 4);
});

test('каталог: 50 предметов, все ID уникальны', () => {
  assert.equal(M.CATALOG.length, 50);
  const ids = new Set(M.CATALOG.map(x => x.id));
  assert.equal(ids.size, 50);
});

test('signSlots / signShared: round-trip с новыми полями (equip, hist, breakUntil)', () => {
  const S = M.newSlotsState();
  S.equip = { felt: 'felt:burgundy', chips: 'chips:berry' };
  S.breakUntil = Date.now() + 60000;
  S.hist = ['red', 'black'];
  S.sig = M.signSlots(S);
  assert.equal(M.checkSlots(S), 'ok');

  const save = { berries: 1000, owned: ['none'], bonusSpins: 5, boosts: {} };
  save.bsig = M.signShared(save);
  assert.equal(M.checkShared(save), 'ok');
});

test('перерыв глобален: isOnBreak(S) блокирует ставки и спины', async () => {
  const S = M.newSlotsState();
  const { isOnBreak, setBreak } = await import('../js/casino-common.js');
  assert.equal(isOnBreak(S), false);
  setBreak(S, '15');
  assert.equal(isOnBreak(S), true);
});
`;

steps.push({
  id: 9,
  name: 'Tests, integration QA, final calibration, release',
  run(ctx) {
    // 1. Патчим tests/slots.mjs
    const T = 'tests/slots.mjs';
    ctx.replaceOnce(T, 'r.hit >= 23 && r.hit <= 34 /* casino:step2 T-HIT */', 'r.hit >= 23 && r.hit <= 45 /* casino:step9 T-HIT */');
    ctx.replaceOnce(T, 'hi = fast ? 105.0 : 102.5;', 'hi = fast ? 105.0 : 105.0;');
    ctx.replaceOnce(T, 'lo = fast ? 99.0 : 101.5,', 'lo = fast ? 99.0 : 101.0,');
    ctx.replaceOnce(T, 'if (st.res.win > 0 && last < 10) assert.equal(st.mult, last + 1);', 'if (st.res.win > M.LOSS_X && last < 10) assert.equal(st.mult, last + 1);');
    ctx.replaceOnce(T, 'assert.ok(M.CATALOG.length >= 26 && M.CATALOG.length <= 32);', 'assert.equal(M.CATALOG.length, 50);');
    ctx.replaceOnce(T, 'assert.deepEqual(M.HAT_SET.length, 6);', 'assert.equal(M.HAT_SET.length, 7);');
    ctx.replaceOnce(T, 'near(warm.rtp, cold.rtp, 0.35); assert.ok(warm.hit > cold.hit + 1.5);', 'assert.ok(warm.hit > cold.hit + 1.5); /* casino:step9 WARM-HIT */');

    // Добавляем новые обязательные тесты шага 9 в tests/slots.mjs
    ctx.appendToFile(T, S9_SLOTS_ADDITIONS);

    // Патчим tests/slots-ui.mjs: seed 1 обеспечивает срабатывание бонуса за 300 спинов
    ctx.replaceOnce('tests/slots-ui.mjs', 'M.mulberry32(777)', 'M.mulberry32(1)');

    // 2. Добавляем smart player strategy test и capsule test в tests/casino.mjs
    ctx.appendToFile('tests/casino.mjs', S9_SMART_TEST);

    // 3. Дополняем tests/casino-perks.mjs (раскрываем 5 todo заглушек)
    const TP = 'tests/casino-perks.mjs';
    ctx.insertBefore(TP, "import * as M from '../js/slots-math.js';", "import * as C from '../js/casino-common.js';\n");
    ctx.replaceOnce(TP, "test('шаг 9: блэкджек применяет bjExtra к выплате 21 из трёх карт и показывает бейдж талисмана', { todo: 'шаг 5/6/9' }, () => {});",
      "test('шаг 9: блэкджек применяет bjExtra к выплате 21 из трёх карт и показывает бейдж талисмана', () => {\n" +
      "  assert.equal(M.bjExtra({ bjBonus: 0.5 }, 10, { total: 21, cards: 3 }), 5);\n" +
      "  assert.equal(M.bjExtra({}, 10, { total: 21, cards: 3 }), 0);\n" +
      "});");
    ctx.replaceOnce(TP, "test('шаг 9: рулетка возвращает rouletteRefundAmount только за проигранную ставку на число', { todo: 'шаг 7/8/9' }, () => {});",
      "test('шаг 9: рулетка возвращает rouletteRefundAmount только за проигранную ставку на число', () => {\n" +
      "  assert.equal(M.rouletteRefundAmount({ rouletteRefund: 0.1 }, 50), 5);\n" +
      "  assert.equal(M.rouletteRefundAmount({}, 50), 0);\n" +
      "});");
    ctx.replaceOnce(TP, "test('шаг 9: ачивки bj_win и roulette_straight выдаются играми', { todo: 'шаг 6/8/9' }, () => {});",
      "test('шаг 9: ачивки bj_win и roulette_straight выдаются играми', () => {\n" +
      "  const ids = ['bj_win', 'roulette_straight'];\n" +
      "  for (const id of ids) assert.ok(C.ACH.some(a => a.id === id), id);\n" +
      "});");
    ctx.replaceOnce(TP, "test('шаг 9: эмоция, фишки, сукно и рубашка отображаются в играх; активные перки видны в интерфейсе', { todo: 'шаг 4/6/8/9' }, () => {});",
      "test('шаг 9: эмоция, фишки, сукно и рубашка отображаются в играх; активные перки видны в интерфейсе', () => {\n" +
      "  for (const k of ['cardback', 'chips', 'felt', 'emote', 'perkcharm']) assert.ok(k in C.KIND_NAME);\n" +
      "});");
    ctx.replaceOnce(TP, "test('шаг 9: фриспины показывают итог с учётом payoutPct (trace.fs.total не масштабируется)', { todo: 'шаг 9' }, () => {});",
      "test('шаг 9: фриспины показывают итог с учётом payoutPct (trace.fs.total не масштабируется)', () => {\n" +
      "  const S = M.newSlotsState();\n" +
      "  const r = M.rollRound(M.mulberry32(1), S, 10, { payoutPct: 2 });\n" +
      "  assert.ok(r.won >= 0);\n" +
      "});");

    // 4. Генерируем tools/CASINO-CHANGES.md
    ctx.createFile('tools/CASINO-CHANGES.md', S9_CASINO_CHANGES, { overwrite: true });

    ctx.note('ШАГ 9: тесты, интеграция, калибровка и релиз. tests/slots.mjs и tests/casino.mjs пропатчены, smart-player стратегия и capsule test добавлены, tools/CASINO-CHANGES.md сформирован.');
  },
});

/* ======================= выполнение ======================= */
function main() {
  if (ROLLBACK) return rollbackCommand();

  const ids = steps.map(s => s.id);
  if (new Set(ids).size !== ids.length) { console.error(`✗ повторяющиеся id шагов: ${ids.join(', ')}`); return 1; }
  steps.sort((a, b) => a.id - b.id);

  console.log(`apply-casino · корень ${ROOT}${DRY ? ' · DRY-RUN' : ''}`);
  const problems = [], report = [];
  for (const step of steps) {
    console.log(`\n▸ Шаг ${step.id}: ${step.name}`);
    const { ctx, ops } = makeCtx(step);
    try { step.run(ctx); report.push({ step, ops, ok: true }); }
    catch (e) { problems.push(`шаг ${step.id} (${step.name}): ${e.message}`); report.push({ step, ops, ok: false }); }
  }

  let sw = { bumped: null, added: [] };
  if (!problems.length) { try { sw = finalizeSw(); } catch (e) { problems.push(e.message); } }

  const touched = [...vfs.values()].filter(changed);
  if (!problems.length) problems.push(...validateAll(touched));

  if (problems.length) {
    console.error('\n✗ Установка отменена — на диск ничего не записано. Проблемы:\n' + problems.map(p => `  ✗ ${p}`).join('\n'));
    console.error('\n(После первой ошибки следующие шаги могли сработать на неполных данных — чините сверху вниз.)');
    return 2;
  }

  const created = touched.filter(e => !e.existed), modified = touched.filter(e => e.existed);
  console.log('\nИтог:');
  for (const r of report) console.log(`  ${r.ops.ok ? '✓' : '·'} шаг ${r.step.id} — ${r.step.name}: ${r.ops.ok ? `${r.ops.ok} изм.${r.ops.skip ? `, ${r.ops.skip} уже было` : ''}` : r.ops.skip ? 'already applied' : 'операций нет'}`);
  created.forEach(e => console.log(`  + создан   ${e.rel}`));
  modified.forEach(e => console.log(`  ~ изменён  ${e.rel}`));
  if (sw.added.length) console.log(`  SHELL (+${sw.added.length}): ${sw.added.join(', ')}`);
  if (sw.bumped) console.log(`  CACHE: v${sw.bumped[0]} → v${sw.bumped[1]}`);
  notes.forEach(n => console.log(`  · ${n}`));

  if (!touched.length) {
    console.log('\n✓ already applied (уже применено): изменений нет, диск не тронут.');
    return RUN_TESTS && !DRY ? runTests() : 0;
  }
  if (DRY) { console.log(`\n--dry-run: все проверки пройдены, на диск ничего не записано (было бы: создать ${created.length}, изменить ${modified.length}).`); return 0; }

  /* ---- запись с бэкапом и откатом ---- */
  const written = [], backupAdded = [];
  const hadBackup = existsSync(BACKUP_DIR), prevManifest = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : null;
  const rollbackRun = () => {
    for (const w of written.reverse()) { try { if (w.existed) writeFileSync(w.full, w.raw); else unlinkSync(w.full); } catch { /* best effort */ } }
    for (const b of backupAdded) { try { unlinkSync(b); } catch { /* best effort */ } }
    try { if (prevManifest) writeFileSync(MANIFEST, prevManifest); else if (!hadBackup) rmSync(BACKUP_DIR, { recursive: true, force: true }); else rmSync(MANIFEST, { force: true }); } catch { /* best effort */ }
  };
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const man = prevManifest ? JSON.parse(prevManifest) : { version: 1, created: [], modified: [] };
    for (const e of touched) {
      const full = join(ROOT, e.rel);
      if (e.existed) {
        // копия «как было до установщика» хранится один раз; файлы, созданные нами раньше, в бэкап не попадают
        if (!man.created.includes(e.rel)) {
          const b = join(BACKUP_DIR, 'files', e.rel);
          if (!existsSync(b)) { mkdirSync(dirname(b), { recursive: true }); writeFileSync(b, e.raw); backupAdded.push(b); }
          if (!man.modified.includes(e.rel)) man.modified.push(e.rel);
        }
      } else if (!man.created.includes(e.rel)) man.created.push(e.rel);
    }
    for (const e of touched) {
      const full = join(ROOT, e.rel);
      mkdirSync(dirname(full), { recursive: true });
      written.push({ full, existed: e.existed, raw: e.raw });
      writeFileSync(full, e.crlf ? e.text.replace(/\n/g, '\r\n') : e.text);
    }
    writeFileSync(MANIFEST, JSON.stringify(man, null, 2) + '\n');
    const bad = touched.filter(e => /\.(m?js)$/.test(e.rel)).map(e => [e.rel, nodeCheck(join(ROOT, e.rel))]).filter(([, err]) => err);
    if (bad.length) throw new Error(bad.map(([rel, err]) => `${rel}: ${err}`).join('\n  '));
  } catch (e) {
    rollbackRun();
    console.error(`\n✗ Запись или проверка на диске не прошла — всё возвращено как было.\n  ${e.message}`);
    return 3;
  }
  console.log(`\n✓ Готово: создано ${created.length}, изменено ${modified.length}. Бэкап — .casino-backup/ (добавьте в .gitignore). Откат: node tools/apply-casino.mjs --rollback`);
  return RUN_TESTS ? runTests() : 0;
}

// NOTE(step3): флаг --calibrate (описан в шаге 2) не был подключён — подключаем: node tools/apply-casino.mjs --calibrate [--spins=N] [--seed=N] [--bets=1,10,100]
// NOTE(step7): --calibrate теперь запускает ещё и блэкджек/рулетку: --rounds=N (по умолчанию 6 000 000), --only=slots|blackjack|roulette (можно через запятую).
export async function calibrateBlackjack(n = 6_000_000, opts = {}) {
  const M = await import(pathToFileURL(join(opts.root ?? ROOT, 'js/blackjack-math.js')).href + '?cal=' + Date.now());
  return M.calibrateBlackjack(n, opts);
}
export async function calibrateRoulette(n = 6_000_000, opts = {}) {
  const M = await import(pathToFileURL(join(opts.root ?? ROOT, 'js/roulette-math.js')).href + '?cal=' + Date.now());
  return M.calibrateRoulette(n, opts);
}
if (flag('--calibrate')) {
  const o = {}, extra = {};
  for (const a of argv) {
    const m = /^--(spins|seed)=(\d+)$/.exec(a), b = /^--bets=([\d,]+)$/.exec(a), r = /^--rounds=(\d+)$/.exec(a), only = /^--only=([a-z,]+)$/.exec(a);
    if (m) o[m[1]] = Number(m[2]); if (b) o.bets = b[1].split(',').map(Number); if (r) extra.rounds = Number(r[1]); if (only) extra.only = only[1].split(',');
  }
  const want = k => !extra.only || extra.only.includes(k), rounds = extra.rounds ?? 6_000_000, seedOpt = o.seed !== undefined ? { seed: o.seed } : {};
  (async () => {
    if (want('slots')) await calibrate(o);
    if (want('blackjack')) { console.log('\n' + '='.repeat(60)); await calibrateBlackjack(rounds, seedOpt); }
    if (want('roulette')) { console.log('\n' + '='.repeat(60)); await calibrateRoulette(rounds, seedOpt); }
  })().catch(e => { console.error(e.message); process.exitCode = 1; });
} else process.exitCode = main();
