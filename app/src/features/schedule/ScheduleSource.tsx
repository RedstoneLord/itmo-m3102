import { AlertTriangle } from 'lucide-react';
import { liveFreshness } from '../../../classic/timetable-changes';
import { useSubjectName } from '../subjects/subjectsStore';
import { takesPlace, type ClassOccurrence } from './occurrences';
import { useScheduleData } from './scheduleStore';
import styles from './ScheduleSource.module.css';

export function ScheduleSource({ date }: { date?: string }) {
  const { live, liveError } = useScheduleData();
  const outside = date && live && !Object.hasOwn(live.days, date);
  const stale = live && Date.now() - Date.parse(live.updatedAt) > 3 * 3_600_000;
  return (
    <p className={styles.source} role="status" data-saved={Boolean(stale || (live && liveError))}>
      {liveFreshness(live)}
      {live && liveError && ' · не удалось проверить обновление'}
      {outside && ' · для выбранной даты показано обычное расписание, данных My ITMO пока нет'}
    </p>
  );
}

export function ScheduleChanges({ occurrences }: { occurrences: ClassOccurrence[] }) {
  const changed = occurrences.filter((item) => item.sourceChange);
  if (!changed.length) return null;
  const cancelled = changed.filter((item) => !takesPlace(item)).length;
  const rooms = changed.filter((item) => item.sourceChange?.changes.includes('room')).length;
  return (
    <p className={styles.summary} role="status">
      <AlertTriangle size={16} aria-hidden />
      Изменения в расписании: {cancelled > 0 ? `${cancelled} не проводится или перенесено` : ''}
      {cancelled > 0 && rooms > 0 ? ' · ' : ''}
      {rooms > 0 ? `${rooms} смена аудитории` : ''}
      {!cancelled && !rooms ? `${changed.length} уточнений` : ''}.
    </p>
  );
}

export function ClassChangeAlert({ occurrence, subject = false }: { occurrence: ClassOccurrence; subject?: boolean }) {
  const name = useSubjectName(occurrence.details.subjectId);
  if (!occurrence.sourceChange) return null;
  const cancelled = !takesPlace(occurrence);
  return (
    <div className={styles.alert} data-cancelled={cancelled} role="status">
      <AlertTriangle size={17} aria-hidden />
      <div>
        {subject && (
          <strong>
            {cancelled ? (
              <del>
                {occurrence.details.startTime} · {name}
              </del>
            ) : (
              name
            )}
          </strong>
        )}
        <p>{occurrence.sourceChange.message}</p>
      </div>
    </div>
  );
}
