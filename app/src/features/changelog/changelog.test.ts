import { describe, expect, it } from 'vitest';
import { CHANGELOG } from './changelog';
import { LATEST_CHANGE } from './latestChange';

describe('что нового', () => {
  it('выпуски идут от новых к старым, у каждого есть строки, последний — тот, что отмечают «увиденным»', () => {
    const ids = CHANGELOG.map((entry) => entry.id);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(new Set(ids).size).toBe(ids.length);
    expect(CHANGELOG.every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.id) && entry.items.length > 0)).toBe(true);
    expect(LATEST_CHANGE).toBe(ids[0]);
  });
});
