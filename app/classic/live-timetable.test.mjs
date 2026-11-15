import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateRange, diffTimetableDay, importPersonalTimetable, isIndividualLesson, parseLiveTimetable, timetableChangeText } from './live-timetable.js';

const FROM = '2026-11-15', TO = '2026-11-21', AT = '2026-11-15T09:00:00.000Z';
const lesson = (extra = {}) => ({ pair_id: 1, subject_id: 30, subject: 'Дискретная математика', work_type_id: 2,
  group: 'Дискр.Матем. 1.2(M3102)', time_start: '13:30', time_end: '15:00', room: '2240', building: 'Кронверкский', teacher_name: 'Преподаватель', ...extra });
const payload = (lessons = [lesson()]) => ({ code: 0, message: null, data: dateRange(FROM, TO).map((date, index) => ({ date, lessons: index === 3 ? lessons : [] })) });
const snapshot = (lessons) => importPersonalTimetable([payload(lessons)], FROM, TO, AT);
const base = (extra = {}) => ({ id: 'cycle-1', subjectId: 'dm', subject: 'Дискретная математика', start: '13:30', end: '15:00', room: '2240', location: 'Кронверкский', teacher: 'Преподаватель', kind: 'lab', ...extra });

test('filters actual C1 English, swimming, sports and room bookings; includes the reviewed consultation flow', () => {
  const value = snapshot([lesson(), lesson({ pair_id: 2, subject: 'English C1 / Английский язык C1', group: 'АЯ-C1/7' }),
    lesson({ pair_id: 3, subject: 'Плавание', group: 'Плавание', work_type_id: 11 }),
    lesson({ pair_id: 4, subject: null, flow_type_id: 5 }),
    lesson({ pair_id: 5, group: 'Дискр.Матем. 1.2.1(M3102)', work_type_id: 10 })]);
  assert.equal(value.days['2026-11-18'].length, 2);
  assert.equal(value.days['2026-11-18'][1].kind, 'consultation');
  assert.equal(isIndividualLesson({ subject: 'Транспортные системы' }), false);
  assert.equal(isIndividualLesson({ subject: 'Секция графа' }), false);
  for (const extra of [{ flow_type_id: '3' }, { flow_type_id: '5' }, { work_type_id: '11' }, { work_type_id: '131' }]) {
    assert.equal(isIndividualLesson({ subject: 'Индивидуальная запись', ...extra }), true);
  }
});
test('shared lectures may list several groups and use Cyrillic М; another group is not accepted', () => {
  assert.equal(snapshot([lesson({ group: 'ДМ 1(M3101,М3102,M3103)', work_type_id: 1 })]).days['2026-11-18'][0].kind, 'lecture');
  assert.throws(() => snapshot([lesson({ group: 'ДМ 1.3(M3103)' })]), /flow/);
  assert.throws(() => snapshot([lesson({ group: 'M31020' })]), /flow/);
});
test('unknown subjects, missing names and unrecognized work types cannot turn into cancellations', () => {
  for (const change of [{ subject: null }, { subject: 'Новый предмет' }, { work_type_id: 999 }]) assert.throws(() => snapshot([lesson(change)]));
});
test('mapping diagnostics show only plain course titles in confirmed group flows', () => {
  assert.throws(() => snapshot([lesson({ subject: 'Новый предмет' })]), /"Новый предмет"; M3102=true; work_type_id=2/);
  for (const extra of [{ subject: 'Необщий курс', group: 'other' }, { subject: 'https://private.invalid' }, { subject: 'eyJprivate.payload.signature' }]) {
    assert.throws(() => snapshot([lesson(extra)]), (error) => error.message.includes('[title withheld]') && !error.message.includes(extra.subject));
  }
});
test('includes the live-verified introductory-practice credit and reports all unknown courses without partial publication', () => {
  const value = snapshot([lesson({ subject: 'Учебная, ознакомительная', work_type_id: 9 })]);
  assert.equal(value.days['2026-11-18'][0].subjectId, 'intro-practice');
  assert.equal(value.days['2026-11-18'][0].subject, 'Учебная, ознакомительная');
  assert.equal(value.days['2026-11-18'][0].kind, 'credit');
  assert.throws(() => snapshot([lesson(), lesson({ subject: 'Первый новый курс' }), lesson({ subject: 'Второй новый курс' })]),
    (error) => error.message.includes('Первый новый курс') && error.message.includes('Второй новый курс'));
});
test('requires exact calendar coverage, API success, unique dates, times and pair identity', () => {
  const missing = payload(); missing.data.pop();
  const duplicate = payload(); duplicate.data[0] = duplicate.data[1];
  for (const raw of [missing, duplicate, { code: 2, data: payload().data }]) assert.throws(() => importPersonalTimetable([raw], FROM, TO, AT));
  for (const change of [{ time_start: '25:00' }, { time_end: '13:00' }, { pair_id: 0 }]) assert.throws(() => snapshot([lesson(change)]));
  assert.throws(() => snapshot([lesson(), lesson()]), /duplicate/);
  assert.throws(() => snapshot([]), /no shared/);
});
test('publishes an allowlist, dropping tokens, ISU, meeting credentials and free-text notes', () => {
  const value = snapshot([lesson({ access_token: 'secret-token', zoom_password: 'secret-password', zoom_url: 'https://private.invalid', note: 'secret-note', teacher_id: 12345 })]);
  const text = JSON.stringify(value);
  for (const secret of ['secret-token', 'secret-password', 'private.invalid', 'secret-note', 'teacher_id', '12345']) assert.equal(text.includes(secret), false);
  assert.equal(parseLiveTimetable({ ...value, access_token: 'secret-token' }).access_token, undefined);
});
test('classifies a room and building relocation without cancelling and adding the same lesson', () => {
  const value = snapshot([lesson({ room: '1330', building: 'Ломоносова' })]);
  const rows = diffTimetableDay([base()], value.days['2026-11-18'], '2026-11-18');
  assert.equal(rows.length, 1); assert.equal(rows[0].state, 'changed');
  assert.deepEqual(rows[0].changes, ['room']);
  assert.match(timetableChangeText(rows[0]), /1330.*2240/);
  assert.match(timetableChangeText(rows[0]), /Ломоносова/);
});
test('complete empty dates produce visible missing lessons, without claiming the instructor cancelled', () => {
  const value = snapshot();
  const rows = diffTimetableDay([base()], value.days[FROM], FROM);
  assert.equal(rows[0].state, 'cancelled');
  assert.equal(timetableChangeText(rows[0]), 'Нет в расписании My ITMO');
});
test('single time moves are matched; repeated labs with ambiguous times are not paired by subject', () => {
  const value = snapshot([lesson({ time_start: '17:10', time_end: '18:40' })]);
  assert.deepEqual(diffTimetableDay([base()], value.days['2026-11-18'], '2026-11-18')[0].changes, ['time']);
  const rows = diffTimetableDay([base(), base({ id: 'cycle-2', start: '15:30', end: '17:00' })], value.days['2026-11-18'], '2026-11-18');
  assert.equal(rows.filter((row) => row.state === 'cancelled').length, 2);
  assert.equal(rows.filter((row) => row.state === 'additional').length, 1);
});
test('retains real upstream room-change history across subsequent unchanged polls', () => {
  const before = snapshot();
  const moved = importPersonalTimetable([payload([lesson({ room: '1330' })])], FROM, TO, '2026-11-15T10:00:00Z', before);
  const again = importPersonalTimetable([payload([lesson({ room: '1330' })])], FROM, TO, '2026-11-15T11:00:00Z', moved);
  assert.equal(again.days['2026-11-18'][0].previous.room, '2240');
});
test('retains missing extra lessons as tombstones after a second poll; removes tombstones if they reappear', () => {
  const before = snapshot([lesson(), lesson({ pair_id: 2, time_start: '17:10', time_end: '18:40', work_type_id: 10 })]);
  const after = importPersonalTimetable([payload()], FROM, TO, AT, before);
  const again = importPersonalTimetable([payload()], FROM, TO, AT, after);
  assert.equal(again.removed['2026-11-18'][0].id, 'itmo-2');
  assert.equal(diffTimetableDay([base()], again.days['2026-11-18'], '2026-11-18', again.removed['2026-11-18']).filter((row) => row.state === 'cancelled').length, 1);
  const back = importPersonalTimetable([payload([lesson(), lesson({ pair_id: 2, time_start: '17:10', time_end: '18:40', work_type_id: 10 })])], FROM, TO, AT, again);
  assert.equal(back.removed['2026-11-18'], undefined);
});
test('recognizes a different-day move only through a unique stable upstream identity', () => {
  const before = snapshot(), moved = payload();
  moved.data[4].lessons = moved.data[3].lessons; moved.data[3].lessons = [];
  const value = importPersonalTimetable([moved], FROM, TO, AT, before);
  assert.equal(value.days['2026-11-19'][0].previous.date, '2026-11-18');
  assert.equal(value.removed['2026-11-18'][0].id, 'itmo-1');
});
