import type { DropdownOption } from '../../components/ui/Dropdown';
import { M3102_STUDENTS } from '../../data/m3102';
import { useMeStore } from './meStore';

/** Значение выбора «Я гость» в списке (логины GitHub не начинаются с подчёркивания) */
export const GUEST = '__guest';

/** Что показывать в списке выбранным: логин студента, GUEST или '' (не выбрано) */
export const meValue = ({ login, guest }: { login: string | null; guest: boolean }) => (guest ? GUEST : (login ?? ''));

/** Применяет выбор из списка: студент, «Я гость» или '' — сбросить */
export function chooseMe(value: string) {
  const { setMe, setGuest } = useMeStore.getState();
  if (value === GUEST) setGuest();
  else setMe(value || null);
}

/**
 * Список для выбора «кто вы»: «Я гость» первой строкой (человек не из группы), дальше студенты — фото, имя и @логин (по нему тоже ищется).
 * «Сбросить выбор» — самой первой, если что-то уже выбрано.
 */
export function studentOptions(chosen: boolean): DropdownOption[] {
  return [
    ...(chosen ? [{ value: '', label: 'Сбросить выбор' }] : []),
    { value: GUEST, label: 'Я гость', shortLabel: 'Гость', hint: 'Не из группы — очереди не подсвечиваются', avatar: '' },
    ...M3102_STUDENTS.map((student) => ({
      value: student.github,
      label: student.name,
      shortLabel: student.name.split(' ').slice(0, 2).join(' '),
      hint: `@${student.github}`,
      avatar: `https://github.com/${encodeURIComponent(student.github)}.png?size=64`,
    })),
  ];
}

/** Выбор «кто вы» для списка: что показать выбранным, сам список и что делать при выборе — одинаково на первом входе и в дедлайнах */
export function useMeChoice() {
  const login = useMeStore((state) => state.login);
  const guest = useMeStore((state) => state.guest);
  return { login, guest, value: meValue({ login, guest }), options: studentOptions(login !== null || guest), onChange: chooseMe };
}
