import { describe, expect, it } from 'vitest';
import { dateRange, importPersonalTimetable } from '../../../classic/live-timetable';
import { groupCalendarEvents } from './calendarExport';
import { getOccurrencesForDate, takesPlace, type ScheduleData } from './occurrences';

const FROM = '2026-11-15',
  TO = '2026-11-21',
  DAY = '2026-11-18';
const rawLesson = (extra = {}) => ({
  pair_id: 77,
  subject: 'Дискретная математика',
  group: 'ДМ 1.2(M3102)',
  work_type_id: 2,
  time_start: '13:30',
  time_end: '15:00',
  room: '2240',
  building: 'Кронверкский',
  teacher_name: 'Т',
  ...extra,
});
const response = (extra = {}, date = DAY) => ({
  code: 0,
  data: dateRange(FROM, TO).map((day) => ({ date: day, lessons: day === date ? [rawLesson(extra)] : [] })),
});
const snapshot = (extra = {}) => importPersonalTimetable([response(extra)], FROM, TO, '2026-11-15T09:00:00Z');
const baseline: ScheduleData = {
  semesterStart: '2026-09-01',
  weekOneStart: '2026-09-14',
  exceptions: [],
  classes: [
    {
      id: 'gh:schedule:dm',
      subjectId: 'dm',
      weekday: 3,
      weeks: 'every',
      type: 'lab',
      startTime: '13:30',
      endTime: '15:00',
      room: '2240',
      building: 'Кронверкский',
      teacher: 'Т',
      createdAt: '',
      updatedAt: '',
    },
  ],
};
const calendar = (data: ScheduleData) => groupCalendarEvents({ schedule: data, subjects: [], deadlines: [], homework: [], from: FROM, days: 40 });

describe('official timetable overlay', () => {
  it('links a room move to one real occurrence, keeping old and new room in the warning', () => {
    const rows = getOccurrencesForDate(DAY, { ...baseline, live: snapshot({ room: '1330' }) });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details.room).toBe('1330');
    expect(rows[0]!.sourceChange?.message).toContain('было 2240');
    expect(rows[0]!.classId).toBe('gh:schedule:dm');
    expect(takesPlace(rows[0]!)).toBe(true);
  });
  it('shows missing classes and new consultation types instead of quietly using the fixed cycle', () => {
    const live = snapshot({ work_type_id: 10 });
    expect(getOccurrencesForDate(DAY, { ...baseline, live }).some((row) => row.details.type === 'consultation' && takesPlace(row))).toBe(true);
    const [missing] = getOccurrencesForDate('2026-11-17', {
      ...baseline,
      live,
      classes: [{ ...baseline.classes[0]!, weekday: 2 }],
    });
    expect(missing!.status).toBe('cancelled');
    expect(missing!.sourceChange?.message).toBe('Нет в расписании My ITMO');
    expect(takesPlace(missing!)).toBe(false);
  });
  it('exports only covered official dates and keeps event UIDs stable through a room or time change', () => {
    const before = calendar({ ...baseline, live: snapshot() });
    const after = calendar({ ...baseline, live: snapshot({ room: '1330', time_start: '17:10', time_end: '18:40' }) });
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0]!.uid).toBe(before[0]!.uid);
    expect(after[0]!.startTime).toBe('17:10');
    expect(after[0]!.location).toContain('1330');
  });
  it('retains an upstream identity when a confirmed class changes day, without two active calendar events', () => {
    const first = snapshot();
    const moved = importPersonalTimetable([response({}, '2026-11-19')], FROM, TO, '2026-11-15T10:00:00Z', first);
    const oldRows = getOccurrencesForDate(DAY, { ...baseline, live: moved });
    expect(oldRows.every((row) => !takesPlace(row))).toBe(true);
    const events = calendar({ ...baseline, live: moved });
    expect(events).toHaveLength(1);
    expect(events[0]!.date).toBe('2026-11-19');
    expect(events[0]!.uid).toBe(calendar({ ...baseline, live: first })[0]!.uid);
  });
});
