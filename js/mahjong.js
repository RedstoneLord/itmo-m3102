import { ic } from './icons.js';
import { ensureSprite, sym } from './slots-art.js';
import { loadAll, saveAll, fmt } from './casino-common.js';
import { LEVELS, pairs, isFree, rewardFor } from './mahjong-math.js';
import { MAHJONG_KEY, emptyProgress, newGame, matchPair, undoMove, shuffleGame, creditVictory } from './mahjong-state.js';

const SYMBOLS = ['berry', 'apple', 'mush', 'git', 'orange', 'itmo', 'cpp', 'rust', 'pi', 'hog', 'seven', 'king'];
const NAMES = ['Ягода', 'Яблоко', 'Гриб', 'Git', 'Апельсин', 'ИТМО', 'C++', 'Rust', 'Пи', 'Ёжик', 'Семёрка', 'Король'];

export function renderMahjongPage() {
  const content = document.getElementById('content');
  if (!content) return;
  ensureSprite();
  let progress = emptyProgress();
  try {
    const stored = JSON.parse(localStorage.getItem(MAHJONG_KEY) || 'null')?.state;
    const g = stored?.game;
    if (
      stored &&
      (!g ||
        (Number.isInteger(g.level) &&
          LEVELS[g.level] &&
          Array.isArray(g.history) &&
          Array.isArray(g.tiles) &&
          g.tiles.every((t) => Number.isInteger(t.id) && SYMBOLS[t.kind] && [t.x, t.y, t.z].every(Number.isFinite))))
    )
      progress = stored;
  } catch {
    /* Повреждённая партия не мешает начать новую. */
  }
  let selected = null,
    hinted = [],
    message = 'Найдите две одинаковые свободные кости.',
    confirm = false;
  let level = progress.game?.level ?? 1,
    destroyed = false;
  const save = () => {
    try {
      localStorage.setItem(MAHJONG_KEY, JSON.stringify({ state: progress, version: 1 }));
    } catch {
      message = 'Не удалось сохранить партию: браузеру не хватает места.';
    }
  };
  function draw(focusId) {
    if (destroyed) return;
    const g = progress.game,
      won = g && !g.tiles.length,
      moves = g ? pairs(g.tiles) : [];
    content.innerHTML = `<section class="mj-page" data-no-icons>
      <a class="mj-back" href="#/other">${ic('arrowLeft', 16)} Ещё</a>
      <div class="intro mj-intro"><span class="sched-eyebrow">М3102 · ЯГОДНЫЙ САД</span><h1>Маджонг</h1><p class="sub">Собирайте пары, освобождайте ярусы и помогайте ёжику собирать ягоды.</p></div>
      <div class="mj-hero ${g ? 'mj-playing' : ''}"><div><h2>Маленькая победа между парами</h2><p>Без ставок и ограничения времени. За полностью собранный сад — ягоды в общий баланс.</p></div><div class="mj-harvest">${sym('berry', 32)}<strong>${fmt(progress.total)}</strong><span>собрано · побед: ${fmt(progress.wins)}</span></div></div>
      <div class="mj-setup"><label>Раскладка<select id="mj-level">${LEVELS.map((l, i) => `<option value="${i}" ${i === level ? 'selected' : ''}>${l.name} · ${l.description}</option>`).join('')}</select></label><button class="btn2 btn-primary" data-action="new">${ic('play', 16)} ${g ? 'Новая партия' : 'Начать игру'}</button><a class="btn2" href="#/collection">${ic('trophy', 16)} Коллекция</a></div>
      ${confirm ? '<div class="mj-notice" role="alert">Завершить текущую партию без награды? <button class="btn2" data-action="confirm">Начать новую</button><button class="btn2" data-action="cancel">Продолжить текущую</button></div>' : ''}
      ${
        g
          ? `<div class="mj-stats"><div><span>Осталось пар</span><b>${g.tiles.length / 2}</b></div><div><span>Доступно пар</span><b>${moves.length}</b></div><div><span>Лучшая серия</span><b>×${g.best}</b></div><div><span>${won ? 'Ваш урожай' : 'Награда сейчас'}</span><b>${won ? g.earned : rewardFor(g.level, g.best, g.assists)} ${sym('berry', 20)}</b></div></div>
      ${
        won
          ? `<div class="mj-victory"><div class="mj-mascot">${sym('hog', 100)}</div><h2>Сад собран!</h2><p><strong>+${g.earned} ягод</strong> уже в общем балансе с «Ёжиком» и казино.</p><p>Лучшая серия: ${g.best} · использовано помощи: ${g.assists}</p><button class="btn2 btn-primary" data-action="confirm">Ещё один сад</button></div>`
          : `
      <div class="mj-table"><div class="mj-board" role="group" aria-label="Игровое поле: ${LEVELS[g.level].name}" style="--rows:${g.rows ?? 8};--offset:${g.offset ?? 0}">${g.tiles
        .map((t) => {
          const free = isFree(t, g.tiles);
          return `<button type="button" class="mj-tile" data-tile="${t.id}" data-free="${free}" data-selected="${t.id === selected}" data-hint="${hinted.includes(t.id)}" ${free ? '' : 'disabled'} aria-pressed="${t.id === selected}" aria-label="${NAMES[t.kind]}, кость ${t.id + 1}, ${free ? 'свободна' : 'закрыта'}" style="--x:${t.x};--y:${t.y};--z:${t.z};z-index:${t.z * 200 + t.id}"><small aria-hidden="true">${t.kind + 1}</small>${sym(SYMBOLS[t.kind], 44)}<span aria-hidden="true">${NAMES[t.kind]}</span></button>`;
        })
        .join('')}</div></div>
      <div class="mj-tools"><button class="btn2" data-action="hint" ${moves.length ? '' : 'disabled'}>${ic('bulb', 16)} Подсказка</button><button class="btn2" data-action="undo" ${g.history.length ? '' : 'disabled'}>${ic('undo', 16)} Отменить</button><button class="btn2" data-action="shuffle">${ic('refresh', 16)} Перемешать</button></div>`
      }`
          : `<div class="mj-welcome">${sym('hog', 100)}<h2>Сад ждёт своего героя</h2><p>Выберите раскладку и найдите первую пару.<br>У каждой новой партии есть решение.</p></div>`
      }
      <p class="mj-status" role="status">${g && !won && !moves.length ? 'Нет доступных пар. Отмените ход или перемешайте кости, чтобы продолжить.' : message}</p>
      <details class="mj-rules"><summary>Правила и награды</summary><p>Снимайте одинаковые кости парами. Кость свободна, если её не накрывает другая и открыт хотя бы один край: левый или правый. Затемнённые кости пока закрыты. Для клавиатуры используйте Tab и Enter.</p><p>Следующая пара за 12 секунд продолжает серию. Можно отдыхать сколько угодно — таймера проигрыша нет. Партия сохраняется после каждого хода.</p><p>За победу: 20 / 40 / 65 ягод по сложности. Бонус — 2 ягоды за шаг лучшей серии, максимум 20. Каждая подсказка, отмена или перемешивание уменьшает только бонус на 3 ягоды. Базовая награда остаётся. Перемешивание при необходимости перестраивает оставшиеся кости. Одна партия — одна выплата.</p></details>
    </section>`;
    if (focusId !== undefined)
      content.querySelector(`[data-${typeof focusId === 'number' ? 'tile' : 'action'}="${focusId}"]`)?.focus({ preventScroll: true });
  }
  function begin() {
    progress.game = newGame(level);
    selected = null;
    hinted = [];
    confirm = false;
    message = 'Сад ждёт. Начните с открытых краёв.';
    save();
    draw();
  }
  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !content.contains(button) || button.disabled) return;
    const action = button.dataset.action,
      g = progress.game;
    if (action === 'new') {
      if (g && !g.earned) {
        confirm = true;
        draw('confirm');
      } else begin();
      return;
    }
    if (action === 'confirm') {
      begin();
      return;
    }
    if (action === 'cancel') {
      confirm = false;
      draw('new');
      return;
    }
    if (!g || g.earned) return;
    if (action) {
      selected = null;
      hinted = [];
      if (action === 'hint') {
        const pair = pairs(g.tiles)[0];
        if (!pair) return;
        hinted = pair.map((t) => t.id);
        g.assists++;
        g.combo = 0;
        g.lastMatch = 0;
        message = 'Подсвечена свободная пара.';
      } else if (action === 'undo') {
        progress.game = undoMove(g);
        message = 'Последняя пара возвращена.';
      } else if (action === 'shuffle') {
        progress.game = shuffleGame(g);
        message = 'Кости перемешаны. У этой раскладки есть решение.';
      }
      save();
      draw(action);
      return;
    }
    if (!('tile' in button.dataset)) return;
    const id = Number(button.dataset.tile);
    hinted = [];
    if (selected === id) {
      selected = null;
      draw(id);
      return;
    }
    const next = selected === null ? null : matchPair(g, selected, id);
    if (next) {
      progress.game = next;
      selected = null;
      message = next.combo > 1 ? `Серия ×${next.combo}! Следующая пара за 12 секунд продолжит её.` : 'Пара найдена!';
      if (!next.tiles.length) {
        const { S, H } = loadAll();
        if (creditVictory(H, next)) saveAll(S, H);
        progress.wins++;
        progress.total += next.earned;
        message = 'Урожай собран. Ягоды можно потратить в коллекции.';
      }
      save();
      draw();
      // После снятия пары фокус переходит к следующей доступной кости.
      content.querySelector('.mj-tile:not(:disabled), .mj-victory button')?.focus({ preventScroll: true });
    } else {
      message = selected === null ? 'Теперь найдите такую же свободную кость.' : 'Символы разные. Выбрана новая кость.';
      selected = id;
      draw(id);
    }
  }
  const onChange = (event) => {
    if (event.target.id === 'mj-level') level = Number(event.target.value);
  };
  const onStorage = (event) => {
    if (event.key === MAHJONG_KEY) {
      // Другая версия или вкладка продолжила ту же партию: перечитываем перед следующим действием.
      destroyed = true;
      content.removeEventListener('click', onClick);
      content.removeEventListener('change', onChange);
      window.removeEventListener('storage', onStorage);
      renderMahjongPage();
    }
  };
  content.addEventListener('click', onClick);
  content.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  window.__hhDestroy = () => {
    destroyed = true;
    content.removeEventListener('click', onClick);
    content.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
  draw();
}
