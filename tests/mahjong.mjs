import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEVELS, isFree, newBoard, pairs, deal, rewardFor } from '../js/mahjong-math.js';
import { newGame, matchPair, undoMove, shuffleGame, creditVictory } from '../js/mahjong-state.js';
import { loadAll, saveAll } from '../js/casino-common.js';
import { checkShared, checkSlots } from '../js/slots-math.js';

const tile = (id, x, y = 0, z = 0, kind = 0) => ({ id, x, y, z, kind });
const seeded = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
function solution(tiles, seen = new Set()) {
  if (!tiles.length) return [];
  const key = tiles.map((t) => t.id).join(',');
  if (seen.has(key)) return null;
  seen.add(key);
  for (const [a, b] of pairs(tiles)) {
    const rest = solution(
      tiles.filter((t) => t.id !== a.id && t.id !== b.id),
      seen,
    );
    if (rest) return [[a.id, b.id], ...rest];
  }
  return null;
}
test('маджонг: закрытые стороны и перекрытие сверху', () => {
  const row = [tile(0, 0), tile(1, 1), tile(2, 2)];
  assert.deepEqual(
    row.map((t) => isFree(t, row)),
    [true, false, true],
  );
  assert.equal(isFree(row[0], [...row, tile(3, 0.5, 0.5, 1)]), false);
  assert.equal(isFree(row[0], [...row, tile(3, 0, 1, 1)]), true);
  assert.equal(pairs([tile(0, 0), tile(1, 1, 0, 0, 1)]).length, 0);
});
for (let level = 0; level < LEVELS.length; level++)
  test(`маджонг: уровень ${level} имеет полное решение`, () => {
    for (let seed = 1; seed <= 5; seed++) {
      const tiles = newBoard(level, seeded(seed));
      assert.equal(tiles.length, [48, 80, 112][level]);
      assert.ok(solution(tiles));
      for (let kind = 0; kind < 12; kind++) assert.equal(tiles.filter((t) => t.kind === kind).length % 2, 0);
    }
  });
test('маджонг: тупик перестраивается, отмена возвращает пару и учитывает помощь', () => {
  const tiles = deal([tile(0, 0), tile(1, 0, 0, 1)], seeded(1));
  assert.ok(solution(tiles));
  const g = newGame(0),
    [a, b] = pairs(g.tiles)[0];
  assert.equal(matchPair(g, a.id, a.id), null);
  const next = matchPair(g, a.id, b.id, 20000);
  assert.equal(next.tiles.length, 46);
  const undone = undoMove(next);
  assert.equal(undone.tiles.length, 48);
  assert.equal(undone.assists, 1);
  assert.equal(undone.combo, 0);
  const shuffled = shuffleGame(next, seeded(2));
  assert.equal(shuffled.tiles.length, 46);
  assert.ok(solution(shuffled.tiles));
  assert.equal(shuffled.history.length, 0);
});
test('маджонг: серия учитывает паузу, помощь не уменьшает базовую награду', () => {
  const g = { ...newGame(0), tiles: [tile(0, 0), tile(1, 1), tile(2, 2), tile(3, 3)] };
  const first = matchPair(g, 0, 3, 20000);
  assert.equal(first.combo, 1);
  assert.equal(matchPair(first, 1, 2, 21000).combo, 2);
  assert.equal(matchPair(first, 1, 2, 40000).combo, 1);
  assert.equal(rewardFor(0, 99, 0), 40);
  assert.equal(rewardFor(2, 10, 100), 65);
});
test('маджонг: полное прохождение платит один раз и сохраняет подписи общего баланса', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  let game = newGame(0),
    now = 20000;
  assert.equal(creditVictory({ berries: 0 }, game), false);
  for (const [a, b] of solution(game.tiles)) game = matchPair(game, a, b, (now += 1000));
  assert.equal(game.earned, 40);
  const { S, H } = loadAll();
  H.berries = 17;
  assert.equal(creditVictory(H, game), true);
  saveAll(S, H);
  const saved = loadAll();
  assert.equal(saved.H.berries, 57);
  assert.equal(checkShared(saved.H), 'ok');
  assert.equal(checkSlots(saved.S), 'ok');
  assert.equal(creditVictory(saved.H, game), false);
  assert.equal(saved.H.berries, 57);
  assert.equal(undoMove(game), game);
  delete globalThis.localStorage;
});
test('маджонг: маршрут, пункт «Ещё» и офлайн-оболочка подключены в основном сайте', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(html, /data-go="mahjong"/);
  assert.match(html, /mode==='mahjong'\)renderMahjongPage/);
  assert.match(html, /h==='mahjong'/);
  for (const file of ['js/mahjong.js', 'js/mahjong-math.js', 'js/mahjong-state.js', 'css/mahjong.css']) assert.ok(sw.includes(file));
});

test('маджонг: старый король совпадает с ёжиком, отмена сохраняет историю', () => {
  const g = { ...newGame(0), tiles: [tile(0, 0, 0, 0, 9), tile(1, 1, 0, 0, 11), tile(2, 0, 2), tile(3, 1, 2)] };
  assert.equal(pairs(g.tiles).length, 2);
  const next = matchPair(g, 0, 1);
  assert.equal(next.tiles.length, 2);
  assert.deepEqual(undoMove(next).tiles, g.tiles);
  for (const level of [0, 1, 2]) assert.ok(newBoard(level, seeded(1)).every((t) => t.kind !== 11));
});
