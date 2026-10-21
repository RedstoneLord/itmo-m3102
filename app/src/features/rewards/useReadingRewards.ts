import { useEffect, type RefObject } from 'react';
import { readingTarget } from './readingBlocks';

/** Текст отрисован целиком, когда блоки перестали появляться: разделы конспекта выводятся по одному */
const SETTLE_MS = 1500;

/**
 * Награда за вдумчивое чтение конспекта группы — модуль группы js/rewards.js (общий баланс ягод с игрой и слотами; награда за
 * каждый конспект один раз навсегда). Читаем его файл при сборке, подгружаем лениво: на скорость конспекта не влияет.
 * path — путь файла в репозитории, как у классической версии: журнал у обеих версий общий.
 */
export function useReadingRewards(contentRef: RefObject<HTMLElement | null>, path: string | undefined, enabled: boolean, version: string): void {
  useEffect(() => {
    const container = contentRef.current;
    if (!enabled || !path || !container) return undefined;
    let cancelled = false;
    let timer = 0;
    const observer = new MutationObserver(schedule);
    function schedule() {
      clearTimeout(timer);
      timer = window.setTimeout(start, SETTLE_MS);
    }
    function start() {
      observer.disconnect();
      void import('../../../../js/rewards.js')
        .then(({ trackReading }) => {
          if (!cancelled && container) trackReading(path!, readingTarget(container));
        })
        .catch(() => undefined);
    }
    observer.observe(container, { childList: true, subtree: true });
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [contentRef, path, enabled, version]);
}
