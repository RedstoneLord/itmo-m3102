export { lessonChanges, diffTimetableDay, timetableChangeText, liveFreshness } from './live-timetable';
import type { TimetableLesson } from './live-timetable';
export function roomNumber(value: unknown): string;
export function normalizeTimetableLesson<T extends TimetableLesson>(lesson: T, weekday: number, reference?: TimetableLesson[], isReference?: boolean): T;
