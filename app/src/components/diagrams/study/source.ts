export const STUDY_LANGUAGES = ['geometry3d', 'matrix'] as const;
export type StudyLanguage = (typeof STUDY_LANGUAGES)[number];

export function isStudyLanguage(value: string): value is StudyLanguage {
  return value === 'geometry3d' || value === 'matrix';
}

export const escapeMarkup = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function lineError(line: number, message: string): never {
  throw new Error(`Строка ${line}: ${message}`);
}

export function readStudySource(source: string, language: StudyLanguage) {
  const header = { title: '', caption: '' };
  const body: { line: number; text: string }[] = [];
  if (source.length > 12000) lineError(1, 'блок длиннее 12 000 символов');
  source.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim();
    if (!text || text === language || text.startsWith('#') || text.startsWith('//')) return;
    const field = /^(title|caption):\s*(.*)$/.exec(text);
    if (field) {
      header[field[1] as 'title' | 'caption'] = field[2]!;
    } else {
      body.push({ line: index + 1, text });
    }
  });
  return { source, header, body };
}

export const studyTypes = {
  geometry3d: {
    label: '3D-геометрия',
    hint: 'point x y z "имя", vector x y z -> x y z "имя" color=blue, line x y z | dx dy dz, plane x y z | ux uy uz | vx vy vz. view: азимут угол; axes: on/off.',
    template: `title: Векторы и плоскость
view: 35 26
plane 0 0 0 | 1 0 0 | 0 1 0 "Плоскость" color=blue
vector 0 0 0 -> 2 0 0 "a" color=blue
vector 0 0 0 -> 0 2 0 "b" color=green
vector 0 0 0 -> 1 1 2 "c" color=purple`,
  },
  matrix: {
    label: 'Матрица',
    hint: 'Ячейки через пробел, границы групп |. columns: подпись | подпись. pivots: 1, 2. rhs: last — последняя группа является правой частью. Шаги: swap 1 2, scale 1 1/2, add 2 1 -2 (прибавить к строке 2 строку 1 с множителем −2). print: first/last/номер.',
    template: `title: Матрица перехода
columns: Старый базис | Новый базис
rhs: last
1 1 | 3 2
2 3 | 7 1
add 2 1 -2
add 1 2 -1
print: last`,
  },
} satisfies Record<StudyLanguage, { label: string; hint: string; template: string }>;
