import { describe, expect, it } from 'vitest';
import { parseCanvas } from '../../components/diagrams/Canvas';
import { parseGraph } from '../../components/diagrams/Graph';
import { parsePlot } from '../../components/diagrams/Plot';
import { splitLines } from '../../components/diagrams/parse';
import { parseArray, parseChart, parseTree } from '../../components/diagrams/TreeArrayChart';
import { collectPdfPages, type SearchIndexFile, type TextSection } from '../search/pdfText';
import { checkCardFile, type NoteSource } from './check';
import { cardsKey } from './key';

/**
 * Проверка всех файлов карточек из src/data/cards против настоящих конспектов репозитория: формат, схемы в ответах, `src` указывает на
 * существующий раздел или страницу. Падает на ошибках; непокрытые разделы только выводятся (их смотрит `npm run cards:todo`).
 * Запуск: `npm run cards:check` (CI гоняет его вместе с остальными тестами).
 */
const CARDS = import.meta.glob<string>(['../../data/cards/**/*.md', '!../../data/cards/README.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const NOTES = import.meta.glob<string>('../../../../Конспекты/**/*.md', { query: '?raw', import: 'default', eager: true });
const INDEX = import.meta.glob<string>('../../../../data/search-index.json', { query: '?raw', import: 'default', eager: true });

function parseDiagram(lang: string, source: string) {
  const lines = splitLines(source, lang);
  if (lang === 'plot') parsePlot(lines);
  else if (lang === 'graph' || lang === 'diagram') parseGraph(lines, lang);
  else if (lang === 'tree') parseTree(lines);
  else if (lang === 'array') parseArray(lines, source);
  else if (lang === 'chart') parseChart(lines);
  else if (lang === 'canvas') parseCanvas(lines);
}

describe('карточки к конспектам', () => {
  it('все файлы карточек в порядке', () => {
    const notes = new Map<string, NoteSource>(
      Object.entries(NOTES).map(([path, text]) => [cardsKey(path.replace(/^.*?Конспекты\//, '')), { kind: 'md', text } as NoteSource]),
    );
    const pages = new Map<string, TextSection[]>();
    for (const raw of Object.values(INDEX)) collectPdfPages(JSON.parse(raw) as SearchIndexFile, pages);
    for (const [path, sections] of pages) notes.set(cardsKey(path.replace(/^Конспекты\//, '')), { kind: 'pdf', pages: sections });

    const problems: string[] = [];
    const report: string[] = [];
    for (const [path, text] of Object.entries(CARDS)) {
      const name = path.replace(/^.*?data\/cards\//, '');
      const result = checkCardFile(text, notes.get(cardsKey(name)), { parseDiagram });
      for (const error of result.errors) problems.push(`${name}: ${error}`);
      report.push(`${name}: карточек ${result.cards.length}, покрыто ${result.units.length - result.uncovered.length}/${result.units.length}`);
    }
    if (report.length) console.log(report.join('\n'));
    expect(problems).toEqual([]);
  });
});
