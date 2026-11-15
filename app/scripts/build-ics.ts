// Календарь-подписка dist/m3102.ics: пары семестра, дедлайны и ДЗ группы — из репозитория группы, тем же кодом,
// что у сайта. Запускается в CI после сборки (npm run ics) и каждый час по расписанию — подписанные Google и
// Apple Календари сами подтягивают изменения. Ссылка — SUBSCRIPTION_URL в features/schedule/calendarExport.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { campusDate, parseLiveTimetable } from '../classic/live-timetable';
import { M3102_SEMESTER, M3102_SUBJECTS } from '../src/data/m3102';
import { parseDeadlines } from '../src/features/group/groupStore';
import { parseHomework } from '../src/features/homework/homeworkStore';
import { groupCalendarEvents } from '../src/features/schedule/calendarExport';
import { addDays } from '../src/lib/dates';
import { buildIcs } from '../src/lib/ics';
import { rawUrl } from '../src/services/githubContent';
import { parseGroupSchedule } from '../src/services/groupSchedule';

const json = async (path: string) => {
  if (process.env.ITMO_DATA_DIR) return JSON.parse(readFileSync(join(process.env.ITMO_DATA_DIR, path), 'utf8')) as unknown;
  const response = await fetch(rawUrl('group', path), { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};

const schedule = parseGroupSchedule(await json('data/schedule.json'));
const live = process.env.ITMO_TIMETABLE_FILE ? parseLiveTimetable(JSON.parse(readFileSync(process.env.ITMO_TIMETABLE_FILE, 'utf8'))) : null;
const [deadlines, homework] = await Promise.all([
  json('Дедлайны/deadlines.json').then(parseDeadlines),
  json('data/homework.json').then(parseHomework),
]);

// С месяца назад (видно недавнее) на полгода вперёд — весь семестр
const today = campusDate();
const from = addDays(today, -30) > M3102_SEMESTER.semesterStart ? addDays(today, -30) : M3102_SEMESTER.semesterStart;
const events = groupCalendarEvents({
  schedule: {
    classes: schedule.classes,
    exceptions: schedule.exceptions,
    semesterStart: M3102_SEMESTER.semesterStart,
    weekOneStart: schedule.weekOneStart,
    live,
  },
  subjects: M3102_SUBJECTS,
  deadlines,
  homework,
  from,
  days: 200,
});

writeFileSync('dist/m3102.ics', buildIcs(events, { name: 'М3102 — пары, дедлайны и ДЗ' }));
console.log(`dist/m3102.ics: ${events.length} событий (${from} + 200 дней)`);
