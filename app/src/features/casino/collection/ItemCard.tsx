import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import { RARITY, type Rarity } from '../../../../../js/slots-math.js';
import styles from './CollectionPage.module.css';

const RARITY_TONE: Record<Rarity, BadgeTone> = { common: 'neutral', rare: 'lecture', epic: 'accent', legendary: 'warning' };

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return <Badge tone={RARITY_TONE[rarity]}>{RARITY[rarity].name}</Badge>;
}

export interface CardAction {
  label: string;
  onClick?: () => void;
  /** Выбранное сейчас: показывается галочкой без нажатия */
  done?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}

interface ItemCardProps {
  name: string;
  note: string;
  rarity?: Rarity;
  preview: ReactNode;
  /** Предмета ещё нет: картинка гаснет, вместо названия — подсказка */
  locked?: boolean;
  /** Надето прямо сейчас */
  active?: boolean;
  /** Сколько раз выпало */
  count?: number;
  action?: CardAction;
  /** Короткая строка над кнопкой: цена, «не хватает 40 ягод» */
  hint?: ReactNode;
}

/** Карточка предмета коллекции: картинка, название, что даёт, редкость и одно действие. Состояние — рамкой и словом, а не цветом заливки. */
export function ItemCard({ name, note, rarity, preview, locked = false, active = false, count = 0, action, hint }: ItemCardProps) {
  return (
    <article className={cn(styles.card, active && styles.cardActive, locked && styles.cardLocked)} data-rarity={rarity}>
      <div className={styles.preview}>{preview}</div>
      <div className={styles.cardBody}>
        <h4 className={styles.cardName}>{name}</h4>
        <p className={styles.cardNote}>{note}</p>
        <div className={styles.cardMeta}>
          {active && <Badge tone="success">Надето</Badge>}
          {rarity && <RarityBadge rarity={rarity} />}
          {count > 1 && <span className={styles.count}>выпало ×{count}</span>}
        </div>
      </div>
      <div className={styles.cardFoot}>
        {hint && <span className={styles.cardHint}>{hint}</span>}
        {action &&
          (action.done ? (
            <span className={styles.done}>
              <Check size={14} strokeWidth={2.5} aria-hidden /> {action.label}
            </span>
          ) : (
            <Button size="sm" variant={action.variant ?? 'secondary'} disabled={action.disabled} onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
      </div>
    </article>
  );
}
