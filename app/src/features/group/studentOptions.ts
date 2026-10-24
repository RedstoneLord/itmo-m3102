import type { DropdownOption } from '../../components/ui/Dropdown';
import { M3102_STUDENTS } from '../../data/m3102';

/** Список группы для выбора «кто вы»: фото, имя и @логин (по нему тоже ищется); «Сбросить» — первой строкой, если кто-то уже выбран */
export function studentOptions(withReset: boolean): DropdownOption[] {
  return [
    ...(withReset ? [{ value: '', label: 'Сбросить выбор' }] : []),
    ...M3102_STUDENTS.map((student) => ({
      value: student.github,
      label: student.name,
      shortLabel: student.name.split(' ').slice(0, 2).join(' '),
      hint: `@${student.github}`,
      avatar: `https://github.com/${encodeURIComponent(student.github)}.png?size=64`,
    })),
  ];
}
