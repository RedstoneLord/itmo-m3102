import { compareLessons, noteTitle } from '../materials/noteOrder';
import type { LectureNote, Material, Note, SubjectInfo } from '../../types/models';

export interface DigestInput {
  subjectName: string;
  info: SubjectInfo[];
  notes: LectureNote[];
  materials: Material[];
  links: { title: string; url: string }[];
  personalNotes: Note[];
  /** Ссылка на оригинал конспекта (GitHub) */
  sourceUrl: (note: LectureNote) => string | undefined;
  /** Текст PDF-конспекта из индекса поиска группы; нет — в файле будет только ссылка */
  pdfText: (note: LectureNote) => string | undefined;
  date: string;
}

/** Заголовки конспекта на уровень ниже: в файле «# предмет → ## конспект → ### его разделы». Код не трогаем */
export function demoteHeadings(markdown: string, levels = 2): string {
  let fence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (fence) return line;
      return line.replace(/^(#{1,6})(?=\s)/, (hashes) => '#'.repeat(Math.min(6, hashes.length + levels)));
    })
    .join('\n');
}

/**
 * Ссылки с кириллицей как есть: «%D0%9A%D0%BE…» втрое длиннее и съедает токены, а ИИ читает и так.
 * Пробел и скобки оставляем закодированными — иначе сломается [текст](ссылка)
 */
export function readableUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s)<>\]]+/g, (url) => {
    try {
      return decodeURI(url).replace(/[ ()]/g, (char) => ({ ' ': '%20', '(': '%28', ')': '%29' })[char]!);
    } catch {
      return url;
    }
  });
}

/** Примерно токенов: у русского текста в современных токенизаторах ~3 символа на токен */
export const estimateTokens = (text: string) => Math.round(text.length / 3);

function noteBody(note: LectureNote, input: DigestInput, levels = 2): string {
  if (note.contentType === 'markdown') return demoteHeadings(note.content.trim(), levels);
  // PDF, загруженный вручную, хранится как data: URI — его в файл не кладём
  if (note.content.startsWith('data:')) return 'Файл загружен на сайт вручную, текста нет.';
  if (note.contentType === 'pdf') {
    const text = input.pdfText(note)?.replace(/\s+/g, ' ').trim();
    return text
      ? `(Текст PDF, извлечён автоматически — формулы и таблицы могут быть искажены)\n\n${text}`
      : `PDF без текста в индексе: ${note.content}`;
  }
  return `Ссылка: ${note.content}`;
}

/**
 * Конспекты предмета по порядку занятий без PDF-двойников и двойники каждого. У группы занятие часто лежит дважды — .md и PDF того же
 * текста: PDF при живом .md идёт ссылкой, а не копией (иначе файл почти вдвое больше: у ДМ 337 тыс. символов вместо ~225 тыс.)
 */
function lessons(input: DigestInput) {
  const all = input.notes.filter((note) => !note.archived).sort(compareLessons);
  const sameLesson = (a: LectureNote, b: LectureNote) => a.lectureNumber === b.lectureNumber;
  const isTwin = (note: LectureNote) =>
    note.contentType === 'pdf' && all.some((other) => other.contentType === 'markdown' && sameLesson(other, note));
  const twinsOf = (note: LectureNote) => (note.contentType === 'markdown' ? all.filter((other) => isTwin(other) && sameLesson(other, note)) : []);
  return { visible: all.filter((note) => !isTwin(note)), twinsOf };
}

/** Где по ссылке лежат выгрузки: папка ai/ на опубликованном сайте группы (одинаково в dev, в превью и у форка) */
export const AI_BASE = 'https://redstonelord.github.io/itmo-m3102/app/ai/';

const thousands = (text: string) => `≈ ${Math.max(1, Math.round(estimateTokens(text) / 1000))} тыс. токенов`;

/** Больше этого в одном файле ИИ по ссылке читает плохо (≈ 27 тыс. токенов): длинный конспект режется на части */
const PART_LIMIT = 80_000;

/**
 * Режет текст по пустым строкам на куски не длиннее `limit`.
 * shortcut: абзац длиннее `limit` остаётся целым, а разрез может прийтись на середину таблицы или блока кода, — резать по разделам, если так читается плохо.
 */
export function splitByLimit(text: string, limit = PART_LIMIT): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of text.split('\n\n')) {
    if (current && current.length + paragraph.length + 2 > limit) {
      chunks.push(`${current.trim()}\n`);
      current = paragraph;
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(`${current.trim()}\n`);
  return chunks;
}

export interface SubjectChunks {
  /** Оглавление: короткое, со ссылками на части */
  index: string;
  /** По файлу на конспект: имя относительно ai/ («dm/01.md») и текст */
  parts: { name: string; text: string }[];
}

/**
 * Тот же предмет по частям. Весь предмет — 100–250 тыс. токенов, и ИИ по ссылке читает такой файл не до конца (его окно или загрузчик
 * ссылок обрезают текст). Оглавление маленькое: ИИ видит, что есть, и открывает только нужные конспекты — по файлу на каждый.
 */
export function buildSubjectChunks(input: DigestInput, subjectId: string): SubjectChunks {
  const { visible, twinsOf } = lessons(input);
  const notes = visible.map((note, at) => {
    const source = input.sourceUrl(note);
    const twins = twinsOf(note).map((twin) => `PDF-версия: ${twin.content}`);
    const title = noteTitle(note);
    const text = [
      `# ${input.subjectName} — ${title}`,
      '',
      `> Один конспект из выгрузки сайта группы М3102 (ИТМО) ${input.date}. Конспекты пишут студенты — в них бывают ошибки и пропуски.`,
      '',
      ...(source ? [`Источник: ${source}`] : []),
      ...twins,
      '',
      noteBody(note, input, 1),
      '',
    ].join('\n');
    const whole = `${readableUrls(text).trim()}\n`;
    // Очень длинный конспект (PDF на сотню страниц) — несколькими файлами: «01-1.md», «01-2.md»…
    const pieces = splitByLimit(whole);
    const base = `${subjectId}/${String(at + 1).padStart(2, '0')}`;
    const files = pieces.map((piece, k) => ({
      name: pieces.length === 1 ? `${base}.md` : `${base}-${k + 1}.md`,
      text: k === 0 ? piece : `# ${input.subjectName} — ${title} (часть ${k + 1} из ${pieces.length})\n\n${piece}`,
    }));
    return { note, files, size: thousands(whole) };
  });

  const out: string[] = [
    `# ${input.subjectName} — оглавление (читать по частям)`,
    '',
    `> Собрано с сайта группы М3102 (ИТМО) ${input.date}. Конспекты пишут студенты — в них бывают ошибки и пропуски.`,
    `> Предмет целиком не помещается в одно окно, поэтому он разбит: здесь только список. Открывай по ссылкам нужные конспекты — каждый лежит отдельным файлом (очень длинные — несколькими частями). Отвечая, ссылайся на конспект по его заголовку.`,
    `> Всё одним файлом (для моделей с очень большим окном): ${AI_BASE}${subjectId}.md`,
    '',
  ];
  for (const item of input.info) out.push(`## ${item.title}`, '', demoteHeadings(item.content.trim()), '');
  out.push(`## Конспекты (${notes.length})`, '');
  if (notes.length === 0) out.push('Конспектов по предмету пока нет.', '');
  notes.forEach(({ note, files, size }, at) => {
    const [first, ...rest] = files;
    const more = rest.map((file, k) => `[ч. ${k + 2}](${AI_BASE}${file.name})`);
    out.push(
      `${at + 1}. [${noteTitle(note)}${rest.length ? ' — ч. 1' : ''}](${AI_BASE}${first!.name})${more.length ? `, ${more.join(', ')}` : ''} — ${size}`,
    );
  });
  const links = [...input.materials.map((material) => ({ title: material.name, url: material.url })), ...input.links];
  if (links.length) out.push('', '## Материалы и ссылки', '', ...links.map((link) => `- [${link.title}](${link.url})`));

  return { index: `${readableUrls(out.join('\n')).trim()}\n`, parts: notes.flatMap(({ files }) => files) };
}

/**
 * Всё по предмету одним Markdown-файлом — закинуть в ChatGPT / Claude: ИИ не ходит по сайту и не ищет конспекты,
 * а сразу читает всё. Порядок: описание курса, оглавление, конспекты группы, конспекты потока, материалы, свои заметки.
 */
export function buildSubjectDigest(input: DigestInput): string {
  const { visible, twinsOf } = lessons(input);
  const groups = [{ title: 'Конспекты группы М3102', notes: visible }].filter((group) => group.notes.length > 0);

  const out: string[] = [
    `# ${input.subjectName} — все материалы`,
    '',
    `> Собрано с сайта группы М3102 (ИТМО) ${input.date}. Конспекты пишут студенты — в них бывают ошибки и пропуски.`,
    `> Конспектов: ${visible.length}. Отвечая, ссылайся на конспект по его заголовку.`,
    '',
  ];

  for (const item of input.info) out.push(`## ${item.title}`, '', demoteHeadings(item.content.trim()), '');

  if (groups.length) {
    out.push('## Оглавление', '');
    for (const group of groups) {
      out.push(`- ${group.title}`);
      for (const note of group.notes) out.push(`  - ${noteTitle(note)}`);
    }
    out.push('');
  }

  for (const group of groups) {
    out.push(`# ${group.title}`, '');
    for (const note of group.notes) {
      const source = input.sourceUrl(note);
      const twins = twinsOf(note).map((twin) => `PDF-версия: ${twin.content}`);
      out.push(`## ${noteTitle(note)}`, '', ...(source ? [`Источник: ${source}`] : []), ...twins, '', noteBody(note, input), '', '---', '');
    }
  }

  const files = [...input.materials.map((material) => ({ title: material.name, url: material.url })), ...input.links];
  if (files.length) out.push('# Материалы и ссылки', '', ...files.map((file) => `- [${file.title}](${file.url})`), '');

  if (input.personalNotes.length) {
    out.push('# Мои заметки', '');
    for (const note of input.personalNotes) out.push(`## ${note.title}`, '', demoteHeadings(note.content.trim()), '');
  }

  return `${readableUrls(out.join('\n').trim())}\n`;
}
