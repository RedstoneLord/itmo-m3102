import { pluralize } from '../../lib/pluralize';
import type { Mastery } from './schedule';
import styles from './Cards.module.css';

/** Полоса прогресса по карточкам: освоенные — акцентом, начатые — бледнее, новые — пусто; под ней словами */
export function MasteryBar({ mastery, compact = false }: { mastery: Mastery; compact?: boolean }) {
  const { total, mastered, fresh, due } = mastery;
  if (total === 0) return null;
  const started = total - fresh - mastered;
  return (
    <div className={styles.mastery}>
      <div className={styles.bar} role="progressbar" aria-label="Освоено карточек" aria-valuemin={0} aria-valuemax={total} aria-valuenow={mastered}>
        <span className={styles.barDone} style={{ width: `${(mastered / total) * 100}%` }} />
        <span className={styles.barStarted} style={{ width: `${(started / total) * 100}%` }} />
      </div>
      {!compact && (
        <p className={styles.masteryText}>
          Освоено {mastered} из {total}
          {due > 0 && ` · пора повторить ${due}`}
          {fresh > 0 && ` · ${pluralize(fresh, ['новая', 'новые', 'новых'])}`}
        </p>
      )}
    </div>
  );
}
