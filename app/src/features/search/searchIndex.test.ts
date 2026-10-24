import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLectureNotesStore } from '../materials/lectureNotesStore';
import type { LectureNote } from '../../types/models';
import {
  hasAllWords,
  loadPdfIndex,
  markdownSections,
  markParts,
  normalize,
  pdfIndexStatus,
  plainText,
  queryWords,
  search,
  snippet,
} from './searchIndex';

describe('поиск по тексту', () => {
  it('markdown → простой текст', () => {
    expect(plainText('## Предикат $P(x)$\n> [!info] Важно\n**жирный** [[Дискретная математика|ДМ]] [ссылка](https://x.y)')).toBe(
      'Предикат P(x) Важно жирный ДМ ссылка',
    );
  });

  it('код ищется, mermaid — нет, у схем — подписи и надписи', () => {
    expect(plainText('```cpp\nstd::vector v;\n```\n```mermaid\ngraph TD\n```')).toBe('std::vector v;');
    expect(plainText('```diagram\ntitle: Сортировка вставками\nA: round "Старт"\nA -> B\n```')).toBe('Сортировка вставками Старт');
  });

  it('слова запроса — в любом порядке и не рядом', () => {
    const text = 'Предел последовательности: если он существует, то он единственный.';
    expect(hasAllWords(normalize(text), queryWords('единственный  предел'))).toBe(true);
    expect(snippet(text, queryWords('единственный предел'))).toContain('единственный');
    expect(hasAllWords(normalize(text), queryWords('предел функции'))).toBe(false);
  });

  it('формулы читаемые', () => {
    expect(plainText('Рефлексивность: $\\forall a: a \\le a$ на $\\mathbb{R}$')).toBe('Рефлексивность: ∀ a: a ≤ a на R');
  });

  it('сниппет вокруг совпадения, ё = е, начало — с границы слова', () => {
    const text = 'Начало. '.repeat(10) + 'Тут ёжик делает сальто. ' + 'Конец. '.repeat(30);
    const found = snippet(text, queryWords('ежик'));
    expect(found).toContain('ёжик делает сальто');
    expect(found.startsWith('…')).toBe(true);
    expect(found).toMatch(/^…Начало\./); // не «…чало.», а с целого слова
    expect(found.endsWith('…')).toBe(true);
  });

  it('слов в тексте нет (совпал заголовок раздела) — сниппет с начала', () => {
    expect(snippet('Первая фраза раздела. Вторая.', queryWords('графы'))).toBe('Первая фраза раздела. Вторая.');
  });
});

describe('разделы конспекта', () => {
  it('режутся по заголовкам, текст до первого — без названия, # в коде не заголовок', () => {
    const sections = markdownSections(
      'Вступление\n\n# Графы\n\nВершины и рёбра.\n\n```cpp\n# не заголовок\n```\n\n## Определение $G$\n\nПара множеств.\n\n## Пусто\n',
    );
    expect(sections).toEqual([
      { heading: '', text: 'Вступление' },
      { heading: 'Графы', text: 'Вершины и рёбра. не заголовок' },
      { heading: 'Определение G', text: 'Пара множеств.' },
    ]);
  });
});

describe('выделение найденного', () => {
  it('слова запроса выделяются без учёта регистра и ё', () => {
    expect(markParts('Тут Ёжик делает сальто', queryWords('ежик сальто'))).toEqual([
      { text: 'Тут ', hit: false },
      { text: 'Ёжик', hit: true },
      { text: ' делает ', hit: false },
      { text: 'сальто', hit: true },
    ]);
  });

  it('пересекающиеся слова не дублируют текст; без совпадений — один кусок', () => {
    const parts = markParts('abc', ['ab', 'bc']);
    expect(parts.map((part) => part.text).join('')).toBe('abc');
    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['ab', 'c']);
    expect(markParts('ничего', ['граф'])).toEqual([{ text: 'ничего', hit: false }]);
    expect(markParts('', ['граф'])).toEqual([{ text: '', hit: false }]);
  });
});

function note(id: string, title: string, content: string, extra: Partial<LectureNote> = {}): LectureNote {
  const now = new Date().toISOString();
  return {
    id,
    subjectId: 'dm',
    lectureNumber: '',
    title,
    contentType: 'markdown',
    content,
    source: 'github',
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const inNotes = (query: string) => search(query, { group: 'Конспекты' }).flatMap((group) => group.results);

describe('выдача по тексту конспектов', () => {
  it('нашлось в тексте — раздел, где именно, и кусок текста с ё = е', () => {
    useLectureNotesStore.setState({
      lectureNotes: [note('a', 'Графы', '# Графы\n\n## Определение\n\nГраф — пара: вершины и рёбра.\n\n## Степени\n\nСумма степеней чётна.')],
    });
    const [hit, ...rest] = inNotes('ребра');
    expect(rest).toEqual([]);
    expect(hit).toMatchObject({ title: 'Графы', section: 'Определение', id: 'a#0' });
    expect(hit?.snippet).toContain('рёбра');
  });

  it('совпал заголовок раздела — сниппет с начала раздела', () => {
    useLectureNotesStore.setState({ lectureNotes: [note('a', 'Графы', '## Степени вершин\n\nСумма чётна.')] });
    expect(inNotes('степени')[0]).toMatchObject({ section: 'Степени вершин', snippet: 'Сумма чётна.' });
  });

  it('лучшие первыми: заголовок и частота весомее; из одного конспекта — не больше двух разделов', () => {
    useLectureNotesStore.setState({
      lectureNotes: [
        note('once', 'Мимоходом', '## Разное\n\nЗдесь один раз упомянут предел.'),
        note('many', 'Анализ', '## Предел\n\nПредел, предел.\n\n## Другое\n\nПредел и ещё предел.\n\n## Третье\n\nПредел.'),
      ],
    });
    const rows = inNotes('предел');
    expect(rows.map((row) => row.id)).toEqual(['many#0', 'many#1', 'once#0']);
    expect(rows[0]?.section).toBe('Предел');
  });

  it('слова в разных разделах конспекта — конспект находится, место самого длинного слова', () => {
    useLectureNotesStore.setState({
      lectureNotes: [note('a', 'Анализ', '## Ряды\n\nСходимость ряда.\n\n## Функции\n\nНепрерывность функции.')],
    });
    const rows = inNotes('сходимость непрерывность');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ section: 'Функции' });
    expect(inNotes('сходимость нет-такого')).toEqual([]);
  });

  it('по названию: с начала названия — выше, чем в середине', () => {
    useLectureNotesStore.setState({ lectureNotes: [note('mid', 'Введение в графы', ''), note('start', 'Графы', '')] });
    expect(inNotes('граф').map((row) => row.id)).toEqual(['start', 'mid']);
  });
});

describe('текст PDF', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('страницы PDF ищутся постранично, выдача называет страницу', async () => {
    const raw = {
      files: ['Конспекты/ДМ/Деревья.pdf', 'Конспекты/ДМ/Графы.md'],
      sections: [
        [0, 'Стр. 1', 'Оглавление и вводные слова.', 1],
        [0, 'Стр. 2', 'Остовное дерево связного графа.', 2],
        [1, 'Раздел', 'Остовное дерево из .md не нужно: оно уже в конспектах.'],
      ],
    };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(raw)));
    await loadPdfIndex();
    expect(pdfIndexStatus()).toBe('ready');

    useLectureNotesStore.setState({
      lectureNotes: [note('pdf', 'Деревья', 'data:application/pdf;base64,', { contentType: 'pdf', sourceRef: 'Конспекты/ДМ/Деревья.pdf' })],
    });
    const rows = inNotes('остовное');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Деревья', section: 'Стр. 2' });
    expect(rows[0]?.snippet).toContain('Остовное дерево');
  });
});
