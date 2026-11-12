import type Lenis from 'lenis';

/** Включённый Lenis (ставит components/layout/ScrollExtras.tsx; null — прокрутка браузера) */
export const smooth: { lenis: Lenis | null } = { lenis: null };

/** Прыжок без анимации (смена страницы, «Назад»): иначе Lenis доехал бы до старой цели поверх нового места */
export const jumpTo = (top: number) =>
  smooth.lenis ? smooth.lenis.scrollTo(top, { immediate: true, force: true }) : scrollTo({ top, behavior: 'instant' });
