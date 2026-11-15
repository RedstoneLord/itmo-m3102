import { diffTimetableDay, liveFreshness, parseLiveTimetable, timetableChangeText } from './live-timetable.js';
import { esc, read, save } from './student-core.js';
import { markFresh } from './student-data.js';
import { normalizeTimetableLesson } from './timetable-changes.js';

let flight;
let current = { snapshot: null, saved: true };
const KEY = 'm3102-live-timetable-v1';
export async function loadLiveSnapshot() {
  if (flight) return flight;
  flight = (async () => {
    let previous = null;
    try { previous = parseLiveTimetable(read(KEY)); } catch { /* No validated saved snapshot. */ }
    try {
      const response = await fetch('./data/timetable-live.json', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('snapshot');
      const snapshot = parseLiveTimetable(await response.json());
      if (previous && previous.updatedAt > snapshot.updatedAt) throw new Error('older snapshot');
      save(KEY, snapshot);
      markFresh('My ITMO', snapshot.updatedAt, response.headers.has('X-M3102-Saved'));
      return { snapshot, saved: response.headers.has('X-M3102-Saved') };
    } catch {
      if (previous) markFresh('My ITMO', previous.updatedAt, true, true);
      return { snapshot: previous, saved: true };
    }
  })().then((result) => { current = result; return result; }).finally(() => { flight = null; });
  return flight;
}

export function liveRowsOn(date, baseline, snapshot = current.snapshot) {
  baseline = baseline.map((lesson) => normalizeTimetableLesson(lesson, new Date(`${date}T12:00:00Z`).getUTCDay(), baseline, true));
  if (!snapshot?.days || !Object.hasOwn(snapshot.days, date)) return baseline;
  return diffTimetableDay(baseline, snapshot.days[date], date, snapshot.removed[date]).map((row) => {
    const sourceId = row.lesson.id.startsWith('itmo-') ? row.lesson.id : snapshot.removed[date]?.find((item) =>
      item.subjectId === row.lesson.subjectId && item.start === row.lesson.start)?.id;
    const movedTo = row.state === 'cancelled' && sourceId && Object.entries(snapshot.days).find(([day, lessons]) =>
      day !== date && lessons.some((item) => item.id === sourceId && item.previous?.date === date));
    const lesson = row.lesson;
    const visible = { id: row.before?.id || lesson.id, start: lesson.start, end: lesson.end,
      subject: lesson.subject || '', kind: lesson.kind, room: lesson.room || '', teacher: lesson.teacher || '',
      location: lesson.location || '', break: false };
    // The classic editor clones displayed lessons into drafts. Keep every runtime annotation out of that clone
    // and of JSON exports, preserving the group's original schedule.json schema.
    Object.defineProperties(visible, {
      cancelled: { value: row.state === 'cancelled' },
      sourceChange: { value: movedTo ? `Перенесено на ${movedTo[0]}` : timetableChangeText(row) },
      sourceChanges: { value: row.changes },
      previousRoom: { value: row.previous?.room },
    });
    return visible;
  });
}
export function liveStatusMarkup(schedule, date) {
  schedule = { live: current.snapshot, liveSaved: current.saved, ...schedule };
  const outside = schedule.live && !Object.hasOwn(schedule.live.days, date);
  return `<p class="live-source" role="status" data-saved="${Boolean(schedule.liveSaved || (schedule.live && Date.now() - Date.parse(schedule.live.updatedAt) > 10800000))}">${esc(liveFreshness(schedule.live))}${schedule.live && schedule.liveSaved ? ' · сохранённая копия' : ''}${outside ? ' · на эту дату показано обычное расписание' : ''}</p>`;
}
export function liveChangeMarkup(lesson) {
  return lesson.sourceChange ? `<p class="live-change${lesson.cancelled ? ' live-missing' : ''}" role="status">${esc(lesson.sourceChange)}</p>` : '';
}
export function liveChangeLabel(lesson) {
  if (lesson.cancelled) return 'Не проводится';
  if (lesson.sourceChanges?.includes('room')) return 'Ауд. изменена';
  if (lesson.sourceChanges?.some((kind) => kind === 'time' || kind === 'date')) return 'Перенесено';
  return 'Дополнительно / уточнено';
}
export function liveDayBanner(lessons) {
  const changed = lessons.filter((lesson) => lesson.sourceChange);
  return changed.length ? `<p class="live-day-banner" role="status">В расписании есть изменения: ${changed.length}. Проверьте отмеченные занятия.</p>` : '';
}
export function cancelledLessonMarkup(lesson) {
  return `<article class="sched-entry live-cancelled" data-cancelled="true" data-start="${esc(lesson.start)}" data-end="${esc(lesson.end)}" data-lesson="${esc(lesson.id)}"><div class="sched-time"><strong><del>${esc(lesson.start)}</del></strong><small>${esc(lesson.end)}</small></div><span class="sched-rail" aria-hidden="true"></span><details class="sched-card"><summary><span class="sched-card-main"><strong><del>${esc(lesson.subject)}</del></strong><small>${esc(lesson.sourceChange)}</small></span><span class="live-change-badge">Не проводится</span></summary><div class="sched-card-body">${liveChangeMarkup(lesson)}<p>Занятие отсутствует в полной выгрузке My ITMO на эту дату.</p></div></details></article>`;
}
