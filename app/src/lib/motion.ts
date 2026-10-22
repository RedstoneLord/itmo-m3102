import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';
import type { Transition } from 'framer-motion';

/**
 * Единая система движения приложения — настоящая пружинная физика (Framer Motion spring),
 * а не CSS-приближения кривыми Безье. Три профиля на все интерактивные элементы:
 *
 * - SPRING_SNAPPY   — кнопки, чекбоксы, карточки: маленький элемент, отклик мгновенный.
 * - SPRING_SMOOTH    — попапы/меню/модалки: чуть мягче, солиднее, без резких скачков.
 * - SPRING_PLAYFUL   — редкие акценты (переключатели, счётчики): едва заметный overshoot.
 */
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 };
export const SPRING_SMOOTH: Transition = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 };
export const SPRING_PLAYFUL: Transition = { type: 'spring', stiffness: 420, damping: 20, mass: 0.8 };

/** Обёртка над useReducedMotion Framer Motion — единая точка для чтения настройки ОС. */
export const usePrefersReducedMotion = useFramerReducedMotion;
