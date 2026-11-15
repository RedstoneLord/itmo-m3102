// Small shared display/diff module; the API decoder is loaded separately.
const nameKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase().replaceAll('ё', 'е').replaceAll('_', ' ');
export function roomNumber(value) {
  const text = String(value || '').trim();
  return text.match(/\d+/g)?.join('/') || text;
}
const buildingKey = (value) => nameKey(String(value || '').replace(/^[^,]*classroom\s*\(?\d+\)?\s*,?\s*/i, ''));
const teacherKey = (value) => nameKey(value).replace(/^ржонсицкая(?=\s)/u, 'ржонсницкая');
const isMatanPractice = (lesson) => (lesson.subjectId === 'matan' || nameKey(lesson.subject) === 'математический анализ') && lesson.kind === 'practice';
export function normalizeTimetableLesson(lesson, weekday, reference = [], isReference = false) {
  let room = roomNumber(lesson.room), teacher = lesson.teacher || '';
  const person = nameKey(teacher);
  // Owner-confirmed recurring defaults; other explicitly supplied rooms remain real changes.
  if (weekday === 2 && /^(?:ржонсницкая|ржонсицкая)\s+юлия\s+борисовна$/u.test(person) && (room === '2304' || (isReference && room === '2337'))) room = '2307';
  if (isReference && /^влад\s+сергей(?:\s|$)/u.test(person) && room === '2311') room = '2134';
  if (isMatanPractice(lesson)) {
    const teachers = new Set(reference.filter(isMatanPractice).map((item) => typeof item.teacher === 'string' ? item.teacher.trim() : '').filter(Boolean));
    if (teachers.size === 1) teacher = [...teachers][0];
  }
  return { ...lesson, room, teacher };
}
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function lessonChanges(before, after) {
  const changes = [];
  if (roomNumber(before.room) !== roomNumber(after.room) || buildingKey(before.location) !== buildingKey(after.location)) changes.push('room');
  if (before.start !== after.start || before.end !== after.end) changes.push('time');
  if (teacherKey(before.teacher) !== teacherKey(after.teacher)) changes.push('teacher');
  if (before.kind !== after.kind) changes.push('type');
  return changes;
}

/** Conservative one-to-one matching: repeated labs at different times are never paired by subject alone. */
export function diffTimetableDay(baseline, actual, date, removed = []) {
  const weekday = weekdayOf(date);
  const normalize = (lesson, reference = false) => normalizeTimetableLesson(lesson, weekday, baseline, reference);
  actual = actual.map((lesson) => ({ ...normalize(lesson), ...(lesson.previous ? {
    previous: normalizeTimetableLesson(lesson.previous, weekdayOf(lesson.previous.date || date), baseline),
  } : {}) }));
  removed = removed.map((lesson) => normalize(lesson));
  baseline = baseline.map((lesson) => normalize(lesson, true));
  // The group JSON omits this owner-confirmed recurring Saturday slot.
  // Compare it with its usual details, so real room changes still stand out.
  if (weekday === 6 && actual.some((lesson) => (lesson.subjectId === 'dm' || nameKey(lesson.subject) === 'дискретная математика')
    && lesson.start === '17:10' && ['practice', 'lab', 'consultation'].includes(lesson.kind))
    && !baseline.some((lesson) => (lesson.subjectId === 'dm' || nameKey(lesson.subject) === 'дискретная математика') && lesson.start === '17:10')) {
    baseline.push({ id: 'default-saturday-dm', subjectId: 'dm', subject: 'Дискретная математика', start: '17:10', end: '18:40',
      room: '2407', location: 'Кронверкский пр., д.49, лит.А', teacher: 'Кулешова Екатерина Дмитриевна', kind: 'practice' });
  }
  const old = baseline.filter((lesson) => !lesson.break), unmatched = new Set(old), matches = new Map(), left = new Set(actual);
  const sameSubject = (a, b) => a.subjectId && b.subjectId ? a.subjectId === b.subjectId : nameKey(a.subject) === nameKey(b.subject);
  for (const predicate of [
    (a, b) => a.id === b.id && sameSubject(a, b),
    (a, b) => sameSubject(a, b) && a.start === b.start && a.end === b.end,
    (a, b) => sameSubject(a, b) && b.previous?.date === date && a.start === b.previous.start && a.end === b.previous.end,
    (a, b) => sameSubject(a, b) && (a.kind === b.kind || [a.kind, b.kind].every((kind) => kind === 'practice' || kind === 'lab')),
  ]) {
    for (const lesson of left) {
      const candidates = [...unmatched].filter((before) => predicate(before, lesson));
      if (candidates.length !== 1 || [...left].filter((other) => predicate(candidates[0], other)).length !== 1) continue;
      matches.set(lesson, candidates[0]); unmatched.delete(candidates[0]); left.delete(lesson);
    }
  }
  const rows = actual.map((lesson) => {
    const before = matches.get(lesson), previous = lesson.previous || before;
    // The original cycle used generic practice labels for labs. API type enrichment is the default,
    // while a later change between two official snapshots remains a genuine change.
    const changes = previous ? lessonChanges(previous, lesson).filter((kind) => lesson.previous || kind !== 'type') : [];
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
    if (roomNumber(previous?.room) !== roomNumber(row.lesson.room)) messages.push(`Аудитория изменена: ${row.lesson.room || 'уточняется'}${previous?.room ? ` (было ${previous.room})` : ''}`);
    if (buildingKey(previous?.location) !== buildingKey(row.lesson.location)) messages.push(`Корпус изменён: ${row.lesson.location || 'уточняется'}${previous?.location ? ` (было ${previous.location})` : ''}`);
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
