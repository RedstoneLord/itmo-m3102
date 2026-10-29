import { M3102_SUBJECTS, resolveSubjectFolder } from '../../data/m3102';
import { formatShortDate } from '../../lib/dates';
import { buildCourseInfo, buildGroupNotes, buildMaterials, noteSourceUrl, type TreeFile } from '../../services/githubContent';
import { parseLinks } from '../group/groupStore';
import { buildCardFiles, type AiCardFile } from '../cards/aiCards';
import { cardPathInfo, cardsKey } from '../cards/key';
import { parseCards } from '../cards/parse';
import { collectPdfText } from '../search/pdfText';
import type { LectureNote } from '../../types/models';
import { AI_BASE, buildSubjectChunks, buildSubjectDigest } from './aiDigest';

/** Репозиторий группы как набор файлов: пути от его корня и чтение текста (при сборке сайта — из чекаута, без сети) */
export interface RepoSource {
  paths: string[];
  read: (path: string) => string;
}

/** Описания курсов лежат у нас, рядом с кодом приложения */
export const COURSE_INFO_DIR = 'app/src/data/courseInfo/';

/** Карточки к конспектам тоже лежат у нас (features/cards): по ним тоже собираются файлы для ИИ */
export const CARDS_DIR = 'app/src/data/cards/';

/** Когда собрано, по Москве — как у расписания: «23 октября, 15:42 МСК». Файл — снимок на момент деплоя, по времени видно, насколько он свежий */
function mskStamp(now: Date): string {
  const part = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${formatShortDate(`${part.year}-${part.month}-${part.day}`, 'long')}, ${part.hour}:${part.minute} МСК`;
}

/**
 * Файлы `{id предмета}.md` — то же, что «Для ИИ» на странице предмета, но по ссылке: ИИ открывает адрес и читает всё сразу, — и те же
 * материалы по частям (`{id}/index.md`, `{id}/01.md`…) для случаев, когда весь файл ИИ не осиливает.
 * Только публичное: конспекты, материалы и ссылки группы, описание курса. Личные заметки из браузера в ссылку попасть не могут.
 */
export async function buildAiFiles(repo: RepoSource, now = new Date()): Promise<Record<string, string>> {
  const iso = now.toISOString();
  const tree: TreeFile[] = repo.paths.map((path) => ({ path, size: 0, sha: '' }));
  const notes = await buildGroupNotes(tree, [], iso, async (file) => ({ text: repo.read(file.path) }));
  const materials = buildMaterials(repo.paths, [], iso);
  const links = parseLinks(JSON.parse(repo.read('data/links.json')));
  const courseInfo = Object.fromEntries(repo.paths.filter((path) => path.startsWith(COURSE_INFO_DIR)).map((path) => [path, repo.read(path)]));
  const info = buildCourseInfo(courseInfo, [], iso);
  const pdf = new Map<string, string>();
  collectPdfText(JSON.parse(repo.read('data/search-index.json')), pdf);
  const date = mskStamp(now);
  const cardFiles = repo.paths
    .filter((path) => path.startsWith(CARDS_DIR) && path.endsWith('.md') && !path.endsWith('/README.md'))
    .sort(new Intl.Collator('ru', { numeric: true, sensitivity: 'base' }).compare);

  return Object.fromEntries(
    M3102_SUBJECTS.flatMap((subject) => {
      const input = {
        subjectName: subject.name,
        info: info.filter((item) => item.subjectId === subject.id),
        notes: notes.filter((note) => note.subjectId === subject.id),
        materials: materials.filter((material) => material.subjectId === subject.id),
        links: links.filter((link) => resolveSubjectFolder(link.subject) === subject.id),
        personalNotes: [],
        sourceUrl: noteSourceUrl,
        pdfText: (note: LectureNote) => (note.sourceRef ? pdf.get(note.sourceRef) : undefined),
        date,
      };
      // Целиком одним файлом — и по частям: оглавление `{id}/index.md` и по файлу на конспект (ИИ по ссылке не дочитывает 100–250 тыс. токенов)
      const chunks = buildSubjectChunks(input, subject.id);
      const cards: AiCardFile[] = cardFiles
        .filter((path) => resolveSubjectFolder(cardPathInfo(path).folder) === subject.id)
        .map((path) => {
          const note = notes.find((item) => item.sourceRef && cardsKey(item.sourceRef) === cardsKey(path));
          const { group, title } = cardPathInfo(path);
          return { title, group, sourceUrl: note ? noteSourceUrl(note) : undefined, cards: parseCards(repo.read(path)).cards };
        });
      return [
        [`${subject.id}.md`, buildSubjectDigest(input)],
        [`${subject.id}/index.md`, chunks.index],
        ...chunks.parts.map((part) => [part.name, part.text]),
        ...Object.entries(buildCardFiles({ subjectId: subject.id, subjectName: subject.name, date, base: AI_BASE, files: cards })),
      ];
    }),
  );
}
