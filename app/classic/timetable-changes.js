// Small shared display/diff module; the API decoder is loaded separately.
const nameKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase().replaceAll('ё', 'е').replaceAll('_', ' ');
export function lessonChanges(before, after) {
  const changes = [];
  if ((before.room || '') !== (after.room || '') || (before.location || '') !== (after.location || '')) changes.push('room');
  if (before.start !== after.start || before.end !== after.end) changes.push('time');
  if ((before.teacher || '') !== (after.teacher || '')) changes.push('teacher');
  if (before.kind !== after.kind) changes.push('type');
  return changes;
}

/** Conservative one-to-one matching: repeated labs at different times are never paired by subject alone. */
export function diffTimetableDay(baseline, actual, date, removed = []) {
  const old = baseline.filter((lesson) => !lesson.break), unmatched = new Set(old), matches = new Map(), left = new Set(actual);
  const sameSubject = (a, b) => a.subjectId && b.subjectId ? a.subjectId === b.subjectId : nameKey(a.subject) === nameKey(b.subject);
  for (const predicate of [
    (a, b) => a.id === b.id && sameSubject(a, b),
    (a, b) => sameSubject(a, b) && a.start === b.start && a.end === b.end,
    (a, b) => sameSubject(a, b) && a.kind === b.kind,
  ]) {
    for (const lesson of left) {
      const candidates = [...unmatched].filter((before) => predicate(before, lesson));
      if (candidates.length !== 1 || [...left].filter((other) => predicate(candidates[0], other)).length !== 1) continue;
      matches.set(lesson, candidates[0]); unmatched.delete(candidates[0]); left.delete(lesson);
    }
  }
  const rows = actual.map((lesson) => {
    const before = matches.get(lesson), previous = lesson.previous || before;
    const changes = previous ? lessonChanges(previous, lesson) : [];
    if (lesson.previous && lesson.previous.date !== date) changes.push('date');
    return { lesson, before, previous, changes, state: before || lesson.previous ? (changes.length ? 'changed' : 'regular') : 'additional' };
  });
  for (const lesson of unmatched) rows.push({ lesson, before: lesson, previous: lesson, changes: ['missing'], state: 'cancelled' });
  for (const lesson of removed) {
    if (actual.some((item) => sameSubject(item, lesson) && item.start === lesson.start)) continue;
    if (rows.some((row) => row.state === 'cancelled' && sameSubject(row.lesson, lesson) && row.lesson.start === lesson.start)) continue;
    rows.push({ lesson, previous: lesson, changes: ['missing'], state: 'cancelled' });
  }
  return rows.sort((a, b) => a.lesson.start.localeCompare(b.lesson.start) || a.state.localeCompare(b.state));
}

export function timetableChangeText(row) {
  if (row.state === 'cancelled') return 'Нет в расписании My ITMO';
  const previous = row.previous;
  const messages = [];
  if (row.changes.includes('room')) {
    if ((previous?.room || '') !== (row.lesson.room || '')) messages.push(`Аудитория изменена: ${row.lesson.room || 'уточняется'}${previous?.room ? ` (было ${previous.room})` : ''}`);
    if ((previous?.location || '') !== (row.lesson.location || '')) messages.push(`Корпус изменён: ${row.lesson.location || 'уточняется'}${previous?.location ? ` (было ${previous.location})` : ''}`);
  }
  if (row.changes.includes('date')) messages.push(`Перенесено с ${previous.date} в ${previous.start}`);
  else if (row.changes.includes('time')) messages.push(`Время изменено: ${row.lesson.start}–${row.lesson.end} (было ${previous.start}–${previous.end})`);
  if (row.changes.includes('teacher')) messages.push('Преподаватель изменён');
  if (row.changes.includes('type')) messages.push('Тип занятия уточнён');
  if (row.state === 'additional') messages.push('Дополнительное занятие');
  return messages.join(' · ');
}

export function liveFreshness(snapshot, now = Date.now()) {
  if (!snapshot) return 'Обычное расписание · данные My ITMO пока не загружены';
  const at = new Date(snapshot.updatedAt), age = now - at.getTime();
  const label = at.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${age > 3 * 3600000 ? 'Сохранённые данные My ITMO' : 'My ITMO'} · обновлено ${label} · проверка каждый час`;
}
