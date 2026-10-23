import { M3102_SUBJECTS, resolveSubjectFolder } from '../../data/m3102';
import { formatShortDate } from '../../lib/dates';
import { buildCourseInfo, buildGroupNotes, buildMaterials, noteSourceUrl, type TreeFile } from '../../services/githubContent';
import { parseLinks } from '../group/groupStore';
import { collectPdfText } from '../search/pdfText';
import { buildSubjectDigest } from './aiDigest';

/** Репозиторий группы как набор файлов: пути от его корня и чтение текста (при сборке сайта — из чекаута, без сети) */
export interface RepoSource {
  paths: string[];
  read: (path: string) => string;
}

/** Описания курсов лежат у нас, рядом с кодом приложения */
export const COURSE_INFO_DIR = 'app/src/data/courseInfo/';

/**
 * Файлы `{id предмета}.md` — то же, что «Для ИИ» на странице предмета, но по ссылке: ИИ открывает адрес и читает всё сразу.
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
  const date = formatShortDate(iso.slice(0, 10), 'long');

  return Object.fromEntries(
    M3102_SUBJECTS.map((subject) => [
      `${subject.id}.md`,
      buildSubjectDigest({
        subjectName: subject.name,
        info: info.filter((item) => item.subjectId === subject.id),
        notes: notes.filter((note) => note.subjectId === subject.id),
        materials: materials.filter((material) => material.subjectId === subject.id),
        links: links.filter((link) => resolveSubjectFolder(link.subject) === subject.id),
        personalNotes: [],
        sourceUrl: noteSourceUrl,
        pdfText: (note) => (note.sourceRef ? pdf.get(note.sourceRef) : undefined),
        date,
      }),
    ]),
  );
}
