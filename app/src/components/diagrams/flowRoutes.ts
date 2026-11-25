import type { GraphModel } from './graphLayout';

type Point = [number, number];

interface Box {
  id: string;
  shape: string;
  x: number;
  y: number;
  w: number;
  h: number;
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface FlowRoute {
  d: string;
  pts: Point[];
}

type Side = 'top' | 'bottom' | 'left' | 'right';

interface Port {
  box: Box;
  side: Side;
  offset: number;
}

const outward: Record<Side, Point> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
const clearance = 5;
const add = ([x, y]: Point, [dx, dy]: Point, by: number): Point => [x + by * dx, y + by * dy];

const f = (n: number) => String(Math.round(n * 10) / 10);

const dense = (pts: Point[], step = 6): Point[] => {
  const out: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let j = 1; j <= k; j++) out.push([x0 + ((x1 - x0) * j) / k, y0 + ((y1 - y0) * j) / k]);
  }
  return out;
};

const bezier = (p0: Point, p1: Point, p2: Point, p3: Point, n = 32): Point[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    const at = (k: 0 | 1) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k];
    return [at(0), at(1)] as Point;
  });

/** Ломаная со скруглёнными углами: углы — квадратичные кривые, последний отрезок прямой под наконечник */
function rounded(raw: Point[], r = 14): FlowRoute {
  const unique = raw.filter((p, i) => !i || Math.hypot(p[0] - raw[i - 1]![0], p[1] - raw[i - 1]![1]) > 0.5);
  const q = unique.filter((p, i, all) => {
    if (!i || i === all.length - 1) return true;
    const [px, py] = all[i - 1]!;
    const [nx, ny] = all[i + 1]!;
    const [ax, ay] = [p[0] - px, p[1] - py];
    const [bx, by] = [nx - p[0], ny - p[1]];
    return Math.abs(ax * by - ay * bx) > 0.5 || ax * bx + ay * by < 0;
  });
  const pts = [q[0]!];
  let d = `M${f(q[0]![0])} ${f(q[0]![1])}`;
  for (let i = 1; i < q.length - 1; i++) {
    const [px, py] = q[i - 1]!;
    const [x, y] = q[i]!;
    const [nx, ny] = q[i + 1]!;
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const start: Point = [x + ((px - x) / l1) * k, y + ((py - y) / l1) * k];
    const end: Point = [x + ((nx - x) / l2) * k, y + ((ny - y) / l2) * k];
    d += `L${f(start[0])} ${f(start[1])}Q${f(x)} ${f(y)} ${f(end[0])} ${f(end[1])}`;
    pts.push(...bezier(start, add(start, [x - start[0], y - start[1]], 2 / 3), add(end, [x - end[0], y - end[1]], 2 / 3), end, 6));
  }
  const last = q[q.length - 1]!;
  return { d: `${d}L${f(last[0])} ${f(last[1])}`, pts: dense([...pts, last], 4) };
}

function curve([p0, p1, p2, p3]: [Point, Point, Point, Point]): FlowRoute {
  const dx = p3[0] - p2[0];
  const dy = p3[1] - p2[1];
  const length = Math.hypot(dx, dy);
  const lead = Math.min(10, length / 2);
  const entry: Point = length ? [p3[0] - (dx / length) * lead, p3[1] - (dy / length) * lead] : p3;
  return {
    d: `M${f(p0[0])} ${f(p0[1])}C${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])} ${f(entry[0])} ${f(entry[1])}L${f(p3[0])} ${f(p3[1])}`,
    pts: dense([...bezier(p0, p1, p2, entry), p3], 4),
  };
}

/** A face coordinate shared by incoming and outgoing edges. */
function portPoint({ box, side, offset }: Port, outside = false): Point {
  const vertical = outward[side][0] === 0;
  const radius = (vertical ? box.h : box.w) / 2;
  const span = (vertical ? box.w : box.h) / 2;
  const center: Point = vertical ? [box.x + offset, box.y] : [box.x, box.y + offset];
  if (outside) return add(center, outward[side], radius + clearance);
  const ratio = Math.abs(offset) / span;
  let extent = radius;
  if (box.shape === 'diamond') extent *= 1 - ratio;
  if (box.shape === 'circle') extent *= Math.sqrt(1 - ratio ** 2);
  if (box.shape === 'round') {
    const corner = Math.min(box.h, box.w) / 2;
    const inset = Math.max(0, Math.abs(offset) - (span - corner));
    extent -= corner - Math.sqrt(corner ** 2 - inset ** 2);
  }
  // The rounded top and bottom of a database symbol match its drawn ellipse.
  if (box.shape === 'db' && vertical) extent -= 6 * (1 - Math.sqrt(1 - ratio ** 2));
  return add(center, outward[side], extent);
}

function chooseSides(a: Box, b: Box): [Side, Side] {
  if (a === b) return ['right', 'top'];
  if (b.t >= a.b + 12) return ['bottom', 'top'];
  if (a.t >= b.b + 12) return ['top', 'bottom'];
  return a.x <= b.x ? ['right', 'left'] : ['left', 'right'];
}

/** Test the complete segment rather than just the points used to draw it. */
function blocked(a: Point, b: Point, box: Box, padding: number) {
  const ranges: [number, number][] = [
    [box.l - padding, box.r + padding],
    [box.t - padding, box.b + padding],
  ];
  let low = 0;
  let high = 1;
  for (const axis of [0, 1] as const) {
    const [min, max] = ranges[axis]!;
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] <= min || a[axis] >= max) return false;
    } else {
      const t0 = (min - a[axis]) / delta;
      const t1 = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(t0, t1));
      high = Math.min(high, Math.max(t0, t1));
    }
  }
  return low < high;
}

/** Search the grid formed by the ports and the clearance lines around the blocks. */
function detour(start: Point, finish: Point, boxes: Box[], previous: Point[][]): Point[] | undefined {
  const xs = [...new Set([start[0], finish[0], ...boxes.flatMap(({ l, r }) => [l - clearance, r + clearance])])].sort((a, b) => a - b);
  const ys = [...new Set([start[1], finish[1], ...boxes.flatMap(({ t, b }) => [t - clearance, b + clearance])])].sort((a, b) => a - b);
  type State = { x: number; y: number; axis: number; cost: number; estimate: number; parent?: State };
  const first: State = { x: xs.indexOf(start[0]), y: ys.indexOf(start[1]), axis: -1, cost: 0, estimate: 0 };
  const queue = [first];
  const distances = new Map<number, number>();
  const point = (state: State): Point => [xs[state.x]!, ys[state.y]!];
  const id = (state: State) => (state.y * xs.length + state.x) * 3 + state.axis + 1;
  const distance = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const useCost = (a: Point, b: Point, axis: 0 | 1) => {
    const across = axis === 0 ? 1 : 0;
    return previous.some((route) =>
      route.some((from, i) => {
        const to = route[i + 1];
        return (
          to &&
          from[across] === a[across] &&
          to[across] === a[across] &&
          Math.min(Math.max(from[axis], to[axis]), Math.max(a[axis], b[axis])) > Math.max(Math.min(from[axis], to[axis]), Math.min(a[axis], b[axis]))
        );
      }),
    )
      ? distance(a, b) * 2
      : 0;
  };
  while (queue.length) {
    queue.sort((a, b) => b.estimate - a.estimate);
    const current = queue.pop()!;
    if (current.cost > (distances.get(id(current)) ?? Infinity)) continue;
    const here = point(current);
    if (distance(here, finish) === 0) {
      const result: Point[] = [];
      for (let step: State | undefined = current; step; step = step.parent) result.push(point(step));
      return result.reverse();
    }
    for (const [dx, dy, axis] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 1],
      [0, -1, 1],
    ] as const) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || x >= xs.length || y < 0 || y >= ys.length) continue;
      const next: Point = [xs[x]!, ys[y]!];
      if (boxes.some((box) => blocked(here, next, box, clearance))) continue;
      const cost = current.cost + distance(here, next) + (current.axis === -1 || current.axis === axis ? 0 : 12) + useCost(here, next, axis);
      const state: State = { x, y, axis, cost, estimate: cost + distance(next, finish), parent: current };
      if (cost >= (distances.get(id(state)) ?? Infinity)) continue;
      distances.set(id(state), cost);
      queue.push(state);
    }
  }
  return undefined;
}

export function routeFlow(
  model: Pick<GraphModel, 'nodes' | 'edges'>,
  labelSize: (text: string) => [number, number],
): { routes: FlowRoute[]; labels: (Point | null)[] } {
  const boxes = model.nodes.map(({ id, shape, w, h, x = 0, y = 0 }) => ({
    id,
    shape,
    w,
    h,
    x,
    y,
    l: x - w / 2,
    r: x + w / 2,
    t: y - h / 2,
    b: y + h / 2,
  }));
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const groups = new Map<Box, Map<Side, { port: Port; preferred: number }[]>>();
  const port = (box: Box, side: Side, other: Box): Port => {
    const connection = { box, side, offset: 0 };
    const horizontal = outward[side][0] !== 0;
    const named = groups.get(box) ?? new Map();
    const group = named.get(side) ?? [];
    group.push({ port: connection, preferred: horizontal ? other.y - box.y : other.x - box.x });
    named.set(side, group);
    groups.set(box, named);
    return connection;
  };
  const edges = model.edges.map(({ from, to }) => {
    const a = byId.get(from)!;
    const b = byId.get(to)!;
    const [out, into] = chooseSides(a, b);
    return [port(a, out, b), port(b, into, a)] as const;
  });
  for (const named of groups.values()) {
    for (const group of named.values()) {
      const { box, side } = group[0]!.port;
      const radius = (outward[side][0] ? box.h : box.w) / 2;
      const span = Math.max(0, radius - 8);
      const step = Math.min(14, (2 * span) / Math.max(1, group.length - 1));
      group.sort((a, b) => a.preferred - b.preferred);
      // Keep space for later ports while staying as close as possible to the preferred position.
      group.forEach(({ port, preferred }, i) => {
        const min = i === 0 ? -span : group[i - 1]!.port.offset + step;
        const max = span - (group.length - 1 - i) * step;
        port.offset = group.length === 1 && (box.shape === 'diamond' || box.shape === 'circle') ? 0 : Math.min(max, Math.max(min, preferred));
      });
    }
  }

  const detours: Point[][] = [];
  const routes = edges.map(([a, b]) => {
    const from = portPoint(a);
    const into = add(portPoint(b), outward[b.side], 1);
    const axis = outward[a.side][0] ? 0 : 1;
    const gap = (into[axis] - from[axis]) * outward[a.side][axis];
    const lead = Math.min(32, gap * 0.42);
    if (a.box !== b.box && gap >= 11) {
      const smooth = curve([from, add(from, outward[a.side], lead), add(into, outward[b.side], lead), into]);
      const obstacles = boxes.filter((box) => box !== a.box && box !== b.box);
      if (!obstacles.some((box) => smooth.pts.some((point, i, points) => i > 0 && blocked(points[i - 1]!, point, box, clearance)))) return smooth;
    }
    const start = portPoint(a, true);
    const finish = portPoint(b, true);
    const path = detour(start, finish, boxes, detours);
    if (path) {
      detours.push(path);
      return rounded([from, ...path, into], 10);
    }
    return rounded([from, start, finish, into], 6);
  });
  return { routes, labels: placeEdgeLabels(model, routes, labelSize, 0.26) };
}

export function placeEdgeLabels(
  model: Pick<GraphModel, 'nodes' | 'edges'>,
  routes: FlowRoute[],
  labelSize: (text: string) => [number, number],
  anchor = 0.5,
): (Point | null)[] {
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const placed: Rect[] = [];
  const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 + 2 && a.x1 > b.x0 - 2 && a.y0 < b.y1 + 2 && a.y1 > b.y0 - 2;
  const nodeBounds = model.nodes.map(({ x, y, w, h }) => ({ x0: x! - w / 2, x1: x! + w / 2, y0: y! - h / 2, y1: y! + h / 2 }));
  const routeBounds = routes.map(({ pts }) =>
    pts.reduce((rect, [x, y]) => ({ x0: Math.min(rect.x0, x), y0: Math.min(rect.y0, y), x1: Math.max(rect.x1, x), y1: Math.max(rect.y1, y) }), {
      x0: Infinity,
      y0: Infinity,
      x1: -Infinity,
      y1: -Infinity,
    }),
  );
  return model.edges.map((edge, index): Point | null => {
    const text = edge.label?.trim();
    if (!text) return null;
    const [lw, lh] = labelSize(text);
    const pts = routes[index]!.pts;
    const cumulative = [0];
    for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    const total = cumulative[cumulative.length - 1]!;
    const preferred = Math.min(total * anchor, anchor === 0.5 ? Infinity : 120);
    const wanted = [...new Set([preferred, ...[0.15, 0.25, 0.36, 0.5, 0.65, 0.78, 0.88].map((ratio) => ratio * total)])];
    const labelRect = (cx: number, cy: number) => ({ x0: cx - lw / 2, y0: cy - lh / 2, x1: cx + lw / 2, y1: cy + lh / 2 });
    let best: { score: number; cx: number; cy: number } | null = null;
    for (const s of wanted) {
      const i = Math.max(
        0,
        cumulative.findIndex((c) => c >= s),
      );
      const [px, py] = pts[i]!;
      const before = pts[Math.max(0, i - 1)]!;
      const after = pts[Math.min(pts.length - 1, i + 1)]!;
      const tx = after[0] - before[0];
      const ty = after[1] - before[1];
      const length = Math.hypot(tx, ty) || 1;
      // Направления от точки линии: поперёк неё (как раньше) и, запасом, влево/вправо/вверх/вниз — у диагонали между тесными
      // блоками оба «поперёк» упираются в блоки, а сбоку от линии место есть. Вплотную, потом дальше — штраф за каждый шаг
      const directions = [
        [-ty / length, tx / length, 0],
        [ty / length, -tx / length, 0.2],
        [-1, 0, 4],
        [1, 0, 4],
        [0, -1, 4],
        [0, 1, 4],
      ] as const;
      for (const [nx, ny, extra] of directions)
        for (const away of [0, 14, 30, 48, 70]) {
          const offset = (Math.abs(nx) * lw) / 2 + (Math.abs(ny) * lh) / 2 + 5 + away;
          const cx = px + nx * offset;
          const cy = py + ny * offset;
          const rect = labelRect(cx, cy);
          let score = Math.abs(s - preferred) * 0.35 + extra + away * 2.4;
          if (best && score >= best.score) continue;
          if (nodeBounds.some((box) => overlaps(rect, box)) || placed.some((box) => overlaps(rect, box))) continue;
          for (let i = 0; i < routes.length; i++) {
            if (!overlaps(rect, routeBounds[i]!)) continue;
            if (routes[i]!.pts.some(([x, y]) => x > rect.x0 - 2 && x < rect.x1 + 2 && y > rect.y0 - 2 && y < rect.y1 + 2)) {
              score += i === index ? 140 : 160;
            }
          }
          if (!best || score < best.score) best = { score, cx, cy };
        }
    }
    if (!best) {
      // Crowded layouts can use the nearest free margin instead of hiding a label behind a block or another label.
      const [x, y] =
        pts[
          Math.max(
            0,
            cumulative.findIndex((length) => length >= preferred),
          )
        ]!;
      const occupied = [...nodeBounds, ...routeBounds, ...placed];
      const candidates: Point[] = [
        [Math.min(...occupied.map((box) => box.x0)) - lw / 2 - 5, y],
        [Math.max(...occupied.map((box) => box.x1)) + lw / 2 + 5, y],
        [x, Math.min(...occupied.map((box) => box.y0)) - lh / 2 - 5],
        [x, Math.max(...occupied.map((box) => box.y1)) + lh / 2 + 5],
      ];
      const [cx, cy] = candidates.reduce((a, b) => (Math.hypot(a[0] - x, a[1] - y) <= Math.hypot(b[0] - x, b[1] - y) ? a : b));
      best = { score: 0, cx, cy };
    }
    placed.push(labelRect(best.cx, best.cy));
    return [best.cx, best.cy];
  });
}
