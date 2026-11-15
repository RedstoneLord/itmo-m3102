// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { M3102_SUBJECTS } from '../../data/m3102';
import type { Subject } from '../../types/models';
import { useSubjectsStore } from './subjectsStore';

it('adds the verified practice subject for existing visitors while preserving their subject edits and custom subjects', async () => {
  const saved = M3102_SUBJECTS.filter((subject) => subject.id !== 'intro-practice').map((subject) => ({
    ...subject,
    ...(subject.id === 'dm' ? { teacherPrimary: 'Сохранённый преподаватель', archived: true } : {}),
  }));
  const custom = { ...saved[0]!, id: 'personal-course', name: 'Личный курс' };
  const migrated = (await useSubjectsStore.persist.getOptions().migrate!({ subjects: [...saved, custom] }, 1)) as { subjects: Subject[] };
  expect(migrated.subjects.find((subject) => subject.id === 'intro-practice')?.name).toBe('Учебная, ознакомительная');
  expect(migrated.subjects.find((subject) => subject.id === 'dm')).toMatchObject({ teacherPrimary: 'Сохранённый преподаватель', archived: true });
  expect(migrated.subjects.find((subject) => subject.id === custom.id)).toEqual(custom);
  expect(new Set(migrated.subjects.map((subject) => subject.id)).size).toBe(migrated.subjects.length);
});
