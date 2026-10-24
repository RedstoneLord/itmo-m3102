import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { SegmentedControl, type SegmentedOption } from '../../components/ui/SegmentedControl';
import { WEEK_PARITY_LABELS } from '../../lib/studyWeek';
import type { WeekInCycle } from '../../types/models';
import styles from './ScheduleToolbar.module.css';

export type ScheduleView = 'day' | 'week' | 'month';

export const SCHEDULE_VIEWS: readonly ScheduleView[] = ['day', 'week', 'month'];

const VIEW_OPTIONS: SegmentedOption<ScheduleView>[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

interface ScheduleToolbarProps {
  /** Чётность текущей недели — вычисляется автоматически, переключать вручную нечего */
  weekInCycle: WeekInCycle;
  view: ScheduleView;
  /** Показан не сегодняшний период: на телефоне тогда внизу появляется «Сегодня» — до верха панели не дотянуться */
  awayFromToday: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: ScheduleView) => void;
}

/** Панель над расписанием: переход по неделям или месяцам, «Сегодня», чётность недели, День/Неделя/Месяц. */
export function ScheduleToolbar({ weekInCycle, view, awayFromToday, onPrevious, onNext, onToday, onViewChange }: ScheduleToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.nav}>
        <IconButton icon={ChevronLeft} label={view === 'month' ? 'Предыдущий месяц' : 'Предыдущая неделя'} size="sm" onClick={onPrevious} />
        <button type="button" className={styles.today} onClick={onToday}>
          Сегодня
        </button>
        <IconButton icon={ChevronRight} label={view === 'month' ? 'Следующий месяц' : 'Следующая неделя'} size="sm" onClick={onNext} />
      </div>

      {/* Дубль кнопки из панели для большого пальца (только телефон): вспомогательным технологиям он не нужен */}
      {awayFromToday && (
        <button type="button" className={styles.todayFloat} onClick={onToday} aria-hidden tabIndex={-1}>
          Сегодня
        </button>
      )}

      <div className={styles.controls}>
        {view !== 'month' && <span className={styles.cycleWeek}>{WEEK_PARITY_LABELS[weekInCycle]}</span>}
        <SegmentedControl label="Вид расписания" options={VIEW_OPTIONS} value={view} onChange={onViewChange} />
      </div>
    </div>
  );
}
