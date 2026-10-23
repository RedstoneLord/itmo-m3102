import type { LectureNote } from '../../types/models';

const firstNumber = (value: string) => Number(/\d+/.exec(value)?.[0] ?? Infinity);

/** «Лекция 2. Название»; у папок без номера («Тесты», «Семинары») приставку не пишем — дублирует название */
export const noteTitle = (note: Pick<LectureNote, 'lectureNumber' | 'title'>) =>
  note.lectureNumber && /\d/.test(note.lectureNumber) ? `${note.lectureNumber}. ${note.title}` : note.title;

/**
 * Порядок как на сайте группы: по номеру занятия (Лекция 1, Практика 1, Лекция 2…), занятия без
 * номера («Доп материалы») — в конце; внутри занятия сначала текстовые конспекты, потом PDF и файлы.
 */
export function compareLessons(a: LectureNote, b: LectureNote): number {
  return (
    firstNumber(a.lectureNumber) - firstNumber(b.lectureNumber) ||
    a.lectureNumber.localeCompare(b.lectureNumber, 'ru', { numeric: true }) ||
    Number(a.contentType !== 'markdown') - Number(b.contentType !== 'markdown') ||
    a.title.localeCompare(b.title, 'ru')
  );
}
