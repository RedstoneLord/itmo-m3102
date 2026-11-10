import { describe, expect, it } from 'vitest';
import { deal, isFree, LEVELS, newBoard, pairs, rewardFor, type Tile } from './engine';

const tile = (id: number, x: number, y = 0, z = 0, kind = 0): Tile => ({ id, x, y, z, kind });
function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function solvable(tiles: Tile[], seen = new Set<string>()): boolean {
  if (!tiles.length) return true;
  const key = tiles.map((t) => t.id).join(',');
  if (seen.has(key)) return false;
  seen.add(key);
  return pairs(tiles).some(([a, b]) =>
    solvable(
      tiles.filter((t) => t.id !== a.id && t.id !== b.id),
      seen,
    ),
  );
}
describe('маджонг', () => {
  it('закрывает обе стороны и учитывает перекрытие ярусом со смещением', () => {
    const row = [tile(0, 0), tile(1, 1), tile(2, 2)];
    expect(row.map((t) => isFree(t, row))).toEqual([true, false, true]);
    expect(isFree(row[0]!, [...row, tile(3, 0.5, 0.5, 1)])).toBe(false);
    expect(isFree(row[0]!, [...row, tile(3, 0, 1, 1)])).toBe(true);
  });
  it('сопоставляет только одинаковые свободные кости', () => {
    expect(pairs([tile(0, 0), tile(1, 1, 0, 0, 1), tile(2, 2)])).toHaveLength(1);
    expect(pairs([tile(0, 0), tile(1, 1), tile(2, 2, 0, 0, 1)])).toHaveLength(0);
  });
  it.each(LEVELS.map((_, i) => i))('создаёт решаемую раскладку уровня %i с чётным количеством символов', (level) => {
    for (let seed = 1; seed <= 5; seed++) {
      const board = newBoard(level, seeded(seed));
      expect(board).toHaveLength([48, 80, 112][level]!);
      for (let k = 0; k < 12; k++) expect(board.filter((t) => t.kind === k).length % 2).toBe(0);
      expect(solvable(board)).toBe(true);
    }
  });
  it('перестраивает запертые ярусы в решаемое поле', () => {
    const board = deal([tile(0, 0), tile(1, 0, 0, 1)], seeded(7));
    expect(solvable(board)).toBe(true);
  });
  it('ограничивает бонус и сохраняет базовую награду при любой помощи', () => {
    expect(rewardFor(0, 20, 0)).toBe(40);
    expect(rewardFor(1, 4, 1)).toBe(45);
    expect(rewardFor(2, 10, 100)).toBe(65);
  });
});
