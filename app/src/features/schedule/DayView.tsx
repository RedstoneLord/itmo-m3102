import { CalendarDays } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { List } from '../../components/ui/List';
import { cn } from '../../lib/cn';
import { onRovingKeyDown } from '../../lib/rovingKeys';
import { Swap, useDirection } from '../../components/ui/Swap';
import { addDays, formatDuration, getDayOfMonth, getShortWeekdayName, minutesBetween } from '../../lib/dates';
import { Fragment, useRef, type TouchEvent } from 'react';
import type { ISODate } from '../../types/models';
import { DayOccurrenceRow, timelineClass } from './DayOccurrenceRow';
import type { OccurrenceAction } from './OccurrenceMenuItems';
import { nowMarkerIndex, takesPlace, type ClassOccurrence, type DaySchedule } from './occurrences';
import styles from './DayView.module.css';

interface DayViewProps {
  days: DaySchedule[];
  selectedDate: ISODate;
  today: ISODate;
  time: string;
  onSelectDate: (date: ISODate) => void;
  onAction: (action: OccurrenceAction, occurrence: ClassOccurrence) => void;
}

/** Один день: полоса дней недели для переключения + список занятий выбранного дня. */
export function DayView({ days, selectedDate, today, time, onSelectDate, onAction }: DayViewProps) {
  const selected = days.find((day) => day.date === selectedDate) ?? days[0];
  const direction = useDirection(Date.parse(selected?.date ?? ''));
  const swipe = useSwipe((step) => selected && onSelectDate(addDays(selected.date, step)));

  return (
    <div>
      <div
        className={styles.strip}
        role="tablist"
        aria-label="День недели"
        onKeyDown={(event) =>
          onRovingKeyDown(
            event,
            days.map((day) => day.date),
            selected?.date ?? days[0]!.date,
            onSelectDate,
          )
        }
      >
        {days.map((day) => {
          const isSelected = day.date === selected?.date;
          const isToday = day.date === today;

          return (
            <button
              key={day.date}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={cn(styles.day, isSelected && styles.daySelected)}
              onClick={() => onSelectDate(day.date)}
            >
              <span className={styles.weekday}>{getShortWeekdayName(day.date)}</span>
              <span className={cn(styles.dayNumber, isToday && styles.dayNumberToday)}>{getDayOfMonth(day.date)}</span>
              {/* Точек столько, сколько пар (до шести) — видно, насколько загружен день */}
              <span className={styles.dots} aria-label={`${day.occurrences.length} пар`}>
                {day.occurrences.slice(0, 6).map((occurrence) => (
                  <span key={occurrence.key} className={styles.dot} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Свайп влево-вправо — следующий/предыдущий день; за край недели — соседняя неделя */}
      <div className={styles.swipe} onTouchStart={swipe.start} onTouchEnd={swipe.end}>
        <Swap id={selected?.date ?? ''} direction={direction}>
          {!selected || selected.occurrences.length === 0 ? (
            <EmptyState compact icon={CalendarDays} title="В этот день пар нет" />
          ) : (
            <OccurrenceList occurrences={selected.occurrences} today={today} time={time} onAction={onAction} />
          )}
        </Swap>
      </div>
    </div>
  );
}

/** Горизонтальный свайп: заметно вбок и больше вбок, чем вниз — чтобы не мешать прокрутке страницы */
function useSwipe(onSwipe: (step: 1 | -1) => void) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  return {
    start: (event: TouchEvent) => {
      const touch = event.touches[0];
      origin.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    end: (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!origin.current || !touch) return;
      const dx = touch.clientX - origin.current.x;
      const dy = touch.clientY - origin.current.y;
      origin.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}

interface OccurrenceListProps {
  occurrences: ClassOccurrence[];
  today: ISODate;
  time: string;
  onAction: (action: OccurrenceAction, occurrence: ClassOccurrence) => void;
}

/** Пары одного дня с линией времени, перерывами между ними и, если день сегодняшний, линией «сейчас». Общий для «Дня» и «Недели» на телефоне. */
export function OccurrenceList({ occurrences, today, time, onAction }: OccurrenceListProps) {
  const nowAt = occurrences[0]?.date === today ? nowMarkerIndex(occurrences, time) : undefined;
  return (
    <List className={timelineClass}>
      {occurrences.map((occurrence, index) => (
        <Fragment key={occurrence.key}>
          <BreakRow previous={occurrences[index - 1]} next={occurrence} />
          {nowAt === index && <NowMarker time={time} />}
          <DayOccurrenceRow occurrence={occurrence} today={today} time={time} onAction={onAction} />
        </Fragment>
      ))}
      {nowAt === occurrences.length && <NowMarker key="now" time={time} />}
    </List>
  );
}

/** Линия «сейчас» между парами: время и тонкая линия, на линии времени слева — акцентная точка */
function NowMarker({ time }: { time: string }) {
  return (
    <li className={styles.now} aria-label={`Сейчас ${time}`}>
      <span>{time}</span>
    </li>
  );
}

/** Между парами — «Перемена 10 мин» или «Окно 1 ч 30 мин»: сразу видно, где свободное время */
export function BreakRow({ previous, next }: { previous?: ClassOccurrence; next: ClassOccurrence }) {
  if (!previous || !takesPlace(previous) || !takesPlace(next)) return null;
  const minutes = minutesBetween(previous.details.endTime, next.details.startTime);
  if (minutes <= 0) return null;
  return (
    <li className={cn(styles.break, minutes > 20 && styles.window)} aria-label={`Перерыв ${formatDuration(minutes)}`}>
      <span>{minutes > 20 ? `Окно ${formatDuration(minutes)}` : `Перемена ${minutes} мин`}</span>
    </li>
  );
}
