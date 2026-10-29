// Текст PDF по страницам — из data/search-index.json (его строит бот группы), чтобы не искать и не читать PDF самому.
//   npm run cards:pdf -- Коллоквиум           — первый PDF, в пути которого есть «Коллоквиум»
//   npm run cards:pdf -- Рекурсия --pages 3-6  — только страницы 3–6
import { loadNotes } from './cards-lib';

const args = process.argv.slice(2);
const filter = args.find((arg) => !arg.startsWith('--'))?.toLowerCase();
const range = /^(\d+)(?:-(\d+))?$/.exec(args[args.indexOf('--pages') + 1] ?? '');
if (!filter) {
  console.error('Укажи часть пути PDF: npm run cards:pdf -- Рекурсия [--pages 3-6]');
  process.exit(1);
}
const matches = loadNotes().filter((note) => note.kind === 'pdf' && note.path.toLowerCase().includes(filter));
const note = matches[0];
if (!note || note.source.kind !== 'pdf') {
  console.error('PDF с текстом не найден (у сканов текста нет).');
  process.exit(1);
}
if (matches.length > 1)
  console.error(
    `Подходит ${matches.length} файлов, взят первый: ${note.path}. Остальные:\n${matches
      .slice(1)
      .map((other) => `  ${other.path}`)
      .join('\n')}\n`,
  );
const from = range ? Number(range[1]) : 0;
const to = range ? Number(range[2] ?? range[1]) : Infinity;
console.log(`# ${note.path} (карточка указывает страницы так: src="Стр. 5" или src="Стр. 5–7")\n`);
for (const page of note.source.pages) {
  const number = Number(/(\d+)/.exec(page.heading)?.[1]);
  if (number >= from && number <= to) console.log(`=== ${page.heading} ===\n${page.text.trim()}\n`);
}
