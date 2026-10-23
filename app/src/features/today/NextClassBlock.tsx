import { FileText, FolderOpen } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { buttonClass } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { addDays, formatDayLabel, formatDuration, formatShortDate, formatWeekdayDate, minutesBetween } from '../../lib/dates';
import { classTypeColorVar, CLASS_TYPE_LABELS } from '../schedule/labels';
import { takesPlace, type ClassOccurrence } from '../schedule/occurrences';
import type { ClassDetails, ClassType, ISODate } from '../../types/models';
import { useLectureNotesStore } from '../materials/lectureNotesStore';
import { compareLessons } from '../materials/noteOrder';
import { parseLessonLabel } from '../schedule/lessons';
import { useSubjectName } from '../subjects/subjectsStore';
import type { ClassStatus } from './classStatus';
import styles from './NextClassBlock.module.css';

interface NextClassBlockProps {
  status: ClassStatus;
  /** Все занятия дня, который показывает полоска (сегодня; когда пары кончились — день следующей пары) */
  occurrences: ClassOccurrence[];
  /** День полоски */
  date: ISODate;
  today: ISODate;
  /** Текущее время "HH:mm" */
  time: string;
}

/**
 * Главная карточка страницы: что идёт сейчас или что будет дальше. Крупное время (или сколько осталось до конца пары)
 * и полоска дня с метками всех пар — единственное «громкое» место главной, остальное вокруг спокойное.
 */
export function NextClassBlock({ status, occurrences, date, today, time }: NextClassBlockProps) {
  const isNow = status.kind === 'now';
  const upcoming = status.kind === 'finished' ? status.next?.occurrence : status.occurrence;
  const details = upcoming?.details;
  const note = useLatestLectureNote(details?.subjectId);

  return (
    <section className={cn(styles.block, 'glass-edge', isNow && styles.now)} style={typeColor(details?.type)} aria-label="Ближайшая пара">
      <span className={styles.sheen} aria-hidden />
      <div className={styles.top}>
        <p className={styles.status}>
          {isNow && <span className={styles.liveDot} aria-hidden />}
          {isNow ? 'Идёт сейчас' : status.kind === 'next' ? 'Следующая пара' : 'Пар сегодня больше нет'}
        </p>
        {status.kind === 'next' && <p className={styles.chip}>через {formatDuration(status.minutesUntil)}</p>}
        {status.kind === 'now' && <p className={styles.chip}>до {status.occurrence.details.endTime}</p>}
        {status.kind === 'finished' && status.next && <p className={styles.chip}>{status.next.dayLabel}</p>}
      </div>

      {details ? (
        <div className={styles.main}>
          <p className={styles.big}>{status.kind === 'now' ? <Remaining minutes={status.minutesLeft} /> : <span>{details.startTime}</span>}</p>
          <div className={styles.info}>
            <p className={styles.title}>
              <SubjectName subjectId={details.subjectId} />
            </p>
            <ClassDetailsLine details={details} showTime={status.kind !== 'finished'} />
            <div className={styles.actions}>
              {note && (
                <Link to={`/materials/notes/${note.id}`} className={buttonClass('secondary', 'md')}>
                  <FileText size={14} strokeWidth={1.75} aria-hidden />
                  Конспект
                </Link>
              )}
              <Link to={`/subjects/${details.subjectId}?tab=materials`} className={buttonClass('secondary', 'md')}>
                <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
                Материалы
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.title}>Нет пар в ближайшие 7 дней</p>
      )}

      {status.kind === 'now' && <ClassProgress details={status.occurrence.details} time={time} />}
      <DayRail occurrences={occurrences} date={date} today={today} time={time} />
    </section>
  );
}

/** Последний конспект предмета по номеру занятия — его и открывают перед следующей парой */
function useLatestLectureNote(subjectId: string | undefined) {
  const notes = useLectureNotesStore((state) => state.lectureNotes);
  return useMemo(
    () =>
      subjectId
        ? notes
            .filter((item) => item.subjectId === subjectId && !item.archived && parseLessonLabel(item.lectureNumber))
            .sort(compareLessons)
            .at(-1)
        : undefined,
    [notes, subjectId],
  );
}

/** Таблетка слева — цвет типа пары, как в расписании */
const typeColor = (type?: ClassType) => (type ? ({ '--type-color': classTypeColorVar(type) } as CSSProperties) : undefined);

function SubjectName({ subjectId }: { subjectId: string }) {
  return <>{useSubjectName(subjectId)}</>;
}

/** Сколько осталось до конца пары: меньше часа — «38 мин», больше — «1:25» */
function Remaining({ minutes }: { minutes: number }) {
  if (minutes >= 60) {
    return (
      <>
        <span>
          {Math.floor(minutes / 60)}:{String(minutes % 60).padStart(2, '0')}
        </span>
        <small>ч до конца</small>
      </>
    );
  }
  return (
    <>
      <AnimatedNumber value={minutes} />
      <small>мин до конца</small>
    </>
  );
}

/** Сколько пары уже прошло — тонкая полоска */
function ClassProgress({ details, time }: { details: ClassDetails; time: string }) {
  const total = minutesBetween(details.startTime, details.endTime);
  const done = Math.min(Math.max(minutesBetween(details.startTime, time), 0), total);
  return (
    <div className={styles.progress} aria-hidden>
      <span style={{ width: `${(done / total) * 100}%` }} />
    </div>
  );
}

const minutesOf = (hhmm: string) => minutesBetween('00:00', hhmm);

/**
 * Весь день одной полоской: пара — отрезок цвета её типа, шире — длиннее. Прошедшие бледнее, текущая — яркая,
 * тонкая линия — «сейчас». Чисто для обзора: те же пары подробно перечислены в блоке «Сегодня», поэтому скрыта от скринридеров.
 */
function DayRail({ occurrences, date, today, time }: { occurrences: ClassOccurrence[]; date: ISODate; today: ISODate; time: string }) {
  const classes = occurrences.filter(takesPlace);
  if (classes.length === 0) return null;

  const starts = classes.map((item) => minutesOf(item.details.startTime));
  const ends = classes.map((item) => minutesOf(item.details.endTime));
  const from = Math.min(8 * 60, Math.floor(Math.min(...starts) / 60) * 60);
  const to = Math.max(18 * 60, Math.ceil(Math.max(...ends) / 60) * 60);
  const at = (minute: number) => `${((minute - from) / (to - from)) * 100}%`;
  // «Сейчас» и прошедшие пары — только у сегодняшнего дня; у завтрашнего все отрезки одинаковые
  const live = date === today;
  const now = live ? minutesOf(time) : -1;
  const dayLabel = date <= addDays(today, 1) ? `${formatDayLabel(date, today)}, ${formatShortDate(date)}` : formatWeekdayDate(date);
  const hours = Array.from({ length: Math.floor((to - from) / 120) + 1 }, (_, index) => from / 60 + index * 2);

  return (
    <div className={styles.rail} aria-hidden>
      <p className={styles.railDay}>{dayLabel}</p>
      <div className={styles.track}>
        {classes.map((item, index) => {
          const start = starts[index]!;
          const end = ends[index]!;
          const state = now >= end ? styles.past : now >= start ? styles.current : '';
          return (
            <span
              key={item.key}
              className={cn(styles.segment, state)}
              style={{ left: at(start), width: `calc(${at(end)} - ${at(start)})`, ...typeColor(item.details.type) }}
            />
          );
        })}
        {now >= from && now <= to && <span className={styles.nowLine} style={{ left: at(now) }} />}
      </div>
      <div className={styles.ticks}>
        {hours.map((hour) => (
          <span key={hour} style={{ left: at(hour * 60) }}>
            {hour}
          </span>
        ))}
      </div>
    </div>
  );
}

interface ClassDetailsLineProps {
  details: ClassDetails;
  showTime?: boolean;
}

function ClassDetailsLine({ details, showTime = false }: ClassDetailsLineProps) {
  return (
    <p className={styles.details}>
      <span>{CLASS_TYPE_LABELS[details.type]}</span>
      {details.room && <span>Аудитория {details.room}</span>}
      {showTime && (
        <span>
          {details.startTime} — {details.endTime}
        </span>
      )}
    </p>
  );
}
