import { expect, it } from 'vitest';
import { recentHistory } from '../../scripts/classic-note-history';
it('recent history retains the latest existing path, treats rename as update, ignores deletion and invalid dates', () => {
  const old = 'Конспекты/Тест/старое.md',
    renamed = 'Конспекты/Тест/новое.md',
    added = 'Конспекты/Тест/занятие.pdf';
  const history = `@2026-11-14T10:00:00Z\nR100\t${old}\t${renamed}\nA\t${added}\nD\tКонспекты/удалено.md\n@2026-11-13T10:00:00Z\nA\t${renamed}\n@invalid\nM\tКонспекты/неизвестно.md`;
  const result = recentHistory(history, new Set([renamed, added, 'Конспекты/неизвестно.md']));
  expect([...result.keys()]).toEqual([renamed, added]);
  expect(result.get(renamed)).toEqual({ path: renamed, date: '2026-11-14T10:00:00Z', change: 'updated' });
  expect(result.get(added)?.change).toBe('added');
  expect(recentHistory('', new Set([renamed])).size).toBe(0);
});
