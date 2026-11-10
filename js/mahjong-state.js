import { newBoard, isFree, deal, rewardFor } from './mahjong-math.js';

export const MAHJONG_KEY = 'm3102:mahjong';
export const emptyProgress = () => ({ game: null, wins: 0, total: 0 });

export function newGame(level = 1) {
  return {
    id: crypto.randomUUID(),
    level,
    rows: level === 2 ? 8 : 6,
    offset: level === 2 ? 0 : 1,
    tiles: newBoard(level),
    history: [],
    combo: 0,
    best: 0,
    lastMatch: 0,
    assists: 0,
    earned: 0,
  };
}

export function matchPair(game, a, b, now = Date.now()) {
  if (!game || game.earned || a === b) return null;
  const first = game.tiles.find((t) => t.id === a),
    second = game.tiles.find((t) => t.id === b);
  if (!first || !second || first.kind !== second.kind || !isFree(first, game.tiles) || !isFree(second, game.tiles)) return null;
  const combo = now - game.lastMatch <= 12000 ? game.combo + 1 : 1;
  const next = {
    ...game,
    tiles: game.tiles.filter((t) => t.id !== a && t.id !== b),
    history: [...game.history, [first, second]],
    combo,
    best: Math.max(combo, game.best),
    lastMatch: now,
  };
  if (!next.tiles.length) next.earned = rewardFor(next.level, next.best, next.assists);
  return next;
}
export function undoMove(game) {
  const last = game?.history.at(-1);
  if (!last || game.earned) return game;
  return {
    ...game,
    tiles: [...game.tiles, ...last].sort((a, b) => a.id - b.id),
    history: game.history.slice(0, -1),
    assists: game.assists + 1,
    combo: 0,
    lastMatch: 0,
  };
}
export function shuffleGame(game, rng = Math.random) {
  if (!game || game.earned) return game;
  const tiles = deal(game.tiles, rng),
    offset = Math.min(...tiles.map((t) => t.y));
  return {
    ...game,
    tiles,
    offset,
    rows: Math.max(...tiles.map((t) => t.y)) - offset + 1,
    history: [],
    assists: game.assists + 1,
    combo: 0,
    lastMatch: 0,
  };
}

/** Идентификатор хранится с общим балансом, поэтому старое сохранение партии не выдаст ягоды повторно. */
export function creditVictory(shared, game) {
  if (!game?.earned || game.tiles.length) return false;
  const claims = Array.isArray(shared.mahjongClaims) ? shared.mahjongClaims : [];
  if (claims.includes(game.id)) return false;
  shared.berries += game.earned;
  shared.mahjongClaims = [...claims, game.id];
  return true;
}
