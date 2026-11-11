export interface Tile {
  id: number;
  x: number;
  y: number;
  z: number;
  kind: number;
}
export const LEVELS = [
  { name: 'Поляна', description: '48 костей · спокойная разминка', layers: [[8, 6]], reward: 20 },
  {
    name: 'Сад',
    description: '80 костей · три яруса',
    layers: [
      [8, 6],
      [6, 4],
      [4, 2],
    ],
    reward: 40,
  },
  {
    name: 'Чаща',
    description: '112 костей · четыре яруса',
    layers: [
      [8, 8],
      [6, 6],
      [4, 2],
      [2, 2],
    ],
    reward: 65,
  },
] as const;

// Старый король и обычный ёжик совпадают без перезаписи сохранений и истории.
export function symbolKind(kind: number): number {
  return kind === 11 ? 9 : kind;
}

/** Кость свободна, если сверху ничего нет и хотя бы одна длинная сторона открыта. */
export function isFree(tile: Tile, tiles: Tile[]): boolean {
  const above = tiles.some((t) => t.z > tile.z && Math.abs(t.x - tile.x) < 1 && Math.abs(t.y - tile.y) < 1);
  const side = (dx: number) => tiles.some((t) => t.z === tile.z && t.x === tile.x + dx && Math.abs(t.y - tile.y) < 1);
  return !above && (!side(-1) || !side(1));
}
export function pairs(tiles: Tile[]): [Tile, Tile][] {
  const free = tiles.filter((t) => isFree(t, tiles));
  return free.flatMap((t, i) =>
    free
      .slice(i + 1)
      .filter((b) => symbolKind(b.kind) === symbolKind(t.kind))
      .map((b): [Tile, Tile] => [t, b]),
  );
}
function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** Сначала снимаем геометрию, затем раскладываем символы в обратном порядке: есть полный путь к победе. */
export function deal(positions: Tile[], rng: () => number = Math.random): Tile[] {
  const kinds = positions.filter((_, i) => i % 2 === 0).map((_, i) => symbolKind(i % 12));
  for (let attempt = 0; attempt < 200; attempt++) {
    let rest = [...positions];
    const result: Tile[] = [];
    while (rest.length) {
      const free = rest.filter((t) => isFree(t, rest));
      if (free.length < 2) break;
      const a = pick(free, rng);
      const b = pick(
        free.filter((t) => t.id !== a.id),
        rng,
      );
      const kind = kinds[result.length / 2]!;
      result.push({ ...a, kind }, { ...b, kind });
      rest = rest.filter((t) => t.id !== a.id && t.id !== b.id);
    }
    if (!rest.length) return result.sort((a, b) => a.id - b.id);
  }
  // После неудачных ходов геометрия может запереться: перестраиваем оставшиеся кости в один ярус.
  return deal(
    positions.map((t, i) => ({ ...t, x: i % 8, y: Math.floor(i / 8), z: 0 })),
    rng,
  );
}
export function newBoard(level: number, rng: () => number = Math.random): Tile[] {
  const positions: Tile[] = [];
  LEVELS[level]!.layers.forEach(([width, height], z) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) positions.push({ id: positions.length, x: x + (8 - width) / 2, y: y + (8 - height) / 2, z, kind: 0 });
    }
  });
  return deal(positions, rng);
}
export function rewardFor(level: number, best: number, assists: number): number {
  return LEVELS[level]!.reward + Math.max(0, Math.min(best, 10) * 2 - assists * 3);
}
