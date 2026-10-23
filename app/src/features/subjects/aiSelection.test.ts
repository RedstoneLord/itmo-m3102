import { describe, expect, it } from 'vitest';
import { fileUrl } from '../../services/githubContent';
import type { LectureNote, Material, Note, SubjectInfo } from '../../types/models';
import { buildSubjectDigest, type DigestInput } from './aiDigest';
import { ALL_SELECTED, applySelection, buildLinksText, isEmpty, isWholeSubject, type DigestSelection } from './aiSelection';

const note = (fields: Partial<LectureNote>) =>
  ({ id: fields.title, subjectId: 'dm', source: 'github', archived: false, contentType: 'markdown', content: '', ...fields }) as LectureNote;

const input: DigestInput = {
  subjectName: 'Дискретная математика',
  info: [
    {
      id: 'i',
      title: 'Описание курса',
      content: 'Экзамен в конце',
      sourceRef: 'Конспекты/1 семестр/Поток 1/Дискретная математика/Дискретная математика.md',
    } as SubjectInfo,
  ],
  notes: [
    note({ title: 'Множества', lectureNumber: 'Лекция 1', content: 'Текст про множества', sourceRef: 'Конспекты/ДМ/Лекция_1/Множества.md' }),
    note({
      title: 'Деревья (PDF)',
      lectureNumber: 'Лекция 2',
      contentType: 'pdf',
      content: 'https://x/d.pdf',
      sourceRef: 'Конспекты/ДМ/Лекция_2/Деревья.pdf',
    }),
    note({ title: 'Свой конспект', lectureNumber: 'Лекция 3', source: 'manual', content: 'Мой текст' }),
  ],
  materials: [{ id: 'm', name: 'Учебник', url: 'https://x/book.pdf' } as Material],
  links: [{ title: 'Форма сдачи', url: 'https://example.com/form' }],
  personalNotes: [{ id: 'p', title: 'Шпаргалка', content: 'Личная заметка' } as Note],
  sourceUrl: () => undefined,
  pdfText: () => 'Текст из PDF про деревья',
  date: '23 октября',
};
const select = (changes: Partial<DigestSelection>): DigestSelection => ({ ...ALL_SELECTED, ...changes });
const digest = (selection: DigestSelection) => buildSubjectDigest(applySelection(input, selection));

describe('выбор в «Для ИИ»', () => {
  it('по умолчанию всё: конспекты, текст PDF, описание, материалы, ссылки и личные заметки', () => {
    const text = digest(ALL_SELECTED);
    for (const part of [
      'Текст про множества',
      'Текст из PDF про деревья',
      'Экзамен в конце',
      'Учебник',
      'Форма сдачи',
      'Личная заметка',
      'Мой текст',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('снятый конспект и каждый снятый флажок убирают своё и только своё', () => {
    expect(digest(select({ off: new Set(['Множества']) }))).not.toContain('Текст про множества');
    expect(digest(select({ off: new Set(['Множества']) }))).toContain('Текст из PDF про деревья');
    expect(digest(select({ info: false }))).not.toContain('Экзамен в конце');
    expect(digest(select({ files: false }))).not.toMatch(/Учебник|Форма сдачи/);
    expect(digest(select({ personal: false }))).not.toContain('Личная заметка');
    const noPdf = digest(select({ pdfText: false }));
    expect(noPdf).not.toContain('Текст из PDF про деревья');
    expect(noPdf).toContain('PDF, текст не включён: https://x/d.pdf');
  });

  it('пустой выбор — отдавать нечего', () => {
    expect(isEmpty(applySelection(input, ALL_SELECTED))).toBe(false);
    const nothing = select({ off: new Set(input.notes.map((item) => item.id)), info: false, files: false, personal: false });
    expect(isEmpty(applySelection(input, nothing))).toBe(true);
  });

  it('одна ссылка на файл предмета — только когда выбрано всё публичное', () => {
    expect(isWholeSubject(ALL_SELECTED)).toBe(true);
    expect(isWholeSubject(select({ personal: false }))).toBe(true);
    expect(isWholeSubject(select({ off: new Set(['Множества']) }))).toBe(false);
    expect(isWholeSubject(select({ pdfText: false }))).toBe(false);
  });

  it('выбрано не всё — список адресов выбранного, без своих конспектов и без личных заметок', () => {
    const text = buildLinksText(input, select({ off: new Set(['Деревья (PDF)']), files: false }));
    expect(text).toContain('«Дискретная математика»');
    expect(text).toContain(`- Лекция 1. Множества: ${fileUrl('Конспекты/ДМ/Лекция_1/Множества.md')}`);
    expect(text).toContain(`- Описание курса: ${fileUrl('app/src/data/courseInfo/Дискретная математика.md')}`);
    expect(text).not.toMatch(/Деревья|Учебник|Форма сдачи|Свой конспект|Шпаргалка/);
  });

  it('материалы и ссылки идут в список, пока не сняты', () => {
    const text = buildLinksText(input, select({ info: false, off: new Set(['Множества', 'Деревья (PDF)']) }));
    expect(text).toContain('- Учебник: https://x/book.pdf');
    expect(text).toContain('- Форма сдачи: https://example.com/form');
    expect(text).not.toContain('Описание курса');
  });
});
