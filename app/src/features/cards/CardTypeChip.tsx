import {
  BookOpen,
  Calculator,
  Code,
  Footprints,
  GitCompareArrows,
  Lightbulb,
  ListChecks,
  Sigma,
  TriangleAlert,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { CARD_TYPE_LABELS, type CardType } from './parse';
import styles from './Cards.module.css';

const ICONS: Record<CardType, LucideIcon> = {
  term: BookOpen,
  concept: Lightbulb,
  theorem: Sigma,
  proof: ListChecks,
  algo: Workflow,
  trace: Footprints,
  calc: Calculator,
  compare: GitCompareArrows,
  code: Code,
  pitfall: TriangleAlert,
};

/** Цвет типа карточки — токены сайта, а не свои оттенки */
export const TYPE_HUE: Record<CardType, string> = {
  term: 'var(--color-lecture)',
  concept: 'var(--color-accent)',
  theorem: 'var(--color-lab)',
  proof: 'var(--color-consultation)',
  algo: 'var(--color-success)',
  trace: 'var(--color-success)',
  calc: 'var(--color-practice)',
  compare: 'var(--color-accent-2)',
  code: 'var(--color-text-secondary)',
  pitfall: 'var(--color-warning)',
};

export const typeStyle = (type: CardType) => ({ '--hue': TYPE_HUE[type] }) as CSSProperties;

/** Метка типа карточки: значок и слово («Теорема», «Алгоритм») — по ним сразу ясно, что от тебя ждут */
export function CardTypeChip({ type }: { type: CardType }) {
  const Icon = ICONS[type];
  return (
    <span className={styles.chip} style={typeStyle(type)}>
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {CARD_TYPE_LABELS[type]}
    </span>
  );
}
