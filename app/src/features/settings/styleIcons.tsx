import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Значки стилей — маленькие превью самого стиля, а не «ИИ-иконки» (искры, капли): владелец просил убрать.
 * Minimalism — пустая карточка; Aurora — карточка с двумя пятнами света акцентов; Liquid Glass — подкрашенное стекло с бликом.
 * Совместимы с LucideIcon (size, strokeWidth), поэтому подходят в SegmentedControl и пункты меню.
 */
function Card({ size = 24, strokeWidth = 1.75, className, children }: LucideProps & { children?: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {children}
      <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

const MinimalIcon = (props: LucideProps) => <Card {...props} />;

const AuroraIcon = (props: LucideProps) => (
  <Card {...props}>
    <circle cx="9" cy="10" r="4.5" fill="var(--color-accent)" />
    <circle cx="15.5" cy="14.5" r="3.5" fill="var(--color-accent-2)" opacity={0.85} />
  </Card>
);

const GlassIcon = (props: LucideProps) => (
  <Card {...props}>
    <rect x="3" y="4" width="18" height="16" rx="4" fill="var(--color-accent)" opacity={0.35} />
    <path d="M7 15.5 15.5 7M11 17l6.5-6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" opacity={0.75} />
  </Card>
);

export const STYLE_ICONS = {
  minimal: MinimalIcon as unknown as LucideIcon,
  aurora: AuroraIcon as unknown as LucideIcon,
  glass: GlassIcon as unknown as LucideIcon,
};
