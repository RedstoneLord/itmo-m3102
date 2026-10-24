// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sync = vi.fn();
const readLastSync = vi.fn<() => number | null>(() => null);
vi.mock('./githubContent', () => ({
  syncGithubContent: () => sync(),
  autoSyncGithubContent: () => sync(),
  readLastSync: () => readLastSync(),
}));

const { useSyncStore, useSyncReady, useSyncStamp } = await import('./syncStore');

describe('syncStore', () => {
  beforeEach(() => {
    sync.mockReset();
    readLastSync.mockReset().mockReturnValue(null);
    useSyncStore.setState({ status: 'idle', summary: null, error: '', lastSync: null });
  });

  it('кнопка + автосинхронизация одновременно — запрос к GitHub один', async () => {
    let finish!: (value: unknown) => void;
    sync.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const first = useSyncStore.getState().run();
    const second = useSyncStore.getState().runAuto();
    expect(useSyncStore.getState().status).toBe('syncing');
    finish({ notes: 1 });
    await Promise.all([first, second]);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState()).toMatchObject({ status: 'done', summary: { notes: 1 } });
  });

  it('fetch без сети (TypeError) — понятный текст, а не «Failed to fetch»', async () => {
    sync.mockRejectedValue(new TypeError('Failed to fetch'));
    await useSyncStore.getState().run();
    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().error).toMatch(/Нет интернета/);
  });

  it('нет сети заранее — GitHub не трогаем', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await useSyncStore.getState().run();
    expect(sync).not.toHaveBeenCalled();
    expect(useSyncStore.getState().error).toMatch(/Нет интернета/);
    vi.restoreAllMocks();
  });

  it('время последней удачной синхронизации берётся заново после неё', async () => {
    sync.mockResolvedValue({ notes: 1 });
    readLastSync.mockReturnValue(1_000);
    await useSyncStore.getState().run();
    expect(useSyncStore.getState().lastSync).toBe(1_000);
  });
});

describe('useSyncReady', () => {
  beforeEach(() => useSyncStore.setState({ status: 'idle', summary: null, error: '', lastSync: null }));

  it('холодный старт: сохранённого нет, первая синхронизация не закончилась — не готово', () => {
    const { result } = renderHook(() => useSyncReady());
    expect(result.current).toBe(false);
    act(() => useSyncStore.setState({ status: 'syncing' }));
    expect(result.current).toBe(false);
  });

  it('первая синхронизация закончилась — готово, и удачно, и с ошибкой', () => {
    const { result } = renderHook(() => useSyncReady());
    act(() => useSyncStore.setState({ status: 'done' }));
    expect(result.current).toBe(true);
    act(() => useSyncStore.setState({ status: 'error' }));
    expect(result.current).toBe(true);
  });

  it('есть данные прошлой синхронизации — готово сразу, пока идёт новая', () => {
    useSyncStore.setState({ status: 'syncing', lastSync: Date.now() });
    const { result } = renderHook(() => useSyncReady());
    expect(result.current).toBe(true);
  });
});

describe('useSyncStamp', () => {
  const at = new Date(2026, 9, 1, 12, 5).getTime();
  beforeEach(() => useSyncStore.setState({ status: 'idle', summary: null, error: '', lastSync: null }));

  it('синхронизации не было — подписи нет', () => {
    const { result } = renderHook(() => useSyncStamp());
    expect(result.current).toBeNull();
  });

  it('старые данные: дата видна, пока идёт обновление и после неудачи', () => {
    useSyncStore.setState({ status: 'syncing', lastSync: at });
    const { result } = renderHook(() => useSyncStamp());
    expect(result.current).toBe('Данные от 1 окт., 12:05 · обновляем…');
    act(() => useSyncStore.setState({ status: 'error' }));
    expect(result.current).toBe('Данные от 1 окт., 12:05 · обновить не вышло');
  });

  it('обновилось — «Обновлено»', () => {
    useSyncStore.setState({ status: 'done', lastSync: at });
    const { result } = renderHook(() => useSyncStamp());
    expect(result.current).toBe('Обновлено 1 окт., 12:05');
  });
});
