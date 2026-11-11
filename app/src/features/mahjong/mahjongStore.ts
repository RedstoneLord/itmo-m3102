import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { loadAll, saveAll } from '../../../../js/casino-common.js';
import { localStore, storageKey } from '../../lib/storage';
import { deal, isFree, symbolKind, newBoard, rewardFor, type Tile } from './engine';

interface Game {
  id: string;
  level: number;
  rows: number;
  offset: number;
  tiles: Tile[];
  history: Tile[][];
  combo: number;
  best: number;
  lastMatch: number;
  assists: number;
  earned: number;
}
interface MahjongStore {
  game: Game | null;
  wins: number;
  total: number;
  start: (level: number) => void;
  match: (a: number, b: number) => boolean;
  assist: () => void;
  undo: () => void;
  shuffle: () => void;
}
export const useMahjongStore = create<MahjongStore>()(
  persist(
    (set, get) => ({
      game: null,
      wins: 0,
      total: 0,
      start: (level) =>
        set({
          game: {
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
          },
        }),
      match: (a, b) => {
        const g = get().game;
        if (!g || a === b || g.earned) return false;
        const first = g.tiles.find((t) => t.id === a);
        const second = g.tiles.find((t) => t.id === b);
        if (!first || !second || symbolKind(first.kind) !== symbolKind(second.kind) || !isFree(first, g.tiles) || !isFree(second, g.tiles))
          return false;
        const now = Date.now();
        const combo = now - g.lastMatch <= 12_000 ? g.combo + 1 : 1;
        const next = {
          ...g,
          tiles: g.tiles.filter((t) => t.id !== a && t.id !== b),
          history: [...g.history, [first, second]],
          combo,
          best: Math.max(combo, g.best),
          lastMatch: now,
        };
        if (!next.tiles.length) {
          const { S, H } = loadAll();
          const claims = Array.isArray(H.mahjongClaims) ? (H.mahjongClaims as string[]) : [];
          next.earned = rewardFor(g.level, next.best, g.assists);
          if (!claims.includes(g.id)) {
            H.berries += next.earned;
            H.mahjongClaims = [...claims, g.id];
            saveAll(S, H);
          }
          set({ game: next, wins: get().wins + 1, total: get().total + next.earned });
        } else set({ game: next });
        return true;
      },
      assist: () => {
        const g = get().game;
        if (g && !g.earned) set({ game: { ...g, assists: g.assists + 1, combo: 0, lastMatch: 0 } });
      },
      undo: () => {
        const g = get().game;
        const last = g?.history.at(-1);
        if (!g || !last || g.earned) return;
        set({
          game: {
            ...g,
            tiles: [...g.tiles, ...last].sort((a, b) => a.id - b.id),
            history: g.history.slice(0, -1),
            assists: g.assists + 1,
            combo: 0,
            lastMatch: 0,
          },
        });
      },
      shuffle: () => {
        const g = get().game;
        if (g && !g.earned) {
          const tiles = deal(g.tiles);
          const offset = Math.min(...tiles.map((t) => t.y));
          const rows = Math.max(...tiles.map((t) => t.y)) - offset + 1;
          set({ game: { ...g, tiles, rows, offset, history: [], assists: g.assists + 1, combo: 0, lastMatch: 0 } });
        }
      },
    }),
    { name: storageKey('mahjong'), storage: localStore, version: 1 },
  ),
);
