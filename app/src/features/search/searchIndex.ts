import { CalendarRange, FileText, NotebookText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SCHEDULE_MONTH_PATH, SECTIONS, type Section } from '../../app/navigation';
import { M3102_STUDENTS, resolveSubjectFolder } from '../../data/m3102';
import { rawUrl } from '../../services/githubContent';
import { useGroupStore } from '../group/groupStore';
import { useHomeworkStore } from '../homework/homeworkStore';
import { MATERIAL_TYPES } from '../materials/labels';
import { useLectureNotesStore } from '../materials/lectureNotesStore';
import { useMaterialsStore } from '../materials/materialsStore';
import { useNotesStore } from '../notes/notesStore';
import { deadlineSubjectId } from '../subjects/subjectStats';
import { useSubjectsStore } from '../subjects/subjectsStore';
import { formatTaskMeta } from '../tasks/labels';
import { useTasksStore } from '../tasks/tasksStore';
import { collectPdfPages, joinSections, type SearchIndexFile, type TextSection } from './pdfText';

export interface SearchResult {
  id: string;
  title: string;
  meta?: string;
  icon: LucideIcon;
  /** Куда перейти при выборе */
  path: string;
  /** Длинный текст по разделам (конспект — по заголовкам, PDF — по страницам, ДЗ и заметка — целиком) — ищется тоже */
  sections?: TextSection[];
  /** Предмет — для фильтра по предмету */
  subjectId?: string;
  /** Нашлось в тексте: раздел или страница, где именно, и кусок текста вокруг совпадения — в выдаче под названием */
  section?: string;
  snippet?: string;
  /** Формат конспекта — отдельной меткой в выдаче: по обрезанному названию обычный конспект и PDF не отличить */
  format?: 'MD' | 'PDF';
}

/** Фильтры поиска: группа результатов (по её названию) и предмет */
export interface SearchFilter {
  group?: string;
  subjectId?: string;
}

export interface SearchGroup {
  label: string;
  results: SearchResult[];
}

const RESULTS_PER_GROUP = 4;
const NOTE_RESULTS = 8;
/** Выбран тип результатов — показываем больше: остальных групп на экране нет */
const FILTERED_RESULTS = 40;
/** Из одного конспекта в выдаче — не больше двух лучших разделов, как на классическом сайте */
const HITS_PER_NOTE = 2;
/** Сниппет: сколько знаков до совпадения и сколько всего — в окне он занимает две строки */
const SNIPPET_BEFORE = 48;
const SNIPPET_LENGTH = 150;

/** Регистр и «ё» не важны: «ежик» находит «Ёжик» */
export const normalize = (value: string) => value.toLowerCase().replace(/ё/g, 'е');

const TEX_SYMBOLS: Record<string, string> = {
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  in: '∈',
  notin: '∉',
  forall: '∀',
  exists: '∃',
  land: '∧',
  lor: '∨',
  neg: '¬',
  to: '→',
  infty: '∞',
  cdot: '·',
  times: '×',
  subset: '⊂',
  subseteq: '⊆',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  varepsilon: 'ε',
  epsilon: 'ε',
  pi: 'π',
  Omega: 'Ω',
  Theta: 'Θ',
  langle: '⟨',
  rangle: '⟩',
  quad: ' ',
  qquad: ' ',
};

/** LaTeX → примерно читаемый текст: \mathbb{R} → R, \le → ≤, прочие команды выбрасываются */
function texToText(tex: string): string {
  return tex
    .replace(/\\(?:mathbb|mathrm|mathbf|mathcal|text|operatorname)\{([^}]*)\}/g, '$1')
    .replace(/\\([a-zA-Z]+)/g, (_, name: string) => TEX_SYMBOLS[name] ?? ' ')
    .replace(/[{}]/g, '');
}

/** Из схемы — только то, что видит человек: заголовок, подпись и надписи в кавычках («Старт», "sin x") */
function diagramText(code: string): string {
  const captions = [...code.matchAll(/^\s*(?:title|caption):\s*(.+)$/gm)].map((match) => match[1]);
  const labels = [...code.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]);
  return ` ${[...captions, ...labels].join(' ')} `;
}

/** Markdown/LaTeX → читаемый текст для поиска и сниппетов */
export function plainText(markdown: string): string {
  return (
    markdown
      // Код ищется; у схем — подписи и надписи, у тестов и mermaid — ничего: там служебный синтаксис
      .replace(/```(\w*)[^\n]*\n?([\s\S]*?)```/g, (_, lang: string, code: string) =>
        /^(mermaid|quiz)$/.test(lang) ? ' ' : /^(graph|plot|chart|tree|array|diagram|canvas)$/.test(lang) ? diagramText(code) : ` ${code} `,
      )
      .replace(/\$\$?([^$]*)\$\$?/g, (_, tex: string) => texToText(tex))
      .replace(/^:::.*$/gm, ' ')
      .replace(/!?\[\[([^\]|]+)(?:\\?\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => label ?? target)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^>\s*\[![^\]]+\][+-]?/gm, '')
      .replace(/[#>*_`|~\\]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Слова запроса: «предел послед» → ['предел', 'послед'] — каждое должно найтись, в любом порядке */
export const queryWords = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

/** Все ли слова есть в строке; фраза целиком — частный случай */
export const hasAllWords = (text: string, words: string[]) => words.every((word) => text.includes(word));

/**
 * Markdown → разделы по заголовкам (как строит индекс группы, tools/build-search-index.mjs): название раздела и простой
 * текст под ним; текст до первого заголовка — раздел без названия. `#` внутри кода заголовком не считается
 */
export function markdownSections(markdown: string): TextSection[] {
  const sections: TextSection[] = [];
  let heading = '';
  let lines: string[] = [];
  let fence = '';
  const flush = () => {
    const text = plainText(lines.join('\n'));
    if (text) sections.push({ heading, text });
    lines = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const quote = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0];
    if (quote) fence = !fence ? quote : fence === quote ? '' : fence;
    const title = fence || quote ? null : /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (title) {
      flush();
      heading = plainText(title);
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Кусок текста вокруг совпадения: «…предикат P(x) истинен…». normalized — normalize(text), если уже посчитан.
 * Вокруг фразы целиком, иначе вокруг самого длинного из найденных слов (оно реже всего встречается и точнее
 * показывает место); слов в тексте нет (совпал заголовок раздела) — начало текста
 */
export function snippet(text: string, words: string[], normalized = normalize(text)): string {
  const phrase = words.join(' ');
  const found = normalized.includes(phrase) ? phrase : words.filter((word) => normalized.includes(word)).sort((a, b) => b.length - a.length)[0];
  const at = found ? normalized.indexOf(found) : 0;
  let start = Math.max(0, at - SNIPPET_BEFORE);
  if (start > 0) {
    // Начало — с границы слова, а не с середины
    const space = text.indexOf(' ', start);
    if (space >= 0 && space < at) start = space + 1;
  }
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/** Текст кусками: совпавшие со словами запроса (hit) интерфейс выделяет; регистр и «ё» не важны */
export function markParts(text: string, words: string[]): { text: string; hit: boolean }[] {
  const normalized = normalize(text);
  const ranges: [number, number][] = [];
  // Строчные буквы иногда длиннее заглавных — тогда места в normalized не совпадают с text, лучше не выделять, чем выделить не то
  if (normalized.length === text.length) {
    for (const word of words) {
      for (let at = normalized.indexOf(word); at >= 0; at = normalized.indexOf(word, at + word.length)) ranges.push([at, at + word.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: { text: string; hit: boolean }[] = [];
  let done = 0;
  for (const [start, end] of ranges) {
    if (end <= done) continue;
    const from = Math.max(start, done);
    if (from > done) parts.push({ text: text.slice(done, from), hit: false });
    parts.push({ text: text.slice(from, end), hit: true });
    done = end;
  }
  if (done < text.length || !parts.length) parts.push({ text: text.slice(done), hit: false });
  return parts;
}

/** Раздел текста с приведёнными к поиску строками — чтобы не считать их на каждую букву запроса */
interface IndexedSection extends TextSection {
  headingKey: string;
  textKey: string;
}

/**
 * Оценка раздела, как на классическом сайте: вхождения слов в тексте (до 10 на слово), слово в заголовке весомее,
 * фраза целиком — ещё плюс. Каждое слово должно быть в заголовке или в тексте, иначе -1
 */
function scoreSection({ headingKey, textKey }: IndexedSection, words: string[]): number {
  let score = 0;
  for (const word of words) {
    const inHeading = headingKey.includes(word);
    let count = 0;
    for (let at = textKey.indexOf(word); at >= 0 && count < 10; at = textKey.indexOf(word, at + word.length)) count++;
    if (!count && !inHeading) return -1;
    score += count + (inHeading ? 15 : 0);
  }
  return words.length > 1 && textKey.includes(words.join(' ')) ? score + 20 : score;
}

const rankSections = (sections: IndexedSection[], words: string[]) =>
  sections
    .map((section) => ({ section, score: scoreSection(section, words) }))
    .filter((hit) => hit.score >= 0)
    .sort((a, b) => b.score - a.score);

/**
 * Лучшие разделы под запрос — те, где есть все слова. Слова разбросаны по разным разделам (в конспекте они есть) —
 * показываем место самого длинного слова: конспект не пропадает, как и раньше, когда искали по всему тексту
 */
function findHits(sections: IndexedSection[], words: string[]) {
  let hits = rankSections(sections, words);
  const inNote = (word: string) => sections.some((section) => section.headingKey.includes(word) || section.textKey.includes(word));
  if (!hits.length && words.length > 1 && words.every(inNote)) hits = rankSections(sections, [[...words].sort((a, b) => b.length - a.length)[0]!]);
  return hits.slice(0, HITS_PER_NOTE);
}

/** Место совпадения в названии, как на классическом сайте: с начала — выше, в названии — выше, чем в подписи (key = «название\nподпись») */
function titleScore(key: string, words: string[]): number {
  const titleEnd = key.indexOf('\n');
  return words.reduce((sum, word) => {
    const at = key.indexOf(word);
    return sum + (at === 0 ? 30 : at < titleEnd ? 20 : 5);
  }, 0);
}

const PAGES: Section[] = [
  SECTIONS.today,
  SECTIONS.schedule,
  SECTIONS.homework,
  SECTIONS.deadlines,
  SECTIONS.materials,
  { label: 'Полезные ссылки', path: '/links', icon: SECTIONS.materials.icon },
  SECTIONS.students,
  SECTIONS.memes,
  { label: 'Календарь', path: SCHEDULE_MONTH_PATH, icon: CalendarRange },
  SECTIONS.tasks,
  SECTIONS.subjects,
  SECTIONS.notes,
  SECTIONS.settings,
];

/**
 * Текст PDF-конспектов группы: его вытаскивает робот репозитория группы (pdftotext) в
 * data/search-index.json — { files: [путь], sections: [[номер файла, заголовок («Стр. 5»), текст]] }.
 * Файл большой (~3 МБ), поэтому грузится при первом открытии поиска и живёт только в памяти — постранично,
 * чтобы выдача называла страницу.
 */
const pdfPages = new Map<string, TextSection[]>();
let pdfIndexLoad: Promise<void> | null = null;

export type PdfIndexStatus = 'idle' | 'loading' | 'ready' | 'failed';
let pdfStatus: PdfIndexStatus = 'idle';
/** Как идёт загрузка текста PDF — окно поиска подписывает, что PDF пока ищутся только по названию */
export const pdfIndexStatus = () => pdfStatus;

/** Тексты PDF-конспектов группы по пути файла — для выгрузки предмета «Для ИИ» */
export async function loadPdfTexts(): Promise<ReadonlyMap<string, string>> {
  await loadPdfIndex();
  return new Map([...pdfPages].map(([path, pages]) => [path, joinSections(pages)]));
}

export function loadPdfIndex(): Promise<void> {
  if (!pdfIndexLoad) {
    pdfStatus = 'loading';
    pdfIndexLoad = fetch(rawUrl('group', 'data/search-index.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SearchIndexFile>;
      })
      .then((raw) => {
        collectPdfPages(raw, pdfPages);
        pdfStatus = 'ready';
      })
      .catch(() => {
        pdfIndexLoad = null; // попробуем снова при следующем открытии
        pdfStatus = 'failed';
      });
  }
  return pdfIndexLoad;
}

interface IndexedResult extends SearchResult {
  /** Заранее приведённые к поиску строки — чтобы не считать их на каждую букву запроса */
  key: string;
  sections?: IndexedSection[];
}

let index: { inputs: unknown[]; groups: { label: string; results: IndexedResult[] }[] } | null = null;

/**
 * Индекс поиска: тексты конспектов (≈1 МБ) переводятся в простой текст один раз и пересобираются, только когда
 * поменялись данные (новый массив в store) или пришёл текст PDF.
 */
function indexedGroups() {
  const inputs = [
    useSubjectsStore.getState().subjects,
    useTasksStore.getState().tasks,
    useMaterialsStore.getState().materials,
    useLectureNotesStore.getState().lectureNotes,
    useNotesStore.getState().notes,
    useGroupStore.getState().deadlines,
    useGroupStore.getState().links,
    useHomeworkStore.getState().items,
    pdfPages.size,
  ];
  if (index?.inputs.every((value, i) => value === inputs[i])) return index.groups;
  const groups = buildGroups().map((group) => ({
    label: group.label,
    results: group.results.map((result) => ({
      ...result,
      key: normalize(`${result.title}\n${result.meta ?? ''}`),
      sections: result.sections?.map((section) => ({
        ...section,
        headingKey: normalize(section.heading),
        textKey: normalize(section.text),
      })),
    })),
  }));
  index = { inputs, groups };
  return groups;
}

function buildGroups(): SearchGroup[] {
  const subjects = useSubjectsStore.getState().subjects;
  const tasks = useTasksStore.getState().tasks;
  const materials = useMaterialsStore.getState().materials;
  const lectureNotes = useLectureNotesStore.getState().lectureNotes;
  const notes = useNotesStore.getState().notes;
  const { deadlines, links } = useGroupStore.getState();
  const homework = useHomeworkStore.getState().items;
  const subjectName = (id: string | undefined) => subjects.find((subject) => subject.id === id)?.name;

  return [
    {
      label: 'Разделы',
      results: PAGES.map((page) => ({ id: page.path, title: page.label, icon: page.icon, path: page.path })),
    },
    {
      label: 'Конспекты',
      results: lectureNotes
        .filter((note) => !note.archived)
        .map((note) => ({
          id: note.id,
          title: note.lectureNumber ? `${note.lectureNumber}. ${note.title}` : note.title,
          meta: subjectName(note.subjectId),
          subjectId: note.subjectId,
          icon: note.contentType === 'markdown' ? NotebookText : FileText,
          format: note.contentType === 'markdown' ? ('MD' as const) : note.contentType === 'pdf' ? ('PDF' as const) : undefined,
          path: `/materials/notes/${note.id}`,
          sections: note.contentType === 'markdown' ? markdownSections(note.content) : note.sourceRef ? pdfPages.get(note.sourceRef) : undefined,
        })),
    },
    {
      label: 'Домашнее задание',
      results: homework.map((item) => ({
        id: item.id,
        title: item.subject,
        meta: item.due ? `до ${item.due.split('-').reverse().join('.')}` : 'без срока',
        subjectId: resolveSubjectFolder(item.subject),
        icon: SECTIONS.homework.icon,
        path: SECTIONS.homework.path,
        sections: markdownSections(item.text),
      })),
    },
    {
      label: 'Дедлайны',
      results: deadlines.map((item) => ({
        id: `deadline:${item.id}`,
        title: item.name,
        meta: item.note,
        subjectId: deadlineSubjectId(item.name),
        icon: SECTIONS.deadlines.icon,
        path: SECTIONS.deadlines.path,
      })),
    },
    {
      label: 'Предметы',
      results: subjects.map((subject) => ({
        id: subject.id,
        title: subject.name,
        meta: subject.teacherPrimary,
        subjectId: subject.id,
        icon: SECTIONS.subjects.icon,
        path: `${SECTIONS.subjects.path}/${subject.id}`,
      })),
    },
    {
      label: 'Ссылки',
      results: links.map((link) => ({
        id: link.url,
        title: link.title,
        meta: [link.subject, link.description].filter(Boolean).join(' · '),
        subjectId: resolveSubjectFolder(link.subject),
        icon: SECTIONS.materials.icon,
        path: '/links',
      })),
    },
    {
      label: 'Материалы',
      results: materials.map((material) => ({
        id: material.id,
        title: material.name,
        meta: subjectName(material.subjectId),
        subjectId: material.subjectId,
        icon: MATERIAL_TYPES[material.type].icon,
        path: SECTIONS.materials.path,
      })),
    },
    {
      label: 'Студенты',
      results: M3102_STUDENTS.map((student) => ({
        id: student.github,
        title: student.name,
        meta: `@${student.github}${student.role ? ` · ${student.role}` : ''}`,
        icon: SECTIONS.students.icon,
        path: SECTIONS.students.path,
      })),
    },
    {
      label: 'Учебный план',
      results: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        meta: formatTaskMeta(subjectName(task.subjectId), task.type),
        subjectId: task.subjectId,
        icon: SECTIONS.tasks.icon,
        path: SECTIONS.tasks.path,
      })),
    },
    {
      label: 'Заметки',
      results: notes.map((note) => ({
        id: note.id,
        title: note.title,
        meta: subjectName(note.subjectId),
        subjectId: note.subjectId,
        icon: SECTIONS.notes.icon,
        path: SECTIONS.notes.path,
        sections: markdownSections(note.content),
      })),
    },
  ];
}

/** Названия групп результатов — для фильтра по типу в окне поиска */
export const SEARCH_GROUPS = ['Конспекты', 'Домашнее задание', 'Дедлайны', 'Материалы', 'Заметки', 'Ссылки', 'Учебный план', 'Студенты'];

/**
 * Ищет по названию, подписи и полному тексту (конспекты, ДЗ, заметки). Слова запроса — в любом порядке и не
 * обязательно рядом. Совпадения в названии — выше, лучшие по месту совпадения — первыми. Нашлось только в тексте —
 * в выдаче раздел или страница, где именно, и кусок текста вокруг совпадения (до двух разделов из одного конспекта,
 * лучшие по числу совпадений первыми). Фильтр по типу и предмету; с фильтром и пустым запросом — всё, что подходит.
 */
export function search(query: string, filter: SearchFilter = {}): SearchGroup[] {
  const words = queryWords(query);
  const filtered = Boolean(filter.group || filter.subjectId);
  if (!words.length && !filtered) return [];

  return indexedGroups()
    .filter((group) => !filter.group || group.label === filter.group)
    .filter((group) => !filter.subjectId || group.label !== 'Разделы')
    .map((group) => {
      const byTitle: { rows: SearchResult[]; score: number }[] = [];
      const byBody: { rows: SearchResult[]; score: number }[] = [];
      for (const { key, sections, ...result } of group.results) {
        if (filter.subjectId && result.subjectId !== filter.subjectId) continue;
        if (hasAllWords(key, words)) {
          byTitle.push({ rows: [result], score: titleScore(key, words) });
        } else if (sections) {
          const hits = findHits(sections, words);
          const rows = hits.map(({ section }, i) => ({
            ...result,
            id: `${result.id}#${i}`,
            section: section.heading || undefined,
            snippet: snippet(section.text, words, section.textKey),
          }));
          if (rows.length) byBody.push({ rows, score: hits[0]!.score });
        }
      }
      const limit = filter.group ? FILTERED_RESULTS : group.label === 'Конспекты' ? NOTE_RESULTS : RESULTS_PER_GROUP;
      const best = (a: { score: number }, b: { score: number }) => b.score - a.score;
      return { label: group.label, results: [...byTitle.sort(best), ...byBody.sort(best)].flatMap((hit) => hit.rows).slice(0, limit) };
    })
    .filter((group) => group.results.length > 0);
}
