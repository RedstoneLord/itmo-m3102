import { Check } from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';
import { Dropdown } from '../../components/ui/Dropdown';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { onRovingKeyDown } from '../../lib/rovingKeys';
import { useMeChoice } from '../group/studentOptions';
import { accentColor } from '../settings/appearance';
import { useSettingsStore, type AppStyle } from '../settings/settingsStore';
import { STYLE_OPTIONS, THEME_OPTIONS } from '../settings/themeOptions';
import type { ThemePreference } from '../../types/models';
import { PALETTE_PAIRS, type PalettePair } from './palettePairs';
import styles from './FirstRun.module.css';

const STYLE_HINTS: Record<AppStyle, string> = {
  minimal: 'Чистые поверхности без фона и свечения.',
  aurora: 'Мягкое сияние за страницей и подсветка карточек.',
  glass: 'Прозрачное стекло с бликами.',
};

const THEME_HINTS: Record<ThemePreference, string> = {
  light: 'Светлый фон.',
  dark: 'Тёмный фон — мягче для глаз вечером.',
  system: 'Повторяет оформление вашего устройства.',
};

// Каждый выбор применяется сразу, как только сделан, — окно само служит предпросмотром, кнопки только закрывают его

function StyleStep() {
  const style = useSettingsStore((state) => state.style);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  return (
    <>
      <SegmentedControl label="Стиль" options={STYLE_OPTIONS} value={style} onChange={(value) => setAppearance({ style: value })} />
      <p className={styles.hint}>{STYLE_HINTS[style]}</p>
    </>
  );
}

function ThemeStep() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  return (
    <>
      <SegmentedControl label="Тема" options={THEME_OPTIONS} value={theme} onChange={setTheme} />
      <p className={styles.hint}>{THEME_HINTS[theme]}</p>
    </>
  );
}

function PaletteStep() {
  const accent = useSettingsStore((state) => state.accent);
  const accent2 = useSettingsStore((state) => state.accent2);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const active = PALETTE_PAIRS.find((pair) => pair.a === accent && pair.b === accent2);
  // Динамическая тема перекрывала бы выбранную пару — явный выбор палитры её выключает
  const choose = (pair: PalettePair) => setAppearance({ accent: pair.a, accent2: pair.b, dynamicTheme: 'off' });
  // Цвета не из списка (свои, из настроек) — Tab всё равно заходит в группу, на первую пару
  const stop = active ?? PALETTE_PAIRS[0]!;

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Палитра"
        className={styles.palette}
        onKeyDown={(event) => onRovingKeyDown(event, PALETTE_PAIRS, stop, choose)}
      >
        {PALETTE_PAIRS.map((pair) => (
          <button
            key={pair.id}
            type="button"
            role="radio"
            aria-checked={pair === active}
            aria-label={pair.name}
            title={pair.name}
            tabIndex={pair === stop ? 0 : -1}
            className={styles.pair}
            style={{ '--from': accentColor(pair.a), '--to': accentColor(pair.b) } as CSSProperties}
            onClick={() => choose(pair)}
          >
            {pair === active && <Check size={16} strokeWidth={3} aria-hidden />}
          </button>
        ))}
      </div>
      <p className={styles.hint}>{active ? active.name : 'Свои цвета — останутся как есть.'}</p>
    </>
  );
}

function WhoStep() {
  const choice = useMeChoice();
  return (
    <>
      <Dropdown
        aria-label="Кто вы"
        placeholder="Выберите себя из списка группы"
        searchPlaceholder="Фамилия или ник на GitHub"
        searchable
        menuWidth={320}
        options={choice.options}
        value={choice.value}
        onChange={choice.onChange}
      />
      <p className={styles.hint}>
        Ваши записи в очередях сдачи будут подсвечены, а в карточке — «Вы №3 из 7». Не из группы — выберите «Я гость». Без регистрации; выбор хранится
        только в этом браузере.
      </p>
    </>
  );
}

export interface FirstRunStep {
  id: string;
  title: string;
  Body: ComponentType;
}

/** Шаги окна по порядку. Новый шаг — ещё одна запись со своим телом: выбор применяется сразу, как у этих */
export const STEPS: FirstRunStep[] = [
  { id: 'style', title: 'Стиль', Body: StyleStep },
  { id: 'theme', title: 'Тема', Body: ThemeStep },
  { id: 'palette', title: 'Палитра', Body: PaletteStep },
  { id: 'who', title: 'Кто вы?', Body: WhoStep },
];
