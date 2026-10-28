import type { CSSProperties } from 'react';
import { ITEM_STYLES, THEMES, themeVars } from '../../../../../js/casino-themes.js';
import { ITEM, type SlotsState } from '../../../../../js/slots-math.js';
import { cn } from '../../../lib/cn';
import styles from './CollectionPage.module.css';

/** Тема (класс и переменные --ct-*) стола: надетое сейчас, а с overlay — то же, но с этим предметом (тема, сукно, фишки или рубашка) */
export function tableLook(state: SlotsState, overlay?: string) {
  const current = themeVars(state);
  let { theme, vars } = current;
  let cardback = current.picked.cardback || 'default';
  const item = overlay ? ITEM[overlay] : undefined;
  if (overlay && item?.kind === 'theme') {
    const next = THEMES[overlay.replace(/^theme:/, '')];
    if (next) {
      // Тема показана сама по себе: надетое сукно и фишки перекрыли бы её цвета, и все темы выглядели бы одинаково
      vars = { ...next.vars, '--ct-font': next.font, '--ct-font-d': next.fontDisplay };
      cardback = 'default';
      theme = next;
    }
  } else if (overlay && ITEM_STYLES[overlay]) {
    vars = { ...vars, ...ITEM_STYLES[overlay] };
    if (item?.kind === 'cardback') cardback = overlay.split(':')[1] ?? 'default';
  }
  return { className: cn('casino-root', theme.cls, theme.skin), style: vars as CSSProperties, cardback };
}

interface TablePreviewProps {
  state: SlotsState;
  /** Предмет, который нужно показать на столе вместо надетого */
  overlay?: string;
  /** Крупнее: для сводки «Сейчас на вас» */
  large?: boolean;
}

/** Миниатюра стола: сукно, фишки, рубашка и кнопка в стиле темы — видно, как предмет выглядит, не заходя в игру */
export function TablePreview({ state, overlay, large = false }: TablePreviewProps) {
  const look = tableLook(state, overlay);
  return (
    <div
      className={cn(look.className, styles.table, large && styles.tableLarge)}
      style={look.style}
      data-ct-cardback={look.cardback}
      aria-hidden="true"
    >
      <div className={cn('ct-felt', styles.felt)}>
        <span className={styles.chips}>
          <span className="ct-chip" data-tier="1">
            5
          </span>
          <span className="ct-chip" data-tier="2">
            50
          </span>
          <span className="ct-chip" data-tier="3">
            500
          </span>
        </span>
        <span className={cn('ct-cardback', styles.cardback)} />
        <span className={styles.tableButton}>Играть</span>
      </div>
    </div>
  );
}
