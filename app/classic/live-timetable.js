import { lessonChanges } from './timetable-changes.js';
// Shared by the browser editions and the private build-time importer. No credentials belong in this module.
const SUBJECTS = {
  dm: 'Дискретная математика',
  linal: 'Линейная алгебра',
  matan: 'Математический анализ',
  aisd: 'Алгоритмы и структуры данных',
  isrpo: 'Инструментальные средства разработки ПО',
  op: 'Основы программирования',
};
const TYPES = { 1: 'lecture', 2: 'lab', 3: 'practice', 5: 'exam', 6: 'credit', 9: 'credit', 10: 'consultation' };
const KINDS = new Set(['lecture', 'lab', 'practice', 'seminar', 'exam', 'credit', 'consultation']);
const clean = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const nameKey = (value) => clean(value).toLowerCase().replaceAll('ё', 'е').replaceAll('_', ' ');
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const fail = (message) => { throw new Error(`Timetable: ${message}`); };

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function shiftDate(date, count) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}
export function campusDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dateRange(from, to) {
  if (!validDate(from) || !validDate(to) || from > to) fail('invalid date range');
  const days = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    if (days.length >= 100) fail('date range is too long');
    days.push(date);
  }
  return days;
}
export function isIndividualLesson(lesson) {
  const subject = nameKey(lesson.subject);
  return lesson.flow_type_id === 3 || lesson.flow_type_id === 5 || lesson.work_type_id === 11 || lesson.work_type_id === 131
    || /(?:^|\s|\/)english(?:\s|$)|английский язык|иностранный язык|foreign language|физическ(?:ая|ой) культур|физкультур/.test(subject)
    || ['плавание', 'элективные дисциплины по физической культуре и спорту'].includes(subject);
}
function readPersonalLesson(raw) {
  if (!raw || typeof raw !== 'object') fail('invalid lesson');
  if (isIndividualLesson(raw)) return null;
  const name = nameKey(raw.subject);
  const subjectId = Object.keys(SUBJECTS).find((id) => nameKey(SUBJECTS[id]) === name)
    || (name === 'линейная алгебра и геометрия' ? 'linal' : undefined);
  if (!subjectId) fail('unmapped academic subject; publication stopped');
  // Only the reviewed М3102 academic flows. Latin M appears in the real portal labels.
  const group = clean(raw.group).replaceAll('М', 'M');
  if (!/(?:^|[,(])M3102(?:[,)]|$)/.test(group)) fail('academic flow is not confirmed for M3102');
  if (!Number.isSafeInteger(raw.pair_id) || raw.pair_id <= 0) fail('missing pair identity');
  const kind = TYPES[raw.work_type_id];
  if (!kind) fail('unmapped academic work type; publication stopped');
  return readLesson({
    id: `itmo-${raw.pair_id}`, subjectId, subject: SUBJECTS[subjectId],
    start: raw.time_start, end: raw.time_end, kind,
    room: raw.room, teacher: raw.teacher_name, location: raw.building,
  });
}
function readLesson(raw) {
  if (!raw || typeof raw !== 'object' || !SUBJECTS[raw.subjectId] || !KINDS.has(raw.kind)
    || !TIME.test(raw.start) || !TIME.test(raw.end) || raw.start >= raw.end
    || typeof raw.id !== 'string' || !/^itmo-\d+$/.test(raw.id)) fail('invalid public lesson');
  // Allowlist, never spread upstream data. In particular notes/meeting links/passwords/ISU are never published.
  const value = {
    id: raw.id, subjectId: raw.subjectId, subject: SUBJECTS[raw.subjectId],
    start: raw.start, end: raw.end, kind: raw.kind,
    room: clean(raw.room), teacher: clean(raw.teacher), location: clean(raw.location),
  };
  if (raw.calendarDate !== undefined) {
    if (!validDate(raw.calendarDate)) fail('invalid calendar identity');
    value.calendarDate = raw.calendarDate;
  }
  if ([value.room, value.teacher, value.location].some((text) => text.length > 300 || /https?:|eyJ[A-Za-z0-9_-]+\./i.test(text))) fail('unexpected lesson text');
  return value;
}
function readPrevious(raw) {
  if (!raw || !validDate(raw.date)) fail('invalid previous lesson');
  const lesson = readLesson(raw);
  return { ...lesson, date: raw.date };
}

/** Consume complete API responses, one per requested chunk. A missing day is never an empty day. */
export function importPersonalTimetable(responses, from, to, updatedAt, previous = null) {
  const expected = dateRange(from, to), days = {}, ids = new Set();
  for (const response of responses) {
    if (!response || response.code !== 0 || !Array.isArray(response.data)) fail('API did not report success');
    for (const day of response.data) {
      if (!day || !expected.includes(day.date) || Object.hasOwn(days, day.date) || !Array.isArray(day.lessons)) fail('incomplete or duplicate date coverage');
      const lessons = day.lessons.map(readPersonalLesson).filter(Boolean).map((lesson) => ({ ...lesson, calendarDate: day.date }));
      for (const lesson of lessons) {
        const key = `${day.date}:${lesson.id}`;
        if (ids.has(key)) fail('duplicate lesson');
        ids.add(key);
      }
      days[day.date] = lessons.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    }
  }
  if (Object.keys(days).length !== expected.length) fail('incomplete date coverage');
  if (![...Object.values(days)].some((lessons) => lessons.length)) fail('no shared academic lessons; publication stopped');
  const snapshot = { version: 1, source: 'my.itmo', group: 'М3102', updatedAt, from, to, days, removed: {} };
  if (previous) {
    const before = parseLiveTimetable(previous), oldById = new Map(), newById = new Map();
    for (const [date, lessons] of Object.entries(before.days)) for (const lesson of lessons) {
      const entries = oldById.get(lesson.id) || [];
      entries.push({ ...lesson, date }); oldById.set(lesson.id, entries);
    }
    for (const [date, lessons] of Object.entries(days)) for (const lesson of lessons) {
      const entries = newById.get(lesson.id) || [];
      entries.push({ ...lesson, date }); newById.set(lesson.id, entries);
    }
    for (const [date, lessons] of Object.entries(days)) {
      for (const lesson of lessons) {
        const old = oldById.get(lesson.id), fresh = newById.get(lesson.id);
        const sameDay = old?.find((item) => item.date === date);
        if (sameDay) lesson.calendarDate = sameDay.calendarDate || date;
        if (old?.length === 1 && fresh?.length === 1 && from <= old[0].date && old[0].date <= to) {
          lesson.calendarDate = old[0].calendarDate || old[0].date;
          if (old[0].date !== date || lessonChanges(old[0], lesson).length) lesson.previous = readPrevious(old[0]);
          else if (old[0].previous) lesson.previous = readPrevious(old[0].previous);
        }
      }
      // Retain tombstones for actual extra classes that disappeared too, not only the fixed cycle.
      const removed = [...(before.days[date] || []), ...(before.removed[date] || [])]
        .filter((lesson) => !lessons.some((item) => item.id === lesson.id));
      if (removed.length) snapshot.removed[date] = [...new Map(removed.map((lesson) => [lesson.id, readLesson(lesson)])).values()];
    }
  }
  return parseLiveTimetable(snapshot);
}

/** Validate and re-project a downloaded snapshot before it enters browser state or another deployment. */
export function parseLiveTimetable(raw) {
  if (!raw || raw.version !== 1 || raw.source !== 'my.itmo' || raw.group !== 'М3102'
    || typeof raw.updatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(raw.updatedAt) || !Number.isFinite(Date.parse(raw.updatedAt))) fail('invalid public snapshot');
  const expected = dateRange(raw.from, raw.to), days = {}, removed = {};
  if (!raw.days || Object.keys(raw.days).length !== expected.length) fail('incomplete public snapshot');
  for (const date of expected) {
    if (!Array.isArray(raw.days[date])) fail('missing public date');
    days[date] = raw.days[date].map((lesson) => ({ ...readLesson(lesson), ...(lesson.previous ? { previous: readPrevious(lesson.previous) } : {}) }));
    const ids = new Set(days[date].map((lesson) => lesson.id));
    if (ids.size !== days[date].length) fail('duplicate public lesson');
    if (raw.removed?.[date]) {
      if (!Array.isArray(raw.removed[date])) fail('invalid removed lessons');
      removed[date] = raw.removed[date].map(readLesson).filter((lesson) => !ids.has(lesson.id));
    }
  }
  return { version: 1, source: 'my.itmo', group: 'М3102', updatedAt: raw.updatedAt, from: raw.from, to: raw.to, days, removed };
}

export { lessonChanges, diffTimetableDay, timetableChangeText, liveFreshness } from './timetable-changes.js';
