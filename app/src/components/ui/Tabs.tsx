import { motion } from 'framer-motion';
import { useEffect, useId, useRef } from 'react';
import { cn } from '../../lib/cn';
import { onRovingKeyDown } from '../../lib/rovingKeys';
import { revealInRow } from '../../lib/revealInRow';
import { SPRING_SNAPPY } from '../../lib/motion';
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Число справа от названия, например количество задач */
  count?: number;
  /** Тихая точка рядом с названием: во вкладке есть то, что человек ещё не видел */
  dot?: boolean;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Название группы вкладок для скринридера */
  label: string;
  className?: string;
}

/** Вкладки с тонким подчёркиванием активной. Содержимое вкладок рисует сама страница. */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  const indicatorId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => revealInRow(rowRef.current), [value]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      data-fade-x
      aria-label={label}
      className={cn(styles.list, className)}
      onKeyDown={(event) =>
        onRovingKeyDown(
          event,
          items.map((item) => item.value),
          value,
          onChange,
        )
      }
    >
      {items.map((item) => {
        const isActive = item.value === value;

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={cn(styles.tab, isActive && styles.active)}
            onClick={() => onChange(item.value)}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
            {item.dot && <span className={styles.dot} role="img" aria-label="есть новое" />}
            {/* Один и тот же layoutId переезжает между вкладками — отсюда «проезд» подчёркивания */}
            {isActive && <motion.span layoutId={`tabs-indicator-${indicatorId}`} className={styles.indicator} transition={SPRING_SNAPPY} />}
          </button>
        );
      })}
    </div>
  );
}
