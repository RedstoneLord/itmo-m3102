import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineGroups, exportPersonal, parsePersonal, restorePersonal, listing, validTree, shuffled } from './student-core.js';
import { plainMathText } from './student-text.js';
import { readFileSync } from 'node:fs';

test('plain headings keep formulas readable without TeX commands', () => {
  const examples = [
    [String.raw`Теорема о последовательности x_n = \left(1 + \frac{1}{n}\right)^n`, 'Теорема о последовательности xₙ = (1 + (1/n))ⁿ'],
    [String.raw`Поле $\mathbb{C}$ и \mathbb{R}^2`, 'Поле ℂ и ℝ²'],
    [String.raw`Оценка \Theta(n^2 \log n)`, 'Оценка Θ(n² log n)'],
    [String.raw`x \in \{1,2,3\} \Rightarrow x \geq 1`, 'x ∈ {1,2,3} ⇒ x ≥ 1'],
    [String.raw`\frac{a+b}{c+d}`, '((a+b)/(c+d))'],
    [String.raw`\frac{1}{\frac{a}{b}}`, '(1/((a/b)))'],
    [String.raw`\sqrt{x^2} и a_{ij}`, '√(x²) и aᵢⱼ'],
    [String.raw`\textbf{Теорема} \unknown{A}`, 'Теорема unknownA'],
    ['Лекция 7 — второй замечательный предел', 'Лекция 7 — второй замечательный предел'],
  ];
  for (const [source, expected] of examples) assert.equal(plainMathText(source), expected);
});

test('every indexed lecture heading is free of raw TeX commands after formatting', () => {
  const index = JSON.parse(readFileSync(new URL('../../data/lectures.json', import.meta.url), 'utf8'));
  for (const subject of index.subjects)
    for (const lecture of subject.lectures)
      for (const file of lecture.files)
        for (const heading of file.headings || []) {
          assert.doesNotMatch(plainMathText(heading), /\\[A-Za-z]+|[\^_]\{|\$/);
        }
});

test('future, debts and group archive stay separate from personal completion', () => {
  const items = [
    { id: 'future', deadline: '2030-01-01' },
    { id: 'debt', deadline: '2020-01-01' },
    { id: 'shared', deadline: '2030-01-01', status: 'completed' },
    { id: 'personal', deadline: '2020-01-01' },
    { id: 'bad', deadline: 'invalid' },
  ];
  const result = deadlineGroups(items, { 'deadline:personal': true }, Date.parse('2026-01-01'));
  assert.deepEqual(
    result.upcoming.map((x) => x.id),
    ['future'],
  );
  assert.deepEqual(
    result.debts.map((x) => x.id),
    ['debt'],
  );
  assert.deepEqual(
    result.archive.map((x) => x.id),
    ['shared', 'personal'],
  );
});
const memory = (initial) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key), map };
};
test('backup roundtrip includes plan, marks and games and excludes credentials and caches', () => {
  const storage = memory({
    'm3102-study-plan-v1': '{"tasks":[],"done":{"deadline:x":true}}',
    hh_save_v1: '{"berries":17}',
    'm3102-github-token-v1': 'secret',
    'm3102-cache-homework-v1': '{"items":[]}',
  });
  const backup = parsePersonal(JSON.stringify(exportPersonal(storage)));
  assert.equal(Object.keys(backup.data).length, 2);
  const target = memory({ 'm3102-bookmarks-v1': '{"old":{}}', 'm3102-github-token-v1': 'kept' });
  restorePersonal(target, backup);
  assert.equal(target.getItem('hh_save_v1'), '{"berries":17}');
  assert.equal(target.getItem('m3102-bookmarks-v1'), null);
  assert.equal(target.getItem('m3102-github-token-v1'), 'kept');
});
test('backup rejects future versions, foreign keys, malformed JSON and wrong plan schema before writing', () => {
  const backup = { app: 'm3102-classic-personal', version: 1, data: { 'm3102-study-plan-v1': '{"tasks":[],"done":{}}' } };
  for (const value of [
    { ...backup, version: 2 },
    { ...backup, data: { 'm3102-github-token-v1': '{}' } },
    { ...backup, data: { 'm3102-study-plan-v1': '{"tasks":null}' } },
  ])
    assert.throws(() => parsePersonal(JSON.stringify(value)));
  assert.throws(() => parsePersonal('broken'));
});
test('failed restore rolls back personal data', () => {
  const storage = memory({ 'm3102-bookmarks-v1': '{"old":true}', hh_save_v1: '{"berries":9}' });
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (value === '{"huge":true}') throw new Error('quota');
    set(key, value);
  };
  assert.throws(() => restorePersonal(storage, { data: { 'm3102-bookmarks-v1': '{}', hh_save_v1: '{"huge":true}' } }));
  assert.equal(storage.getItem('m3102-bookmarks-v1'), '{"old":true}');
  assert.equal(storage.getItem('hh_save_v1'), '{"berries":9}');
});
test('directory lists direct children and rejects truncated trees', () => {
  const tree = [
    { path: 'Конспекты', type: 'tree' },
    { path: 'Конспекты/Матан', type: 'tree' },
    { path: 'Конспекты/Матан/a.md', type: 'blob' },
  ];
  assert.equal(listing(tree, 'Конспекты')[0].type, 'dir');
  assert.equal(listing(tree, 'Конспекты').length, 1);
  assert.throws(() => validTree({ tree, truncated: true }));
  assert.throws(() => validTree({ tree: [{ path: '../private', type: 'blob' }] }));
});
test('shuffle keeps source array and question membership', () => {
  const original = [1, 2, 3, 4];
  assert.deepEqual(
    shuffled(original, () => 0),
    [2, 3, 4, 1],
  );
  assert.deepEqual(original, [1, 2, 3, 4]);
});
