import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthDates,subjectColorId} from './timetable-model.js';
test('календарный лист: понедельник, полные недели и соседние месяцы',()=>{
 const days=monthDates(new Date(2026,10,14));
 assert.equal(days.length,42);assert.equal(days[0].getDay(),1);assert.equal(days.at(-1).getDay(),0);
 assert.equal(days[0].getMonth(),9);assert.equal(days.at(-1).getMonth(),11);
 assert.equal(days.filter(d=>d.getMonth()===10).length,30);
});
test('февраль високосного года и декабрьский переход',()=>{
 assert.equal(monthDates(new Date(2028,1,1)).filter(d=>d.getMonth()===1).length,29);
 const last=monthDates(new Date(2026,11,1)).at(-1);assert.equal(last.getFullYear(),2027);
});
test('цвет предмета устойчив к отображению папок и регистру',()=>{
 assert.equal(subjectColorId('Дискретная_математика'),subjectColorId('дискретная математика'));
 assert.notEqual(subjectColorId('Дискретная математика'),subjectColorId('Основы программирования'));
});
test('сокращение ИСРПО и полное название имеют один цвет',()=>{
 assert.equal(subjectColorId('ИСРПО'),subjectColorId('Инструментальные средства разработки ПО'));
 assert.equal(new Set(['Алгоритмы и структуры данных','Дискретная математика','ИСРПО','Линейная Алгебра','Математический анализ','Основы программирования'].map(subjectColorId)).size,6);
});
