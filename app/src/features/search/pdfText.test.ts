import { describe, expect, it } from 'vitest';
import { collectPdfPages, collectPdfText } from './pdfText';

const raw = {
  files: ['Конспекты/ДМ/Деревья.pdf', 'Конспекты/ДМ/Графы.md'],
  sections: [
    [0, 'Стр. 1', 'раз'],
    [1, 'Определение', 'не PDF'],
    [0, 'Стр. 2', 'два'],
  ] as [number, string, string][],
};

describe('текст PDF из индекса группы', () => {
  it('страницы одного PDF идут по порядку, не-PDF пропускаются', () => {
    const pages = new Map();
    collectPdfPages(raw, pages);
    expect([...pages.keys()]).toEqual(['Конспекты/ДМ/Деревья.pdf']);
    expect(pages.get('Конспекты/ДМ/Деревья.pdf')).toEqual([
      { heading: 'Стр. 1', text: 'раз' },
      { heading: 'Стр. 2', text: 'два' },
    ]);
  });

  it('«Для ИИ»: текст файла — страницы одной строкой, как раньше', () => {
    const text = new Map<string, string>();
    collectPdfText(raw, text);
    expect(text.get('Конспекты/ДМ/Деревья.pdf')).toBe(' Стр. 1 раз Стр. 2 два');
  });

  it('пустой или битый индекс ничего не добавляет', () => {
    const pages = new Map();
    collectPdfPages(null, pages);
    collectPdfPages({ files: [] }, pages);
    expect(pages.size).toBe(0);
  });
});
