import { useEffect, useState } from 'react';
import type { smooth as SmoothHolder } from '../../lib/smoothScroll';
import styles from './ScrollExtras.module.css';

/** Блок со своей вертикальной прокруткой (меню, список, панель): колесо над ним — его, а не страницы. getComputedStyle — только у переполненных */
const scrollsItself = (node: HTMLElement) =>
  node.hasAttribute('data-modal') || (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY));

/**
 * Всё про прокрутку, что не нужно для первой отрисовки, — одним ленивым куском (запас первой загрузки выбран).
 * `smooth` — пропсом, а не импортом: импорт из главного куска заставил бы его экспортировать внутренности (+0,4 КБ).
 * 1) Плавное колесо (Lenis): страница доезжает с инерцией, а не прыгает по 100px. Касания Lenis не трогает (телефон и так плавный).
 *    Lenis двигает страницу из главного потока, родная прокрутка — из потока композитора: на странице, которая при прокрутке
 *    сама много работает, Lenis спотыкается — поэтому AppShell выключает его в читалке конспекта (smoothWheel).
 *    Вложенные блоки — своей проверкой, а не allowNestedScroll: та на каждом событии колеса читала стили всей цепочки элементов.
 * 2) «Наверх» внизу по центру, когда страница ушла вниз на полтора экрана (по краям — кнопки читалки и награды). В конспекте
 *    (`endOnly`) — только у конца текста: посреди чтения пилюля мешала.
 */
export function ScrollExtras({ smoothWheel, endOnly, smooth }: { smoothWheel: boolean; endOnly: boolean; smooth: typeof SmoothHolder }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!smoothWheel) return undefined;
    let off = false;
    void import('lenis').then(({ default: Lenis }) => {
      if (!off) smooth.lenis = new Lenis({ autoRaf: true, duration: 1.1, prevent: scrollsItself });
    });
    return () => {
      off = true;
      smooth.lenis?.destroy();
      smooth.lenis = null;
    };
  }, [smoothWheel, smooth]);

  useEffect(() => {
    const update = () => setShown(scrollY > innerHeight * 1.5 && (!endOnly || scrollY + innerHeight * 1.5 > document.documentElement.scrollHeight));
    update();
    addEventListener('scroll', update, { passive: true });
    return () => removeEventListener('scroll', update);
  }, [endOnly]);

  return (
    <button
      type="button"
      className={styles.top}
      data-shown={shown || undefined}
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      onClick={() => (smooth.lenis ? smooth.lenis.scrollTo(0, { duration: 0.9 }) : scrollTo({ top: 0, behavior: 'smooth' }))}
    >
      {/* Стрелка lucide ArrowUp — своим SVG: импорт иконки тянул бы её из главного куска (см. выше) */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m5 12 7-7 7 7M12 19V5" />
      </svg>
      Наверх
    </button>
  );
}
