export type LiveKind = 'lecture' | 'lab' | 'practice' | 'seminar' | 'exam' | 'credit' | 'consultation';
export interface LiveLesson {
  id: string;
  subjectId: string;
  subject: string;
  start: string;
  end: string;
  kind: LiveKind;
  room: string;
  teacher: string;
  location: string;
  calendarDate?: string;
  previous?: LiveLesson & { date: string };
}
export interface LiveTimetable {
  version: 1;
  source: 'my.itmo';
  group: 'М3102';
  updatedAt: string;
  from: string;
  to: string;
  days: Record<string, LiveLesson[]>;
  removed: Record<string, LiveLesson[]>;
}
export interface TimetableLesson {
  id: string;
  subjectId?: string;
  subject?: string;
  start: string;
  end: string;
  kind: string;
  room?: string;
  teacher?: string;
  location?: string;
  break?: boolean;
  calendarDate?: string;
}
export interface TimetableDiff {
  lesson: TimetableLesson;
  before?: TimetableLesson;
  previous?: TimetableLesson & { date?: string };
  changes: ('room' | 'time' | 'date' | 'teacher' | 'type' | 'missing')[];
  state: 'regular' | 'changed' | 'additional' | 'cancelled';
}
export function validDate(value: unknown): value is string;
export function shiftDate(date: string, count: number): string;
export function campusDate(now?: Date): string;
export function dateRange(from: string, to: string): string[];
export function isIndividualLesson(lesson: Record<string, unknown>): boolean;
export function importPersonalTimetable(responses: unknown[], from: string, to: string, updatedAt: string, previous?: LiveTimetable | null): LiveTimetable;
export function parseLiveTimetable(raw: unknown): LiveTimetable;
export function lessonChanges(before: TimetableLesson, after: TimetableLesson): TimetableDiff['changes'];
export function diffTimetableDay(baseline: TimetableLesson[], actual: LiveLesson[], date: string, removed?: LiveLesson[]): TimetableDiff[];
export function timetableChangeText(row: TimetableDiff): string;
export function liveFreshness(snapshot: LiveTimetable | null | undefined, now?: number): string;
