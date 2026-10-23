import { compareLessons, noteTitle } from '../materials/noteOrder';
import { fileUrl, rawUrl } from '../../services/githubContent';
import { COURSE_INFO_DIR } from './aiFiles';
import type { DigestInput } from './aiDigest';

/** Что оставить в выгрузке «Для ИИ». По умолчанию всё; снятые конспекты хранятся как исключения — новый конспект попадёт сам */
export interface DigestSelection {
  off: ReadonlySet<string>;
  info: boolean;
  files: boolean;
  pdfText: boolean;
  personal: boolean;
}

export const ALL_SELECTED: DigestSelection = { off: new Set(), info: true, files: true, pdfText: true, personal: true };

/** Выбор применяется к входным данным: дальше выгрузку собирает тот же `buildSubjectDigest` */
export function applySelection(input: DigestInput, selection: DigestSelection): DigestInput {
  return {
    ...input,
    info: selection.info ? input.info : [],
    notes: input.notes.filter((note) => !selection.off.has(note.id)),
    materials: selection.files ? input.materials : [],
    links: selection.files ? input.links : [],
    personalNotes: selection.personal ? input.personalNotes : [],
    pdfText: selection.pdfText ? input.pdfText : () => undefined,
  };
}

/** Ничего не выбрано — отдавать нечего */
export function isEmpty(input: DigestInput): boolean {
  return (
    !input.info.length && !input.notes.some((note) => !note.archived) && !input.materials.length && !input.links.length && !input.personalNotes.length
  );
}

/** Выбрано всё публичное — хватает одной ссылки на готовый файл предмета (личные заметки в ссылку не попадают в любом случае) */
export const isWholeSubject = (selection: DigestSelection) => selection.off.size === 0 && selection.info && selection.files && selection.pdfText;

/**
 * Выбрано не всё: файл под выбор на статическом сайте не собрать, зато всё выбранное уже лежит в репозитории группы по
 * публичным адресам — отдаём ИИ их список. Конспекты, добавленные вручную в браузере (без файла в репозитории), в него не попадают.
 */
export function buildLinksText(input: DigestInput, selection: DigestSelection): string {
  const picked = applySelection(input, selection);
  const lines = [`Материалы по предмету «${input.subjectName}» (группа М3102, ИТМО). Открой каждую ссылку и прочитай:`, ''];
  for (const item of picked.info) {
    if (item.sourceRef)
      lines.push(`- Описание курса: ${rawUrl('group', COURSE_INFO_DIR + item.sourceRef.slice(item.sourceRef.lastIndexOf('/') + 1))}`);
  }
  for (const note of picked.notes.filter((item) => !item.archived && item.sourceRef).sort(compareLessons)) {
    lines.push(`- ${noteTitle(note)}: ${fileUrl(note.sourceRef!)}`);
  }
  for (const file of [...picked.materials.map((item) => ({ title: item.name, url: item.url })), ...picked.links])
    lines.push(`- ${file.title}: ${file.url}`);
  return `${lines.join('\n')}\n`;
}
