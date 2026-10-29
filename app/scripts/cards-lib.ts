// Общее для скриптов карточек (cards-todo.ts, cards-pdf.ts): чтение конспектов, текста PDF и файлов карточек из чекаута репозитория.
// Запускать из app/ (как все npm-скрипты): корень репозитория — на уровень выше.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkCardFile, type CheckResult, type NoteSource } from '../src/features/cards/check';
import { cardsKey } from '../src/features/cards/key';
import { collectPdfPages, type SearchIndexFile, type TextSection } from '../src/features/search/pdfText';

export const ROOT = join(process.cwd(), '..');
const CARDS_DIR = 'app/src/data/cards';

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');

export interface NoteEntry {
  /** Путь в репозитории: `Конспекты/Предмет/Лекция_1/Файл.md` */
  path: string;
  key: string;
  subject: string;
  kind: 'md' | 'pdf';
  chars: number;
  source: NoteSource;
  /** PDF, у которого в той же папке есть .md: карточки делаются по .md, этому не нужны */
  twin: boolean;
  /** Путь, по которому должен лежать файл карточек (от корня репозитория) */
  cardsPath: string;
  cardsText: string | undefined;
}

/** Все конспекты (.md и .pdf с текстом) и их файлы карточек, если они уже есть */
export function loadNotes(): NoteEntry[] {
  const paths = walk('Конспекты');
  const mdFolders = new Set(paths.filter((path) => path.endsWith('.md')).map((path) => path.slice(0, path.lastIndexOf('/'))));
  const pdfPages = new Map<string, TextSection[]>();
  collectPdfPages(JSON.parse(read('data/search-index.json')) as SearchIndexFile, pdfPages);
  const cards = new Map(
    walk(CARDS_DIR)
      .filter((path) => path.endsWith('.md') && !path.endsWith('/README.md'))
      .map((path) => [cardsKey(path), path]),
  );

  const entries: NoteEntry[] = [];
  for (const path of paths) {
    const isMd = path.endsWith('.md');
    const isPdf = path.toLowerCase().endsWith('.pdf');
    if (!isMd && !isPdf) continue;
    const pages = isPdf ? pdfPages.get(path) : undefined;
    // PDF без текста (скан) карточек не получит: делать их не из чего
    if (isPdf && (!pages || pages.length === 0)) continue;
    const text = isMd ? read(path) : '';
    const key = cardsKey(path);
    const cardsPath = cards.get(key);
    entries.push({
      path,
      key,
      subject: path.split('/')[1]!,
      kind: isMd ? 'md' : 'pdf',
      chars: isMd ? text.length : pages!.reduce((sum, page) => sum + page.text.length, 0),
      source: isMd ? { kind: 'md', text } : { kind: 'pdf', pages: pages! },
      twin: isPdf && /(Лекция|Практика)_?\d/i.test(path.split('/').at(-2) ?? '') && mdFolders.has(path.slice(0, path.lastIndexOf('/'))),
      cardsPath: cardsPath ?? `${CARDS_DIR}/${path.replace(/^Конспекты\//, '')}${isMd ? '' : '.md'}`,
      cardsText: cardsPath ? read(cardsPath) : undefined,
    });
  }
  return entries;
}

/** Файлы карточек, к которым нет конспекта (опечатка в пути или конспект переименован) */
export function orphanCardFiles(notes: NoteEntry[]): string[] {
  const known = new Set(notes.map((note) => note.key));
  return walk(CARDS_DIR)
    .filter((path) => path.endsWith('.md') && !path.endsWith('/README.md'))
    .filter((path) => !known.has(cardsKey(path)));
}

export function checkEntry(entry: NoteEntry): CheckResult | undefined {
  return entry.cardsText === undefined ? undefined : checkCardFile(entry.cardsText, entry.source);
}
