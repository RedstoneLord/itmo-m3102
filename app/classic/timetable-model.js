// Календарная геометрия без DOM и сети, включая соседние месяцы и високосные годы.
export function monthDates(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), 1 - offset + i));
}
export function subjectColorId(subject) {
  const name = String(subject).replaceAll('_', ' ').toLowerCase().replaceAll('ё', 'е').trim();
  const known = [/дискрет/, /алгоритм/, /программир/, /линейн|алгебр/, /математическ.*анализ|матан/, /инструмент|исрпо/, /истори/];
  const index = known.findIndex((re) => re.test(name));
  return index >= 0 ? index : [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % 8;
}
export const lessonKind = (kind) =>
  ({ lecture: 'Лекция', practice: 'Практика', lab: 'Лабораторная', seminar: 'Семинар', other: 'Занятие' })[kind] || 'Занятие';
