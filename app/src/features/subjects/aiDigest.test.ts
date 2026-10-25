import { describe, expect, it } from 'vitest';
import type { LectureNote } from '../../types/models';
import { buildSubjectChunks, buildSubjectDigest, demoteHeadings, readableUrls, splitByLimit } from './aiDigest';

const note = (fields: Partial<LectureNote>) =>
  ({ id: fields.title, subjectId: 'dm', source: 'github', archived: false, contentType: 'markdown', content: '', ...fields }) as LectureNote;

describe('файл предмета для ИИ', () => {
  it('заголовки конспекта — на уровень ниже, код не трогаем', () => {
    expect(demoteHeadings('## Раздел\n```py\n# комментарий\n```\n### Пункт')).toBe('#### Раздел\n```py\n# комментарий\n```\n##### Пункт');
  });

  it('ссылки — с кириллицей, пробел и скобки закодированы', () => {
    expect(readableUrls('[x](https://x/%D0%93%D1%80%D0%B0%D1%84%20%281%29.pdf)')).toBe('[x](https://x/Граф%20%281%29.pdf)');
  });

  it('по порядку занятий, группа отдельно от потока, PDF — текстом, ссылки в конце', () => {
    const text = buildSubjectDigest({
      subjectName: 'Дискретная математика',
      info: [],
      notes: [
        note({ title: 'Графы', lectureNumber: 'Лекция 2', content: '## Определение\nГраф — пара.' }),
        note({ title: 'Множества', lectureNumber: 'Лекция 1', content: 'Множество — набор.' }),
        note({ title: 'Деревья', lectureNumber: 'Лекция 3', contentType: 'pdf', content: 'https://x/d.pdf', sourceRef: 'd.pdf' }),

        // PDF того же занятия, что и .md, — дубль: ссылкой, без текста
        note({ title: 'Графы (PDF)', lectureNumber: 'Лекция 2', contentType: 'pdf', content: 'https://x/g.pdf', sourceRef: 'g.pdf' }),
        note({ title: 'Старое', lectureNumber: 'Лекция 9', archived: true, content: 'не попадает' }),
      ],
      materials: [],
      links: [{ title: 'Задачник', url: 'https://x/book' }],
      personalNotes: [],
      sourceUrl: () => undefined,
      pdfText: (item) => (item.sourceRef === 'd.pdf' ? 'Дерево — связный граф без циклов.' : 'ДУБЛЬ PDF'),
      date: '3 октября',
    });
    const order = ['## Лекция 1. Множества', '## Лекция 2. Графы', '#### Определение', 'связный граф без циклов', '[Задачник](https://x/book)'];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).not.toContain('не попадает');
    expect(text).not.toContain('ДУБЛЬ PDF');
    expect(text).toContain('PDF-версия: https://x/g.pdf');
  });

  it('длинный текст режется по пустым строкам на куски не длиннее предела, ничего не теряя', () => {
    const text = ['aaaa', 'bbbb', 'cccc', 'dddd'].join('\n\n');
    expect(splitByLimit(text, 100)).toEqual([`${text}\n`]);
    const pieces = splitByLimit(text, 11);
    expect(pieces).toEqual(['aaaa\n\nbbbb\n', 'cccc\n\ndddd\n']);
    expect(pieces.map((piece) => piece.trim()).join('\n\n')).toBe(text);
  });

  it('очень длинный конспект — несколькими файлами, в оглавлении ссылки на каждую часть', () => {
    const paragraphs = Array.from({ length: 30 }, (_, index) => 'Абзац номер ' + index + ' ' + 'текст '.repeat(2000)).join('\n\n');
    const { index, parts } = buildSubjectChunks(
      {
        subjectName: 'Матан',
        info: [],
        notes: [
          note({ title: 'Длинный', lectureNumber: 'Лекция 1', content: paragraphs }),
          note({ title: 'Короткий', lectureNumber: 'Лекция 2', content: 'Тут мало' }),
        ],
        materials: [],
        links: [],
        personalNotes: [],
        sourceUrl: () => undefined,
        pdfText: () => undefined,
        date: '3 октября',
      },
      'matan',
    );
    const names = parts.map((part) => part.name);
    expect(names.slice(0, 2)).toEqual(['matan/01-1.md', 'matan/01-2.md']);
    expect(names.at(-1)).toBe('matan/02.md');
    expect(parts.every((part) => part.text.length < 90_000)).toBe(true);
    expect(parts[1]!.text).toContain('# Матан — Лекция 1. Длинный (часть 2 из ');
    expect(index).toContain('1. [Лекция 1. Длинный — ч. 1](https://redstonelord.github.io/itmo-m3102/app/ai/matan/01-1.md), [ч. 2](');
    expect(index).toContain('2. [Лекция 2. Короткий](https://redstonelord.github.io/itmo-m3102/app/ai/matan/02.md)');
  });
});
