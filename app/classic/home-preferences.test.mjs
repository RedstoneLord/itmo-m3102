import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, migrateSetup, normalizeRecent, campusNow, duration } from './home-preferences.js';
test('four defaults, explicit none, legacy relative order, invalid IDs', () => {
  assert.equal(normalizeLayout(null).visible.length, 4);
  assert.deepEqual(normalizeLayout({ visible: [] }).visible, []);
  const x = normalizeLayout({ order: ['notes-panel', 'bogus', 'schedule-panel', 'notes-panel'] });
  assert.deepEqual(x.order.slice(0, 2), ['notes-panel', 'schedule-panel']);
  assert.equal(x.order.length, 8);
  assert.equal(x.visible.length, 4);
  assert.equal(normalizeLayout({ order: 'x', visible: 42 }).visible.length, 4);
});
test('missing identity differs from explicit guest; old completion never nags', () => {
  assert.equal(migrateSetup(null, null).completed, false);
  assert.equal(migrateSetup(null, {}).completed, false);
  assert.equal(migrateSetup(null, { login: '' }).completed, true);
  assert.equal(migrateSetup(null, { login: 'RedstoneLord' }).completed, true);
  assert.equal(migrateSetup({ version: 999, completed: true }, null).completed, true);
});
test('notes: supported current files, no title-based merging, honest dates', () => {
  const paths = ['Конспекты/Тест/Лекция_1/a.md', 'Конспекты/Тест/Лекция_1/a.pdf'];
  const result = normalizeRecent(
    [...paths.map((path) => ({ path, date: 'bad' })), { path: paths[0] }, { path: 'Конспекты/deleted.md' }, { path: 'docs/a.md' }],
    paths.map((path) => ({ path, type: 'blob' })),
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].date, null);
});
test('campus date across midnight and readable duration', () => {
  const d = campusNow(new Date('2026-11-14T22:30:00Z'));
  assert.equal(d.getDate(), 15);
  assert.equal(d.getHours(), 1);
  assert.equal(duration(66), '1 ч 6 мин');
});
