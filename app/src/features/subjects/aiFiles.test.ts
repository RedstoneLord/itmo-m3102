import { describe, expect, it } from 'vitest';
import { M3102_SUBJECTS } from '../../data/m3102';
import { buildAiFiles, COURSE_INFO_DIR, type RepoSource } from './aiFiles';

const PDF = 'Конспекты/ДМ/Лекция_2/Графы.pdf';

const files: Record<string, string> = {
  'Конспекты/Дискретная_математика/Лекция_1/Множества.md': '# Множества\n\nТекст про множества',
  [PDF]: '',
  'Материалы/ДМ/Учебник.pdf': '',
  [`${COURSE_INFO_DIR}Дискретная математика.md`]: '# Дискретная математика\n\nЭкзамен в конце семестра',
  'data/links.json': JSON.stringify({ items: [{ title: 'Форма сдачи', url: 'https://example.com/form', subject: 'ДМ' }] }),
  'data/search-index.json': JSON.stringify({ files: [PDF], sections: [[0, 'Графы', 'Текст про графы из PDF']] }),
};
const repo: RepoSource = { paths: Object.keys(files), read: (path) => files[path]! };

describe('выгрузка предметов для ИИ по ссылке', () => {
  it('по файлу на предмет; в файле предмета — его конспекты, текст PDF, материалы, ссылки и описание курса', async () => {
    const out = await buildAiFiles(repo, new Date('2026-10-22T10:00:00Z'));
    expect(Object.keys(out).sort()).toEqual(M3102_SUBJECTS.map((subject) => `${subject.id}.md`).sort());

    const dm = out['dm.md']!;
    expect(dm).toContain('# Дискретная математика — все материалы');
    expect(dm).toContain('Лекция 1. Множества');
    expect(dm).toContain('Текст про множества');
    expect(dm).toContain('Текст про графы из PDF');
    expect(dm).toContain('[Учебник](https://raw.githubusercontent.com/RedstoneLord/itmo-m3102/master/Материалы/ДМ/Учебник.pdf)');
    expect(dm).toContain('[Форма сдачи](https://example.com/form)');
    expect(dm).toContain('Экзамен в конце семестра');
  });

  it('в шапке — дата и время сборки по Москве, а не по UTC и без «24:00»', async () => {
    const header = async (iso: string) => (await buildAiFiles(repo, new Date(iso)))['dm.md']!.split('\n')[2];
    expect(await header('2026-10-22T10:00:00Z')).toContain('(ИТМО) 22 октября, 13:00 МСК.');
    // 22:30 UTC — уже 01:30 следующих суток в Москве; 21:05 UTC — 00:05, а не 24:05
    expect(await header('2026-10-22T22:30:00Z')).toContain('23 октября, 01:30 МСК.');
    expect(await header('2026-10-22T21:05:00Z')).toContain('23 октября, 00:05 МСК.');
  });

  it('чужие предметы не смешиваются, личных заметок нет', async () => {
    const out = await buildAiFiles(repo, new Date('2026-10-22T10:00:00Z'));
    const aisd = out['aisd.md']!;
    expect(aisd).toContain('# Алгоритмы и структуры данных — все материалы');
    expect(aisd).not.toContain('Множества');
    expect(aisd).not.toContain('Форма сдачи');
    for (const text of Object.values(out)) expect(text).not.toContain('# Мои заметки');
  });
});
