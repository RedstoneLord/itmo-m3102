import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const schedule = html.split('const SCHED_ANCHOR_MONDAY=')[1].split('const WEEKDAYS_SHORT=')[0];
const planner = html.split('const PLAN_KEY=')[1].split('function renderPlan(){')[0];
const storage = new Map();
const localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const code = `const SCHED_ANCHOR_MONDAY=${schedule}const PLAN_KEY=${planner};({weekParity,readPlan})`;
const { weekParity, readPlan } = vm.runInNewContext(code, { Date, localStorage });

assert.equal(weekParity(new Date(2026, 8, 21)), 'even');
assert.equal(weekParity(new Date(2026, 8, 28)), 'odd');
storage.set('m3102-study-plan-v1', '{broken');
assert.deepEqual(JSON.parse(JSON.stringify(readPlan())), { tasks: [], done: {} });
storage.set('m3102-study-plan-v1', JSON.stringify({ tasks: [{ id: 'a', name: 'Задача' }], done: { a: true } }));
assert.equal(readPlan().done.a, true);
console.log('Smoke checks passed');
