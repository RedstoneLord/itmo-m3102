import { describe, expect, it } from 'vitest';
import { buildCardFiles } from './aiCards';
import { parseCards } from './parse';

const { cards } = parseCards(
  '@@ id=a type=theorem src="Случай q < 1"\nQ: Чему равно T(n) при a < b^c?\nA:\nΘ(n^c): ряд сходится, главный уровень — корень.\n\n@@ id=b type=calc src="Случай q = 1"\nQ: Оцени T(n)=2T(n/2)+n\nA:\nΘ(n log n): все уровни одинаковы.\n',
);

describe('buildCardFiles', () => {
  const base = 'https://example.test/ai/';
  const files = buildCardFiles({
    subjectId: 'aisd',
    subjectName: 'Алгоритмы',
    date: '29 октября',
    base,
    files: [
      { title: 'Мастер-Теорема', group: 'Практика 3', sourceUrl: 'https://github.test/x.md', cards },
      { title: 'Сортировки', group: '', cards: cards.slice(0, 1) },
    ],
  });

  it('оглавление со ссылками на наборы и числом карточек по типам', () => {
    const index = files['aisd/cards/index.md']!;
    expect(index).toContain('[Мастер-Теорема — Практика 3](https://example.test/ai/aisd/cards/01.md) — 2 карточки: Теорема ×1, Вычисли ×1');
    expect(index).toContain('[Сортировки](https://example.test/ai/aisd/cards/02.md) — 1 карточка: Теорема ×1');
    expect(index).toContain('задавай вопросы по одному');
  });

  it('файл набора: источник, карточки с типом, разделом, вопросом и ответом', () => {
    const lecture = files['aisd/cards/01.md']!;
    expect(lecture).toContain('# Алгоритмы — карточки: Мастер-Теорема (Практика 3)');
    expect(lecture).toContain('Конспект: https://github.test/x.md');
    expect(lecture).toContain('## Карточка 1 · Теорема · Случай q < 1');
    expect(lecture).toContain('**Вопрос.** Чему равно T(n) при a < b^c?');
    expect(lecture).toContain('Θ(n^c): ряд сходится');
  });

  it('без карточек — ни одного файла', () => {
    expect(buildCardFiles({ subjectId: 'dm', subjectName: 'ДМ', date: 'x', base, files: [] })).toEqual({});
  });
});
