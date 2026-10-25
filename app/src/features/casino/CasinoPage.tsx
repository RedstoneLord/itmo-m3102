import { useEffect, useRef } from 'react';
import '../../../../css/slots.css';
import '../../../../css/casino.css';
import '../../../../css/casino-themes.css';
import './casino.css';
import styles from '../game/GamePage.module.css';

/**
 * Страницы казино сайта группы (автор — RedstoneLord): хаб, блэкджек, рулетка, слоты и коллекция. Код игр — его файлы из `js/`,
 * читаются при сборке без копий: правки у него подхватываются сами. Каждая страница рисует себя в элемент `#content`
 * и оставляет очистку в `window.__hhDestroy` — здесь это только узел `#content` на время страницы.
 */
const GAMES = {
  casino: () => import('../../../../js/casino.js').then((module) => module.renderCasinoPage),
  blackjack: () => import('../../../../js/blackjack.js').then((module) => module.renderBlackjackPage),
  roulette: () => import('../../../../js/roulette.js').then((module) => module.renderRoulettePage),
  collection: () => import('../../../../js/casino-collection.js').then((module) => module.renderCollectionPage),
  slots: () => import('../../../../js/slots.js').then((module) => module.renderSlotsPage),
};

export type CasinoGame = keyof typeof GAMES;

let themesInstalled = false;

declare global {
  interface Window {
    __hhDestroy?: () => void;
  }
}

export default function CasinoPage({ game }: { game: CasinoGame }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Свой #content на каждый запуск: в StrictMode эффект идёт дважды, а модули ищут контейнер через document.querySelector('#content')
    const host = document.createElement('div');
    host.id = 'content';
    ref.current.append(host);
    let cancelled = false;
    let started = false;
    void Promise.all([GAMES[game](), import('../../../../js/casino-themes.js')]).then(([render, themes]) => {
      if (cancelled) return;
      // Тема казино (сукно, фишки, рубашки карт) — по тому, что человек выбрал в коллекции; шрифты тем остаются системными
      if (!themesInstalled) {
        themesInstalled = true;
        themes.installCasinoThemes();
      }
      render();
      started = true;
      themes.decorateCasinoPage(host);
    });
    return () => {
      cancelled = true;
      if (started) window.__hhDestroy?.();
      host.remove();
    };
  }, [game]);

  return (
    <>
      <div ref={ref} />
      <p className={styles.credit}>
        Игры RedstoneLord с{' '}
        <a href="https://redstonelord.github.io/itmo-m3102/#/casino" target="_blank" rel="noopener noreferrer">
          сайта группы
        </a>
      </p>
    </>
  );
}
