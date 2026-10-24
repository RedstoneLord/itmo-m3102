import classicPalettes from 'virtual:classic-palettes';
import { ACCENTS } from '../settings/appearance';

/** Готовая пара акцентов для выбора в окне «первого входа»: `a` и `b` — id из ACCENTS или «#rrggbb» (как в settingsStore) */
export interface PalettePair {
  id: string;
  name: string;
  a: string;
  b: string;
}

const accentPair = (a: string, b: string): PalettePair => {
  const name = (id: string) => ACCENTS.find((item) => item.id === id)?.name ?? id;
  return { id: `${a}+${b}`, name: `${name(a)} + ${name(b)}`, a, b };
};

/**
 * Первой стоит пара по умолчанию (лаванда + пыльная роза), затем «базовые» палитры сайта группы — те, что видны без капсул «Колючего куша»,
 * и пара готовых акцентов (прежняя по умолчанию и холодная). Остальное — в «Настройки → Оформление».
 */
export const PALETTE_PAIRS: PalettePair[] = [
  accentPair('lavender', 'dusty'),
  ...classicPalettes.palettes.filter((item) => item.base).map(({ id, name, a, b }) => ({ id: `group-${id}`, name, a, b })),
  accentPair('indigo', 'rose'),
  accentPair('sky', 'teal'),
];
