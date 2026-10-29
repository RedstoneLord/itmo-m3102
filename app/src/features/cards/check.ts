import { parseCards, type Card } from './parse';

/** Откуда берутся разделы: заголовки конспекта .md или страницы PDF (по ним проверяется, что карточки покрывают всё) */
export type NoteSource = { kind: 'md'; text: string } | { kind: 'pdf'; pages: { heading: string; text: string }[] };

export interface CheckOptions {
  /** Разбор схемы из блока в карточке (`graph`, `diagram`…): бросает ошибку с понятным текстом. В CLI без сборки Vite недоступен — тогда не передаётся */
  parseDiagram?: (lang: string, source: string) => void;
  /** PDF-страница короче этого числа знаков (титул, пустая) карточек не требует */
  minPageChars?: number;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
  cards: Card[];
  /** Единицы покрытия: подразделы конспекта или страницы PDF */
  units: string[];
  uncovered: string[];
}

const DIAGRAM_LANGS = ['graph', 'plot', 'chart', 'tree', 'array', 'diagram', 'canvas'];

const SIGNS: Record<string, string> = { '<': 'lt', '>': 'gt', '=': 'eq', '≤': 'le', '≥': 'ge', '≠': 'ne' };

/** Заголовок без оформления и знаков: «Случай $q = 1$» и «Случай q=1» сравниваются одинаково */
export function normalizeHeading(text: string): string {
  return (
    text
      .normalize('NFC')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Знаки сравнения несут смысл: «Случай q < 1» и «Случай q > 1» — разные заголовки
      .replace(/[<>=≤≥≠]/g, (sign) => ` ${SIGNS[sign]} `)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}

export interface Heading {
  level: number;
  text: string;
  norm: string;
  /** Номер строки в файле (с 1) */
  line: number;
}

/** Заголовки конспекта по порядку (без блоков кода и front matter) */
export function noteHeadings(markdown: string): Heading[] {
  const found: Heading[] = [];
  let fenced = false;
  let frontMatter = false;
  markdown
    .replace(/\r/g, '')
    .split('\n')
    .forEach((row, at) => {
      if (at === 0 && row.trim() === '---') frontMatter = true;
      else if (frontMatter) frontMatter = row.trim() !== '---';
      else {
        if (/^\s*(```|~~~)/.test(row)) fenced = !fenced;
        const match = !fenced && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(row);
        if (match) found.push({ level: match[1]!.length, text: match[2]!, norm: normalizeHeading(match[2]!), line: at + 1 });
      }
    });
  return found;
}

/** Единица покрытия и то, какие заголовки (по `src` карточки) к ней относятся */
export interface MdIndex {
  units: Heading[];
  /** Единицы, которые может покрыть `src`; undefined — такого заголовка нет, пустой массив — заголовок есть, но он ничего не покрывает (титул) */
  resolve: (src: string) => Heading[] | undefined;
}

/**
 * Единицы покрытия конспекта: самый мелкий из двух верхних уровней заголовков. Раздел `##` с подразделами `###` требует карточек по каждому
 * подразделу, раздел без подразделов — по себе. Титул `#` (если есть другие заголовки) разделом не считается. Карточка указывает любой
 * заголовок: он принадлежит ближайшей единице выше по тексту. Повторяющиеся заголовки («Пример») различаются записью «Родитель :: Пример».
 */
export function indexHeadings(headings: Heading[]): MdIndex {
  const hasTitle = headings.length > 1 && headings[0]!.level === 1;
  const rest = hasTitle ? headings.slice(1) : headings;
  if (rest.length === 0) return { units: [], resolve: () => undefined };
  const top = Math.min(...rest.map((heading) => heading.level));

  const children = new Map<Heading, Heading[]>();
  for (const heading of rest) {
    if (heading.level === top) children.set(heading, []);
  }
  let section: Heading | undefined;
  for (const heading of rest) {
    if (heading.level === top) section = heading;
    else if (heading.level === top + 1 && section) children.get(section)!.push(heading);
  }
  const units = [...children].flatMap(([heading, sub]) => (sub.length ? sub : [heading]));

  // Владелец каждого заголовка и его ближайший родитель (для записи «Родитель > Заголовок»)
  const owner = new Map<Heading, Heading | null>();
  const parent = new Map<Heading, Heading | null>();
  const stack: Heading[] = [];
  let unit: Heading | null = null;
  for (const heading of rest) {
    while (stack.length && stack.at(-1)!.level >= heading.level) stack.pop();
    parent.set(heading, stack.at(-1) ?? null);
    stack.push(heading);
    if (heading.level === top) unit = children.get(heading)!.length === 0 ? heading : null;
    else if (heading.level === top + 1 && section) unit = heading;
    owner.set(heading, unit);
  }
  if (hasTitle) {
    owner.set(headings[0]!, null);
    parent.set(headings[0]!, null);
  }

  const byKey = new Map<string, Heading[]>();
  const add = (key: string, unitOf: Heading | null) => {
    const list = byKey.get(key) ?? [];
    if (unitOf && !list.includes(unitOf)) list.push(unitOf);
    byKey.set(key, list);
  };
  for (const heading of headings) {
    const unitOf = owner.get(heading) ?? null;
    add(heading.norm, unitOf);
    const above = parent.get(heading);
    if (above) add(`${above.norm} :: ${heading.norm}`, unitOf);
  }
  return {
    units,
    resolve: (src) => byKey.get(src.split('::').map(normalizeHeading).join(' :: ')),
  };
}

/** «Стр. 5», «Стр. 5–7», «Стр. 5-7» → номера страниц; не страница — null */
export function pageRange(src: string): number[] | null {
  const match = /^\s*(?:стр\.?|страницы?|с\.)\s*(\d+)\s*(?:[–—-]\s*(\d+))?\s*$/i.exec(src);
  if (!match) return null;
  const from = Number(match[1]);
  const to = match[2] ? Number(match[2]) : from;
  if (to < from || to - from > 60) return null;
  return Array.from({ length: to - from + 1 }, (_, at) => from + at);
}

const pageNumber = (heading: string) => Number(/(\d+)/.exec(heading)?.[1] ?? NaN);

/** Организационное в карточках не нужно: баллы, правила сдачи, кто ведёт курс */
const ORGANIZATIONAL = /разбалловк|баллов за|набрать .{0,20}баллов|преподавател|лектор[а-я]* курса|как зовут|форма контроля|аттестаци/i;

function fencedBlocks(text: string): { lang: string; source: string }[] {
  const blocks: { lang: string; source: string }[] = [];
  const re = /^```(\w*)[^\n]*\n([\s\S]*?)^```/gm;
  for (let match = re.exec(text); match; match = re.exec(text)) blocks.push({ lang: match[1]!, source: match[2]! });
  return blocks;
}

const fenceCount = (text: string) => text.split('\n').filter((row) => /^\s*```/.test(row)).length;

/** Подпись единицы покрытия в отчёте: заголовок и строка, чтобы повторяющиеся «Пример» различались */
const unitLabel = (heading: Heading) => `${heading.text} (строка ${heading.line})`;

/**
 * Проверка файла карточек: формат, уникальность, длины, схемы в ответах, а главное — что `src` указывает на настоящий раздел
 * конспекта (или страницу PDF) и что разделы покрыты. Ошибки (`errors`) роняют проверку; предупреждения — подсказки.
 */
export function checkCardFile(source: string, note: NoteSource | undefined, options: CheckOptions = {}): CheckResult {
  const parsed = parseCards(source);
  const errors = parsed.issues.map((issue) => `строка ${issue.line}: ${issue.message}`);
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const card of parsed.cards) {
    const at = `карточка «${card.id}» (строка ${card.line})`;
    if (seen.has(card.id)) errors.push(`${at}: id повторяется`);
    seen.add(card.id);
    if (card.q.length < 12) errors.push(`${at}: вопрос короче 12 знаков`);
    if (card.q.length > 700) errors.push(`${at}: вопрос длиннее 700 знаков — раздели на две карточки`);
    if (card.a.length < 30) errors.push(`${at}: ответ короче 30 знаков — карточка без ответа по существу`);
    if (card.a.length > 8000) errors.push(`${at}: ответ длиннее 8000 знаков — раздели на несколько карточек`);
    if (fenceCount(card.q) % 2 || fenceCount(card.a) % 2) errors.push(`${at}: не закрыт блок кода (\`\`\`)`);
    if (ORGANIZATIONAL.test(card.q) || ORGANIZATIONAL.test(card.a))
      warnings.push(`${at}: похоже на организационное (баллы, преподаватель) — карточки только по учебному материалу`);
    if (/^\s*(что|как)\s+(написано|сказано|говорится)\s+в\s+(конспекте|лекции|тексте)/i.test(card.q))
      warnings.push(`${at}: вопрос «что написано в конспекте» — спроси по существу`);
    if (options.parseDiagram) {
      for (const block of [...fencedBlocks(card.q), ...fencedBlocks(card.a)]) {
        if (!DIAGRAM_LANGS.includes(block.lang)) continue;
        try {
          options.parseDiagram(block.lang, block.source);
        } catch (error) {
          errors.push(`${at}: схема \`${block.lang}\` не строится — ${(error as Error).message}`);
        }
      }
    }
  }

  if (!note) {
    errors.push('для файла нет конспекта с таким путём');
    return { errors, warnings, cards: parsed.cards, units: [], uncovered: [] };
  }

  const covered = new Set<string>();
  let units: string[];
  let cover: (src: string, at: string) => void;

  if (note.kind === 'md') {
    const index = indexHeadings(noteHeadings(note.text));
    units = index.units.map(unitLabel);
    cover = (src, at) => {
      const candidates = index.resolve(src);
      if (!candidates) return void errors.push(`${at}: src «${src}» — такого заголовка в конспекте нет`);
      // Повторяющийся заголовок: каждая карточка закрывает следующую ещё не покрытую единицу
      const next = candidates.find((heading) => !covered.has(unitLabel(heading))) ?? candidates.at(-1);
      if (next) covered.add(unitLabel(next));
    };
  } else {
    const minChars = options.minPageChars ?? 150;
    const all = new Set(note.pages.map((page) => pageNumber(page.heading)));
    units = note.pages.filter((page) => page.text.trim().length >= minChars).map((page) => `Стр. ${pageNumber(page.heading)}`);
    cover = (src, at) => {
      const range = pageRange(src);
      if (!range || !range.every((page) => all.has(page)))
        return void errors.push(`${at}: src «${src}» — это не страницы PDF («Стр. 5» или «Стр. 5–7», такие страницы есть в файле)`);
      for (const page of range) covered.add(`Стр. ${page}`);
    };
  }

  for (const card of parsed.cards) cover(card.src, `карточка «${card.id}» (строка ${card.line})`);
  // src="*" — весь конспект без карточек (дубль другого конспекта, чистая библиография): причина обязательна, как у любого @@skip
  for (const skip of parsed.skips) {
    if (skip.src.trim() === '*') for (const unit of units) covered.add(unit);
    else cover(skip.src, `@@skip (строка ${skip.line})`);
  }
  if (parsed.skips.length > Math.max(2, units.length * 0.2))
    warnings.push(`пропусков (@@skip) ${parsed.skips.length} из ${units.length} разделов — слишком много, в этих разделах тоже есть что спросить`);

  return { errors, warnings, cards: parsed.cards, units, uncovered: units.filter((unit) => !covered.has(unit)) };
}
