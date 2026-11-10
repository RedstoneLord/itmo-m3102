// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { pairs } from './engine';
import { useMahjongStore } from './mahjongStore';
import { loadAll, saveAll } from '../../../../js/casino-common.js';
vi.mock('../../../../js/casino-common.js', () => ({ loadAll: vi.fn(), saveAll: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAll).mockReturnValue({
    S: {} as ReturnType<typeof loadAll>['S'],
    H: { berries: 10, owned: ['none'], hat: 'none', bonusSpins: 0, boosts: {} },
    notes: [],
  });
  useMahjongStore.setState({ game: null, wins: 0, total: 0 });
});
it('платит в общий баланс только за завершённую партию и не даёт повторить последний ход', () => {
  const store = useMahjongStore;
  store.getState().start(0);
  const game = store.getState().game!;
  store.setState({
    game: {
      ...game,
      tiles: [
        { id: 1, x: 0, y: 0, z: 0, kind: 0 },
        { id: 2, x: 1, y: 0, z: 0, kind: 0 },
      ],
    },
  });
  expect(store.getState().match(1, 1)).toBe(false);
  expect(saveAll).not.toHaveBeenCalled();
  expect(store.getState().match(1, 2)).toBe(true);
  expect(saveAll).toHaveBeenCalledTimes(1);
  expect(vi.mocked(loadAll).mock.results[0]!.value.H.berries).toBe(32);
  expect(store.getState().wins).toBe(1);
  store.getState().undo();
  store.getState().match(1, 2);
  expect(store.getState().game!.tiles).toHaveLength(0);
  expect(saveAll).toHaveBeenCalledTimes(1);
});
it('отмена восстанавливает пару, сбрасывает серию и учитывает помощь', () => {
  useMahjongStore.getState().start(0);
  const game = useMahjongStore.getState().game!;
  const pair = pairs(game.tiles)[0]!;
  useMahjongStore.getState().match(pair[0].id, pair[1].id);
  useMahjongStore.getState().undo();
  expect(useMahjongStore.getState().game!.tiles).toHaveLength(48);
  expect(useMahjongStore.getState().game!.assists).toBe(1);
  expect(saveAll).not.toHaveBeenCalled();
});
it('не начисляет ягоды повторно при восстановлении старой копии партии', () => {
  const store = useMahjongStore;
  store.getState().start(0);
  const game = store.getState().game!;
  const shared = vi.mocked(loadAll)().H;
  shared.mahjongClaims = [game.id];
  vi.mocked(loadAll).mockReturnValue({ S: {} as ReturnType<typeof loadAll>['S'], H: shared, notes: [] });
  store.setState({
    game: {
      ...game,
      tiles: [
        { id: 1, x: 0, y: 0, z: 0, kind: 0 },
        { id: 2, x: 1, y: 0, z: 0, kind: 0 },
      ],
    },
  });
  store.getState().match(1, 2);
  expect(shared.berries).toBe(10);
  expect(saveAll).not.toHaveBeenCalled();
});
