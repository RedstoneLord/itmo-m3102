import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveRowsOn } from './live-schedule.js';
import { dateRange, importPersonalTimetable } from './live-timetable.js';

test('classic editor drafts and exports retain only the original lesson schema, while UI sees change metadata', () => {
  const from = '2026-11-15', to = '2026-11-21', day = '2026-11-18';
  const snapshot = importPersonalTimetable([{code:0, data:dateRange(from,to).map(date=>({date,lessons:date===day?[{
    pair_id:1,subject:'Дискретная математика',group:'ДМ 1.2(M3102)',work_type_id:2,time_start:'13:30',time_end:'15:00',room:'1330',
  }]:[]}))}],from,to,'2026-11-15T09:00:00Z');
  const [row] = liveRowsOn(day,[{id:'cycle-1',subject:'Дискретная математика',kind:'lab',start:'13:30',end:'15:00',room:'2240'}],snapshot);
  assert.match(row.sourceChange,/1330.*2240/);
  assert.equal(row.previousRoom,'2240');
  const draft = structuredClone(row);
  assert.deepEqual(Object.keys(draft).sort(),['id','start','end','subject','kind','room','teacher','location','break'].sort());
  assert.equal(draft.sourceChange,undefined);
  assert.equal(draft.calendarDate,undefined);
  assert.equal(draft.subjectId,undefined);
  assert.equal(JSON.stringify(row),JSON.stringify(draft));
});
