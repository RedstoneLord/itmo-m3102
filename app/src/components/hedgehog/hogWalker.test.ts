import { expect, it } from 'vitest';
import { HOG_W, startWalker, stepWalker, THING_HALF, type Thing, type ThingKind } from './hogWalker';

/** Повторяемый «случай» для теста */
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const DT = 1 / 60;
const WIDTH = 900;

const thing = (id: number, kind: ThingKind, x: number): Thing => ({ id, kind, x, grow: 1, age: 0, gone: false });

it('идёт с первых кадров, а не стоит', () => {
  const random = seeded(7);
  const w = startWalker(WIDTH, random);
  const x0 = w.x;
  for (let i = 0; i < 60; i++) stepWalker(w, DT, WIDTH, random);
  expect(w.mode).toBe('walk');
  expect(Math.abs(w.x - x0)).toBeGreaterThan(45);
});

it('через камень и бревно перепрыгивает всем телом: пока он над препятствием — он в воздухе', () => {
  for (const kind of ['rock', 'log', 'snail'] as ThingKind[]) {
    const random = seeded(3);
    const w = startWalker(WIDTH, random);
    Object.assign(w, { x: 100, dir: 1, speed: 120, target: 120, spawnIn: 99, paceIn: 99 });
    w.things = [thing(1, kind, 420)];
    let jumped = false;
    for (let i = 0; i < 300; i++) {
      const pose = stepWalker(w, DT, WIDTH, random);
      const overlap = w.x + HOG_W * 0.15 < 420 + THING_HALF[kind] && w.x + HOG_W * 0.85 > 420 - THING_HALF[kind];
      if (overlap) expect(pose.lift, `${kind} на ${i}-м кадре`).toBeGreaterThan(3);
      if (pose.lift > 10) jumped = true;
    }
    expect(jumped).toBe(true);
    expect(w.x).toBeGreaterThan(420 + THING_HALF[kind]);
  }
});

it('яблоко съедает: останавливается, яблоко исчезает, идёт дальше', () => {
  const random = seeded(11);
  const w = startWalker(WIDTH, random);
  Object.assign(w, { x: 100, dir: 1, speed: 120, target: 120, spawnIn: 99, paceIn: 99 });
  w.things = [thing(1, 'apple', 300)];
  let ate = false;
  for (let i = 0; i < 400; i++) {
    stepWalker(w, DT, WIDTH, random);
    if (w.mode === 'eat') ate = true;
  }
  expect(ate).toBe(true);
  expect(w.things.find((item) => item.id === 1)).toBeUndefined();
  expect(w.mode).toBe('walk');
});

it('живёт долго: не выходит за дорожку, разворачивается у краёв, почти всё время идёт', () => {
  const random = seeded(42);
  const w = startWalker(WIDTH, random);
  let turns = 0;
  let moving = 0;
  let dir = w.dir;
  const frames = 60 * 90;
  for (let i = 0; i < frames; i++) {
    stepWalker(w, DT, WIDTH, random);
    expect(w.x).toBeGreaterThanOrEqual(0);
    expect(w.x).toBeLessThanOrEqual(WIDTH - HOG_W);
    if (w.dir !== dir) (turns++, (dir = w.dir));
    if (w.mode === 'walk' || w.mode === 'jump') moving++;
  }
  expect(turns).toBeGreaterThan(3);
  expect(moving / frames).toBeGreaterThan(0.75);
});
