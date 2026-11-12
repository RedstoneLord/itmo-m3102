import { create } from 'zustand';
import type Lenis from 'lenis';

/** Включённый Lenis (ставит components/layout/ScrollExtras.tsx; null — прокрутка браузера) */
export const smooth: { lenis: Lenis | null } = { lenis: null };

/** Прыжок без анимации (смена страницы, «Назад»): иначе Lenis доехал бы до старой цели поверх нового места */
export const jumpTo = (top: number) =>
  smooth.lenis ? smooth.lenis.scrollTo(top, { immediate: true, force: true }) : scrollTo({ top, behavior: 'instant' });

/**
 * Конспект готов к плавной прокрутке: все разделы нарисованы и невидимые не раскладываются (useLazySections).
 * До этого в читалке прокрутка родная — Lenis двигает страницу из главного потока, и большой конспект с формулами тормозил бы её
 */
export const useNoteSmooth = create<{ ready: boolean }>(() => ({ ready: false }));
