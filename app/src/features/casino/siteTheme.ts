import type { THEMES } from '../../../../js/casino-themes.js';
import { ITEM } from '../../../../js/slots-math.js';

type ThemeRegistry = typeof THEMES;

/**
 * Базовая тема казино («Лес» у группы: листья, толстые контуры, зелёное сукно) в приложении — спокойная тема сайта: те же акценты, рамки и
 * скругления, что у остальных страниц. Остальные темы из коллекции (ночь, серверная, бархат, аркада, хранилище) остаются как у группы.
 * Тема у него — набор переменных --ct-*, поэтому подмена — это только значения в реестре THEMES; сами файлы группы не меняются.
 */
const SITE_VARS = {
  '--ct-acc': 'var(--color-accent)',
  '--ct-acc2': 'var(--color-accent-2)',
  '--ct-r-btn': 'var(--radius-md)',
  '--ct-r-dlg': 'var(--radius-lg)',
  '--ct-r-frame': 'var(--radius-xl)',
  '--ct-bw': '1px',
  '--ct-edge': 'var(--color-border-strong)',
  '--ct-shadow': 'none',
  '--ct-shadow-press': 'none',
  '--ct-press': 'scale(0.97)',
  '--ct-btn-bg': 'var(--control-bg)',
  '--ct-btn-fg': 'var(--color-text)',
  '--ct-primary-bg': 'var(--accent-gradient)',
  '--ct-primary-fg': 'var(--color-on-accent)',
  '--ct-dlg-bg': 'var(--surface-overlay)',
  '--ct-dlg-edge': 'var(--color-border)',
  '--ct-dlg-shadow': 'var(--shadow-modal)',
  // Сукно — глубокий графит с оттенком акцента; линия по краю тонкая
  '--ct-felt-a': 'color-mix(in oklab, var(--color-accent) 26%, #1b1926)',
  '--ct-felt-b': 'color-mix(in oklab, var(--color-accent) 12%, #0f0e16)',
  '--ct-felt-line': 'color-mix(in oklab, var(--color-accent) 50%, transparent)',
  '--ct-felt-ink': '#f4f1fb',
  '--ct-chip-1': '#efeaff',
  '--ct-chip-2': 'color-mix(in oklab, var(--color-accent-2) 90%, #fff)',
  '--ct-chip-3': 'color-mix(in oklab, var(--color-accent) 90%, #fff)',
  '--ct-chip-4': '#2a2838',
  '--ct-chip-edge': '#ffffff',
  '--ct-chip-ink': '#25203a',
  '--ct-chip-stripe': '#ffffff',
  '--ct-cb-a': 'color-mix(in oklab, var(--color-accent) 70%, #1b1926)',
  '--ct-cb-b': 'color-mix(in oklab, var(--color-accent-2) 70%, #fff)',
  '--ct-cb-c': '#fff3c4',
} as const;

let applied = false;

/** Подменяет «Лес» в реестре тем группы и его карточку в каталоге. Звать один раз до первой отрисовки страницы казино. */
export function applySiteTheme(registry: ThemeRegistry): void {
  const forest = registry.forest;
  if (applied || !forest) return;
  applied = true;
  Object.assign(forest, { name: 'Сайт', cls: 'th-site', font: 'inherit', fontDisplay: 'var(--font-sans)' });
  Object.assign(forest.vars, SITE_VARS);
  const item = ITEM['theme:forest'];
  if (item) Object.assign(item, { name: 'Тема барабанов: Сайт', desc: 'Рамка автомата и столы в цветах сайта' });
}
