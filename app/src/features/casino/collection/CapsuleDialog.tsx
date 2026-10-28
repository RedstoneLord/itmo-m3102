import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { cn } from '../../../lib/cn';
import { reduce } from '../../../../../js/casino-common.js';
import { icon } from '../../../../../js/slots-art.js';
import { RARITY, type CatalogItem } from '../../../../../js/slots-math.js';
import { RarityBadge } from './ItemCard';
import type { Collection } from './useCollection';
import styles from './CollectionPage.module.css';

export interface CapsuleResult {
  item: CatalogItem;
  dup: boolean;
  berries: number;
}

type Stage = 'shake' | 'crack' | 'reveal';

/** Что произошло с предметом: новинка, дубль (обмен на ягоды) или расходник */
function outcome(result: CapsuleResult): string {
  if (result.dup) return `Уже есть — обмен на ${result.berries} ягод`;
  if (result.item.kind === 'boost') return 'Применится в следующем забеге ёжика';
  return 'Новинка в альбоме!';
}

/**
 * Открытие капсулы: три встряски, трещина, карточка предмета. Предмет уже выдан и записан (OpenCapsule в странице), окно только показывает,
 * поэтому закрыть его можно лишь после показа — чтобы результат не пропустили.
 */
export function CapsuleDialog({ c, result, onClose }: { c: Collection; result: CapsuleResult; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('shake');
  const { rarity } = result.item;

  useEffect(() => {
    const fast = reduce();
    const timers: number[] = [];
    const at = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, fast ? Math.min(ms, 40) : ms));
    // Звук встряски — три раза, как анимация
    [0, 520, 1040].forEach((ms) => at(() => c.audio.shake(), ms));
    at(() => {
      c.audio.crack(rarity);
      setStage('crack');
    }, 1560);
    at(() => {
      setStage('reveal');
      if (rarity !== 'common') c.fx.burst(rarity === 'legendary' ? 160 : 70);
      c.settle();
    }, 1980);
    return () => timers.forEach(clearTimeout);
    // Запускается один раз на открытое окно: результат и состояние страницы за это время не меняются
  }, []);

  return (
    <Modal
      open
      title="Капсула"
      size="sm"
      onClose={() => stage === 'reveal' && onClose()}
      footer={
        <Button variant="primary" disabled={stage !== 'reveal'} onClick={onClose}>
          Класс!
        </Button>
      }
    >
      <div className={styles.capsule}>
        <div
          className={cn(styles.capBig, stage === 'shake' && styles.shaking, stage !== 'shake' && styles.crack)}
          dangerouslySetInnerHTML={{ __html: icon(`cap-${stage === 'shake' ? 'common' : rarity}`, 140) }}
        />
        <p aria-live="polite" className={styles.capText}>
          {stage === 'shake' ? 'Трясём капсулу…' : RARITY[rarity].name}
        </p>
        {stage === 'reveal' && (
          <div className={styles.reveal} data-rarity={rarity}>
            <RarityBadge rarity={rarity} />
            <strong>{result.item.name}</strong>
            <small>{result.item.desc}</small>
            <em>{outcome(result)}</em>
          </div>
        )}
      </div>
    </Modal>
  );
}
