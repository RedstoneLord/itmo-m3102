// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { localStore } from './storage';

it('нет места — выбрасываем кеш конспектов и всё равно сохраняем личные данные', () => {
  localStorage.setItem('m3102:lecture-notes', 'x'.repeat(100));
  const original = Storage.prototype.setItem;
  // «Квота»: пока лежит кеш конспектов, новое не помещается
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (this.getItem('m3102:lecture-notes') !== null) throw new DOMException('full', 'QuotaExceededError');
    original.call(this, key, value);
  });

  localStore!.setItem('m3102:tasks', { state: { done: 1 }, version: 0 });

  expect(localStorage.getItem('m3102:lecture-notes')).toBeNull();
  expect(JSON.parse(localStorage.getItem('m3102:tasks')!)).toEqual({ state: { done: 1 }, version: 0 });
  vi.restoreAllMocks();
});

it('нет места — конспекты, добавленные руками, остаются: скачать их заново неоткуда', () => {
  const cache = { id: 'gh:1', source: 'github' };
  const mine = { id: 'm1', source: 'manual' };
  const full = JSON.stringify({ state: { lectureNotes: [cache, mine] }, version: 2 });
  localStorage.setItem('m3102:lecture-notes', full);
  const original = Storage.prototype.setItem;
  // «Квота»: пока в хранилище лежит кеш GitHub, новое не помещается
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (this.getItem('m3102:lecture-notes')?.includes('gh:1') && key !== 'm3102:lecture-notes') throw new DOMException('full', 'QuotaExceededError');
    original.call(this, key, value);
  });

  localStore!.setItem('m3102:tasks', { state: { done: 2 }, version: 0 });

  expect(JSON.parse(localStorage.getItem('m3102:lecture-notes')!)).toEqual({ state: { lectureNotes: [mine] }, version: 2 });
  expect(JSON.parse(localStorage.getItem('m3102:tasks')!).state).toEqual({ done: 2 });
  vi.restoreAllMocks();
});

it('браузер запретил данные сайта (localStorage бросает SecurityError) — idleStorage не падает при создании', async () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
  try {
    const { idleStorage } = await import('./storage');
    const storage = idleStorage<{ a: number }>();
    expect(storage.getItem('m3102:x')).toBeNull();
    expect(() => storage.setItem('m3102:x', { state: { a: 1 }, version: 0 })).not.toThrow();
  } finally {
    Object.defineProperty(window, 'localStorage', original);
  }
});
