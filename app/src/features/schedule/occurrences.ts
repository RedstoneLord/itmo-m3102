import { addDays, getWeekday } from '../../lib/dates';
import { getStudyWeek } from '../../lib/studyWeek';
import type { ClassDetails, ClassSession, ID, ISODate, ScheduleException } from '../../types/models';
import { diffTimetableDay, timetableChangeText } from '../../../classic/timetable-changes';
import type { LiveTimetable, TimetableDiff } from '../../../classic/live-timetable';

/** Всё, что нужно для расчёта расписания */
export interface ScheduleData {
  classes: ClassSession[];
  exceptions: ScheduleException[];
  semesterStart: ISODate;
  weekOneStart: ISODate;
  live?: LiveTimetable | null;
  liveError?: boolean;
}

/**
 * regular    — обычное занятие
 * cancelled  — отменено
 * movedAway  — перенесено с этой даты (показываем бледным)
 * movedHere  — перенесено на эту дату
 * replaced   — вместо регулярного проходит другое занятие
 * additional — дополнительное разовое занятие
 */
export type OccurrenceStatus = 'regular' | 'cancelled' | 'movedAway' | 'movedHere' | 'replaced' | 'additional';

/** Занятие в конкретный день — результат наложения исключений на регулярное расписание */
export interface ClassOccurrence {
  /** Уникальный ключ для списков React */
  key: string;
  date: ISODate;
  status: OccurrenceStatus;
  /** Что показывать: предмет, время, аудитория... */
  details: ClassDetails;
  /** Регулярное занятие, к которому относится (нет только у additional) */
  classId?: ID;
  exception?: ScheduleException;
  /** Для movedAway и movedHere — вторая сторона переноса */
  move?: { date: ISODate; startTime: string };
  /** Difference inferred from a complete official snapshot, never an invented upstream status. */
  sourceChange?: { changes: TimetableDiff['changes']; message: string; previous?: TimetableDiff['previous'] };
  calendarUid?: string;
}

/** Один день с его занятиями */
export interface DaySchedule {
  date: ISODate;
  occurrences: ClassOccurrence[];
}

/** Исключение, которое относится к регулярному занятию */
type ClassException = Exclude<ScheduleException, { kind: 'additional' }>;

/** Проходит ли занятие на самом деле: не отменено и не перенесено отсюда */
export function takesPlace(occurrence: ClassOccurrence): boolean {
  return occurrence.status !== 'cancelled' && occurrence.status !== 'movedAway';
}

/** Идёт ли занятие прямо сейчас */
export function isHappeningNow(occurrence: ClassOccurrence, today: ISODate, time: string): boolean {
  return takesPlace(occurrence) && occurrence.date === today && occurrence.details.startTime <= time && time < occurrence.details.endTime;
}

/**
 * Перед какой парой списка сегодняшнего дня стоит линия «сейчас» (длина списка — после последней).
 * Пока пара идёт, линии нет: «сейчас» показывает сама её строка (подсветка и полоска прогресса).
 */
export function nowMarkerIndex(occurrences: ClassOccurrence[], time: string): number | undefined {
  if (occurrences.some((item) => isHappeningNow(item, item.date, time))) return undefined;
  const next = occurrences.findIndex((item) => item.details.startTime > time);
  return next === -1 ? occurrences.length : next;
}

/** Дата, которую меняет исключение. Для перенесённого занятия — исходная, а не новая. */
export function getChangeDate(occurrence: ClassOccurrence): ISODate {
  const { exception } = occurrence;
  return exception && exception.kind !== 'additional' ? exception.date : occurrence.date;
}

/** Летние каникулы (июль–август) — регулярных пар нет, как на сайте группы */
export function isVacation(date: ISODate): boolean {
  const month = Number(date.slice(5, 7));
  return month === 7 || month === 8;
}

/** Ближайший день после `date`, когда есть пара по предмету — срок ДЗ «к следующей паре» */
export function nextClassDate(subjectId: string, date: ISODate, data: ScheduleData, limit = 60): ISODate | undefined {
  for (let offset = 1; offset <= limit; offset++) {
    const day = addDays(date, offset);
    if (getOccurrencesForDate(day, data).some((item) => takesPlace(item) && item.details.subjectId === subjectId)) return day;
  }
  return undefined;
}

/**
 * Занятия на дату, отсортированные по времени.
 * Исключения (отмена, перенос, замена, дополнительное занятие) всегда важнее регулярного расписания.
 */
export function getOccurrencesForDate(date: ISODate, data: ScheduleData): ClassOccurrence[] {
  const { classes, exceptions, semesterStart, weekOneStart } = data;
  const week = getStudyWeek(date, semesterStart, weekOneStart);
  const weekday = getWeekday(date);
  const occurrences: ClassOccurrence[] = [];

  // 1. Регулярные занятия — только с начала семестра и не на каникулах, с учётом чётности недели
  if (week.number >= 1 && !isVacation(date)) {
    for (const session of classes) {
      const matchesWeek = session.weeks === 'every' || session.weeks === week.weekInCycle;
      if (session.weekday !== weekday || !matchesWeek) continue;
      occurrences.push(applyException(session, date, findException(exceptions, session.id, date)));
    }
  }

  // 2. Занятия, перенесённые на эту дату, и дополнительные занятия
  for (const exception of exceptions) {
    if (exception.kind === 'moved' && exception.newDate === date) {
      const session = classes.find((item) => item.id === exception.classId);
      if (!session) continue;

      occurrences.push({
        key: `${exception.id}:moved-here`,
        date,
        status: 'movedHere',
        classId: session.id,
        exception,
        details: {
          ...toDetails(session),
          startTime: exception.startTime,
          endTime: exception.endTime,
          room: exception.room ?? session.room,
          teacher: exception.teacherOverride ?? session.teacher,
        },
        move: { date: exception.date, startTime: session.startTime },
      });
    }

    if (exception.kind === 'additional' && exception.date === date) {
      occurrences.push({ key: exception.id, date, status: 'additional', exception, details: exception.details });
    }
  }

  if (data.live?.days && Object.hasOwn(data.live.days, date)) return applyLiveDay(date, occurrences, data.live);
  return occurrences.sort((a, b) => a.details.startTime.localeCompare(b.details.startTime));
}

/** The complete dated API list is authoritative inside its coverage window; fixed-cycle rows provide change context. */
export function applyLiveDay(date: ISODate, baseline: ClassOccurrence[], live: LiveTimetable): ClassOccurrence[] {
  const byId = new Map(baseline.map((item) => [item.key, item]));
  const diff = diffTimetableDay(
    baseline.filter(takesPlace).map((item) => ({
      id: item.key,
      subjectId: item.details.subjectId,
      start: item.details.startTime,
      end: item.details.endTime,
      room: item.details.room,
      location: item.details.building,
      teacher: item.details.teacher,
      kind: item.details.type,
    })),
    live.days[date] ?? [],
    date,
    live.removed[date],
  );
  return diff.map((row) => {
    const original = row.before ? byId.get(row.before.id) : undefined;
    const lesson = row.lesson;
    const cancelled = row.state === 'cancelled';
    const sourceId = lesson.id.startsWith('itmo-')
      ? lesson.id
      : live.removed[date]?.find((item) => item.subjectId === lesson.subjectId && item.start === lesson.start)?.id;
    const movedTo =
      cancelled && sourceId
        ? Object.entries(live.days).find(
            ([day, lessons]) => day !== date && lessons.some((item) => item.id === sourceId && item.previous?.date === date),
          )
        : undefined;
    const message = movedTo ? `Перенесено на ${movedTo[0]}` : timetableChangeText(row);
    return {
      key: original?.key ?? `itmo:${lesson.id}:${date}`,
      calendarUid: sourceId
        ? `itmo:${sourceId}:${lesson.calendarDate ?? live.removed[date]?.find((item) => item.id === sourceId)?.calendarDate ?? date}`
        : original?.key,
      date,
      status: cancelled
        ? movedTo
          ? 'movedAway'
          : 'cancelled'
        : row.state === 'additional'
          ? 'additional'
          : row.state === 'changed'
            ? 'replaced'
            : 'regular',
      classId: original?.classId,
      details:
        cancelled && original
          ? original.details
          : {
              subjectId: lesson.subjectId!,
              startTime: lesson.start,
              endTime: lesson.end,
              type: lesson.kind as ClassDetails['type'],
              room: lesson.room,
              building: lesson.location,
              teacher: lesson.teacher ?? '',
            },
      ...(message ? { sourceChange: { changes: row.changes, message, previous: row.previous } } : {}),
    };
  });
}

function findException(exceptions: ScheduleException[], classId: ID, date: ISODate): ClassException | undefined {
  return exceptions.find(
    (exception): exception is ClassException => exception.kind !== 'additional' && exception.classId === classId && exception.date === date,
  );
}

function applyException(session: ClassSession, date: ISODate, exception: ClassException | undefined): ClassOccurrence {
  const occurrence: ClassOccurrence = {
    key: `${session.id}:${date}`,
    date,
    status: 'regular',
    classId: session.id,
    details: toDetails(session),
  };

  if (!exception) return occurrence;

  switch (exception.kind) {
    case 'cancelled':
      return { ...occurrence, status: 'cancelled', exception };
    case 'moved':
      return {
        ...occurrence,
        status: 'movedAway',
        exception,
        move: { date: exception.newDate, startTime: exception.startTime },
      };
    case 'replaced':
      return { ...occurrence, status: 'replaced', exception, details: exception.details };
  }
}

function toDetails(session: ClassSession): ClassDetails {
  return {
    subjectId: session.subjectId,
    startTime: session.startTime,
    endTime: session.endTime,
    type: session.type,
    room: session.room,
    building: session.building,
    teacher: session.teacher,
    subgroup: session.subgroup,
    link: session.link,
    notes: session.notes,
  };
}

/** Ближайшее занятие предмета: сегодня (ещё не закончилось) или в следующие limit дней */
export function nextOccurrence(subjectId: string, today: ISODate, time: string, data: ScheduleData, limit = 21): ClassOccurrence | undefined {
  for (let offset = 0; offset <= limit; offset++) {
    const day = addDays(today, offset);
    const found = getOccurrencesForDate(day, data).find(
      (item) => takesPlace(item) && item.details.subjectId === subjectId && (offset > 0 || item.details.endTime > time),
    );
    if (found) return found;
  }
  return undefined;
}
