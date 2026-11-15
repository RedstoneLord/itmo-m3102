/**
 * Ёжик на главной как маленький житель дорожки (GameHogLane): идёт сразу и почти не стоит, темп меняется плавно (шаг, бег,
 * крадётся), на пути изредка появляются вещи из игры — через камень, бревно и улитку он перепрыгивает, яблоко, ягоду и гриб
 * съедает, цветок нюхает. У края — притормозил и развернулся с подскоком. Владелец: «максимально живым, интересным и
 * реалистичным», прежние случайные трюки на постоянной скорости выглядели «пластмассово». Чистые функции — проверяются тестом.
 */

/** Радиус рисунка ёжика, px (как у drawHog в GameHogLane) */
export const HOG_R = 20;
/** Ширина рисунка ёжика, px */
export const HOG_W = HOG_R * 3.4;

export type ThingKind = 'rock' | 'log' | 'snail' | 'apple' | 'berry' | 'mush' | 'flower';
export const OBSTACLES: ThingKind[] = ['rock', 'log', 'snail'];
/** Полуширина вещи на дорожке, px (в масштабе ёжика) */
export const THING_HALF: Record<ThingKind, number> = { rock: 18, log: 28, snail: 16, apple: 10, berry: 7, mush: 10, flower: 8 };
/** Высота прыжка через препятствие, px */
const JUMP_HEIGHT: Partial<Record<ThingKind, number>> = { rock: 30, log: 28, snail: 24 };
/** Путь за прыжок в долях «скорость × секунда»: присед 0,08×0,5 + полёт 0,45 + приземление 0,1×0,6 */
const JUMP_TRAVEL = 0.08 * 0.5 + 0.45 + 0.1 * 0.6;
const THING_WEIGHT: Record<ThingKind, number> = { rock: 3, log: 2, snail: 1.5, apple: 2.5, berry: 2, mush: 1.2, flower: 1.5 };

export interface Thing {
  id: number;
  kind: ThingKind;
  /** Середина вещи на дорожке, px */
  x: number;
  /** 0 → 1 — появляется, 1 → 0 — исчезает (съели или долго лежит) */
  grow: number;
  /** Секунды на дорожке */
  age: number;
  /** Съедена — тает */
  gone: boolean;
}

type Mode = 'walk' | 'jump' | 'eat' | 'sniff' | 'turn' | 'pause';

export interface Walker {
  /** Левый край ёжика, px */
  x: number;
  dir: 1 | -1;
  speed: number;
  /** К какой скорости стремится сейчас (шаг, бег, крадётся) */
  target: number;
  /** Через сколько секунд сменить темп */
  paceIn: number;
  mode: Mode;
  /** Секунды в нынешнем режиме */
  t: number;
  /** Пройденный путь — от него фаза лап */
  path: number;
  things: Thing[];
  spawnIn: number;
  nextId: number;
  /** Вещь, через которую прыгает или которую ест */
  focus: number | null;
  /** Скорость прыжка: такая, чтобы всем телом перелететь препятствие */
  jumpSpeed: number;
}

export interface Pose {
  lift: number;
  /** Поворот корпуса, рад: наклон при разгоне и торможении, нюханье, сальто */
  turn: number;
  curl: number;
  roll: number;
  run: number;
  leg: number;
  sx: number;
  sy: number;
  /** 1 — смотрит по направлению движения, −1 — назад */
  face: number;
}

/** Темпы ходьбы, px/с: чаще всего обычный шаг */
const PACES = [
  { speed: 120, weight: 5 },
  { speed: 190, weight: 3 },
  { speed: 70, weight: 1.5 },
];

const pick = <T>(items: T[], weight: (item: T) => number, random: () => number): T => {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let r = random() * total;
  return items.find((item) => (r -= weight(item)) < 0) ?? items[0]!;
};

/** Начало: в случайном месте дорожки, уже идёт (а не стоит и раскачивается) */
export function startWalker(width: number, random = Math.random): Walker {
  return {
    x: random() * Math.max(0, width - HOG_W),
    dir: random() < 0.5 ? 1 : -1,
    speed: 110,
    target: 120,
    paceIn: 2 + random() * 3,
    mode: 'walk',
    t: 0,
    path: 0,
    things: [],
    spawnIn: 1.2 + random() * 1.5,
    nextId: 1,
    focus: null,
    jumpSpeed: 0,
  };
}

/** Нос ёжика по направлению движения */
export const noseX = (w: Walker) => w.x + (w.dir > 0 ? HOG_W * 0.92 : HOG_W * 0.08);
/** Середина ёжика */
const midX = (w: Walker) => w.x + HOG_W / 2;

/** Вещь впереди, к которой он идёт (ближайшая по направлению, ещё не съеденная) */
function ahead(w: Walker): Thing | null {
  let best: Thing | null = null;
  for (const thing of w.things) {
    if (thing.gone || thing.grow < 0.6) continue;
    const gap = (thing.x - midX(w)) * w.dir;
    if (gap > 0 && (!best || gap < (best.x - midX(w)) * w.dir)) best = thing;
  }
  return best;
}

/** Новая вещь впереди по пути: не у самого ёжика, не у края, не вплотную к другой */
function spawn(w: Walker, width: number, random: () => number) {
  if (w.things.filter((thing) => !thing.gone).length >= 3) return;
  const kind = pick(Object.keys(THING_WEIGHT) as ThingKind[], (item) => THING_WEIGHT[item], random);
  const x = midX(w) + w.dir * (150 + random() * 220);
  const half = THING_HALF[kind];
  if (x - half < 20 || x + half > width - 20) return;
  if (w.things.some((thing) => Math.abs(thing.x - x) < THING_HALF[thing.kind] + half + 60)) return;
  w.things.push({ id: w.nextId++, kind, x, grow: 0, age: 0, gone: false });
}

const STILL: Pose = { lift: 0, turn: 0, curl: 0, roll: 0, run: 0, leg: 0, sx: 1, sy: 1, face: 1 };

/**
 * Один шаг жизни на dt секунд. Меняет walker на месте и возвращает позу для рисования. width — ширина дорожки, px.
 */
export function stepWalker(w: Walker, dt: number, width: number, random = Math.random): Pose {
  const span = Math.max(0, width - HOG_W);
  w.t += dt;

  // Вещи: появляются, тают съеденные, давно лежащие и оставшиеся позади — тоже
  for (const thing of w.things) {
    thing.age += dt;
    const behind = (thing.x - midX(w)) * w.dir < -HOG_W * 2;
    const fade = thing.gone || thing.age > 22 || (behind && thing.age > 8);
    thing.grow = fade ? Math.max(0, thing.grow - dt * 2.5) : Math.min(1, thing.grow + dt * 3);
  }
  w.things = w.things.filter((thing) => thing.grow > 0 || !(thing.gone || thing.age > 1));
  w.spawnIn -= dt;
  if (w.spawnIn <= 0) {
    spawn(w, width, random);
    w.spawnIn = 2.5 + random() * 3.5;
  }

  const prev = w.speed;
  const legs = () => -w.path / (HOG_R * 1.5);
  // Наклон: разгоняется — носом вперёд, тормозит — назад
  const lean = (accel: number) => Math.max(-0.12, Math.min(0.12, accel * 0.0006));
  const move = (dx: number) => {
    const before = w.x;
    w.x = Math.max(0, Math.min(span, w.x + w.dir * dx));
    w.path += Math.abs(w.x - before);
  };

  switch (w.mode) {
    case 'walk': {
      w.paceIn -= dt;
      if (w.paceIn <= 0) {
        w.target = pick(PACES, (pace) => pace.weight, random).speed;
        w.paceIn = 2 + random() * 4;
        // Изредка коротко замирает и оглядывается — но ненадолго
        if (random() < 0.12) {
          w.mode = 'pause';
          w.t = 0;
        }
      }
      const room = w.dir > 0 ? span - w.x : w.x;
      const next = ahead(w);
      const gap = next ? Math.abs(next.x - noseX(w)) - THING_HALF[next.kind] : Infinity;
      // Перед краем, едой и цветком — тормозит заранее, у препятствия — держит скорость для прыжка
      let goal = w.target;
      if (room < 70) goal = Math.min(goal, 40 + room);
      if (next && !OBSTACLES.includes(next.kind) && gap < 60) goal = Math.min(goal, 30 + gap * 1.5);
      if (next && OBSTACLES.includes(next.kind)) goal = Math.max(goal, gap < 120 ? 150 : goal);
      w.speed += (goal - w.speed) * Math.min(1, dt * 3);
      move(w.speed * dt);
      const accel = (w.speed - prev) / Math.max(dt, 1e-3);

      if (room < 6) {
        w.mode = 'turn';
        w.t = 0;
      } else if (next && OBSTACLES.includes(next.kind) && gap < 26) {
        w.mode = 'jump';
        w.t = 0;
        w.focus = next.id;
        // Перелететь всем телом: до препятствия + само препятствие + длина ёжика; за прыжок проходит 0,6 с полной скорости
        w.jumpSpeed = (gap + THING_HALF[next.kind] * 2 + HOG_W + 16) / JUMP_TRAVEL;
      } else if (next && !OBSTACLES.includes(next.kind) && gap < 4) {
        w.mode = next.kind === 'flower' ? 'sniff' : 'eat';
        w.t = 0;
        w.focus = next.id;
      }
      const beat = Math.abs(Math.sin(legs()));
      const brisk = Math.min(1, w.speed / 190);
      return {
        ...STILL,
        run: 0.25 + 0.45 * brisk,
        leg: legs(),
        lift: beat * (0.8 + 1.6 * brisk),
        turn: lean(accel),
        sx: 1 + 0.015 * (1 - beat) * brisk,
        sy: 1 - 0.02 * (1 - beat) * brisk,
      };
    }

    case 'jump': {
      // Присел (0,08 с) → полёт (0,45 с, скорость не теряет) → приземлился и спружинил (0,1 с)
      const thing = w.things.find((item) => item.id === w.focus);
      const height = JUMP_HEIGHT[thing?.kind ?? 'rock'] ?? 28;
      const speed = w.jumpSpeed || Math.max(w.speed, 170);
      if (w.t < 0.08) {
        move(speed * dt * 0.5);
        const s = w.t / 0.08;
        return { ...STILL, leg: legs(), run: 0.3, sx: 1 + 0.08 * s, sy: 1 - 0.12 * s, turn: 0.06 * s };
      }
      if (w.t < 0.53) {
        move(speed * dt);
        const a = (w.t - 0.08) / 0.45;
        const air = Math.sin(Math.PI * a);
        // В воздухе лапы поджаты, нос сначала вверх, потом вниз — к земле
        return { ...STILL, lift: air * height, leg: legs(), run: 0.1, sx: 1 - 0.04 * air, sy: 1 + 0.07 * air, turn: -0.18 * Math.cos(Math.PI * a) };
      }
      if (w.t < 0.63) {
        move(speed * dt * 0.6);
        const s = Math.sin(((w.t - 0.53) / 0.1) * Math.PI);
        return { ...STILL, leg: legs(), run: 0.3, sx: 1 + 0.1 * s, sy: 1 - 0.14 * s };
      }
      w.mode = 'walk';
      w.t = 0;
      w.focus = null;
      w.speed = Math.min(220, speed * 0.75);
      return { ...STILL, leg: legs(), run: 0.4 };
    }

    case 'eat': {
      // Ест 1,4 с: наклонился, жуёт (кивки), угощение тает; потом идёт дальше
      const thing = w.things.find((item) => item.id === w.focus);
      if (thing && w.t > 0.5) thing.gone = true;
      w.speed = 0;
      if (w.t > 1.4) {
        w.mode = 'walk';
        w.t = 0;
        w.focus = null;
        w.speed = 40;
      }
      const down = Math.min(1, w.t * 6, (1.4 - w.t) * 6);
      const chew = Math.max(0, Math.sin(w.t * 18)) * down;
      return { ...STILL, turn: 0.22 * down - 0.04 * chew, sy: 1 - 0.04 * chew, sx: 1 + 0.03 * chew };
    }

    case 'sniff': {
      // Нюхает цветок 1 с, цветок остаётся
      w.speed = 0;
      if (w.t > 1) {
        w.mode = 'walk';
        w.t = 0;
        w.focus = null;
        w.speed = 40;
        // Чтобы не нюхать тот же цветок снова — проходит мимо: он ему больше не «впереди»
        const flower = w.things.find((item) => item.kind === 'flower' && Math.abs(item.x - noseX(w)) < 20);
        if (flower) flower.age = Math.max(flower.age, 9);
        move(THING_HALF.flower * 2 + 6);
      }
      const down = Math.min(1, w.t * 5, (1 - w.t) * 5);
      return { ...STILL, turn: 0.12 * down + Math.sin(w.t * 26) * 0.03 * down };
    }

    case 'turn': {
      // Развернулся с подскоком: взгляд меняется в верхней точке, без «тонкого» кадра
      w.speed = 0;
      const f = Math.min(1, w.t / 0.32);
      if (f >= 1) {
        w.dir = w.dir > 0 ? -1 : 1;
        w.mode = 'walk';
        w.t = 0;
        w.speed = 50;
        return { ...STILL, run: 0.3 };
      }
      const air = Math.sin(Math.PI * f);
      return { ...STILL, lift: air * 10, face: f < 0.5 ? 1 : -1, sx: 1 - 0.04 * air, sy: 1 + 0.06 * air };
    }

    case 'pause': {
      // Короткая остановка 0,6–1 с: оглянулся и пошёл
      w.speed *= Math.max(0, 1 - dt * 8);
      const done = w.t > 0.9;
      if (done) {
        w.mode = 'walk';
        w.t = 0;
      }
      const look = w.t > 0.25 && w.t < 0.65 ? -1 : 1;
      return { ...STILL, face: look, sy: 1 + Math.sin(w.t * 6) * 0.01 };
    }
  }
}
