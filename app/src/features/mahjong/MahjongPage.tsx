import { useEffect, useRef } from 'react';
import { renderMahjongPage } from '../../../../js/mahjong.js';
import '../../../../css/mahjong.css';
import styles from './MahjongPage.module.css';

/** Одна игра для обоих оформлений: общий интерфейс, анимации и сохранения. */
export default function MahjongPage() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    return renderMahjongPage(host.current, { backHref: '#/more' });
  }, []);
  return <div ref={host} className={styles.host} />;
}
