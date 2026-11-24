import { wrapText } from './parse';

export type NodeShape = 'circle' | 'box' | 'round' | 'diamond' | 'db' | 'note';

export interface GraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Центр узла; у узлов без @ координаты считает раскладка */
  x?: number;
  y?: number;
  lines: string[];
  w: number;
  h: number;
  /** `{color: red}` — обводка */
  color?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  directed: boolean;
  color?: string;
  dashed?: boolean;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: string;
  directed: boolean;
  /** Блок-схема (`diagram`): стрелки обходят блоки по дорожкам (flowRoutes.ts), а не напрямую */
  flow?: boolean;
}

export const NODE_FONT = 13;
export const NODE_LINE = 16;

const wideGlyph = /[MW@%ЖШЩЮЫФжшщюыф]/u;
export const graphTextWidth = (text: string, size: number) =>
  [...text].reduce((width, char) => width + (wideGlyph.test(char) ? 1.02 : /[il.,:;!| ]/.test(char) ? 0.36 : 0.72) * size, 0);

export function sizeNode(node: Pick<GraphNode, 'label' | 'shape'>, flow: boolean): Pick<GraphNode, 'lines' | 'w' | 'h'> {
  const { shape } = node;
  const lines = wrapText(node.label, shape === 'circle' ? 16 : shape === 'diamond' ? 19 : 25);
  const textW = Math.max(...lines.map((line) => graphTextWidth(line, NODE_FONT)));
  const textH = lines.length * NODE_LINE;
  if (shape === 'circle') {
    // An ellipse containing the entire text rectangle, including its corners.
    const w = Math.max(36, Math.ceil((textW + 10) * Math.SQRT2));
    const h = Math.max(36, Math.ceil((textH + 4) * Math.SQRT2));
    return { lines, w: flow ? Math.max(w, h) : w, h: flow ? Math.max(w, h) : h };
  }
  if (shape === 'diamond') {
    const h = Math.max(46, textH * 1.5 + 18);
    const w = Math.max(
      64,
      ...lines.map((line, index) => {
        const extentY = Math.abs(index - (lines.length - 1) / 2) * NODE_LINE + 7;
        return (graphTextWidth(line, NODE_FONT) + 14) / (1 - extentY / (h / 2));
      }),
    );
    return { lines, w: Math.ceil(w), h };
  }
  const padding = shape === 'note' ? 42 : shape === 'round' ? 22 : 20;
  return { lines, w: Math.max(56, textW + padding), h: Math.max(32, textH + (shape === 'db' ? 24 : 12)) };
}

/** Уровни сверху вниз: самый длинный путь от корней, обратные рёбра циклов не учитываются */
function layers(model: GraphModel): Map<string, number> {
  const index = new Map(model.nodes.map((node, i) => [node.id, i]));
  const outgoing = new Map<string, string[]>();
  for (const edge of model.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);

  // Обратные рёбра — те, что ведут в узел на текущем пути обхода в глубину
  const back = new Set<string>();
  const state = new Map<string, 'open' | 'done'>();
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const next of outgoing.get(id) ?? []) {
      if (state.get(next) === 'open') back.add(`${id}>${next}`);
      else if (!state.has(next)) visit(next);
    }
    state.set(id, 'done');
  };
  const hasIncoming = new Set(model.edges.map((edge) => edge.to));
  for (const node of model.nodes) if (!hasIncoming.has(node.id) && !state.has(node.id)) visit(node.id);
  for (const node of model.nodes) if (!state.has(node.id)) visit(node.id);

  const level = new Map(model.nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < model.nodes.length; pass++) {
    for (const edge of model.edges) {
      if (back.has(`${edge.from}>${edge.to}`) || edge.from === edge.to) continue;
      const candidate = level.get(edge.from)! + 1;
      if (candidate > level.get(edge.to)!) level.set(edge.to, candidate);
    }
  }
  return new Map([...level].sort((a, b) => index.get(a[0])! - index.get(b[0])!));
}

export function applyLayout(model: GraphModel) {
  const free = model.nodes.filter((node) => node.x === undefined || node.y === undefined);
  if (free.length === 0) return;
  const fixed = model.nodes.filter((node) => !free.includes(node));

  if (model.layout === 'circle' || model.layout === 'force') {
    const radius = Math.max(110, free.length * 22);
    free.forEach((node, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / free.length;
      node.x = 320 + radius * Math.cos(angle);
      node.y = 180 + radius * Math.sin(angle);
    });
    if (model.layout === 'force') relax(model, new Set(free));
    return;
  }

  if (model.layout === 'grid') {
    const columns = Math.ceil(Math.sqrt(free.length));
    const columnWidth = Math.max(...free.map((node) => node.w)) + 40;
    const rowHeight = Math.max(...free.map((node) => node.h)) + 40;
    free.forEach((node, i) => {
      node.x = 100 + (i % columns) * columnWidth;
      node.y = 50 + Math.floor(i / columns) * rowHeight;
    });
    return;
  }

  // layered (и всё остальное): уровни сверху вниз, внутри уровня — по порядку объявления
  const level = layers(model);
  const rows = new Map<number, GraphNode[]>();
  for (const node of free) rows.set(level.get(node.id)!, [...(rows.get(level.get(node.id)!) ?? []), node]);
  const columnGap = 38;
  const rowGap = 48;
  const widest = Math.max(...[...rows.values()].map((row) => row.reduce((sum, node) => sum + node.w, 0) + (row.length - 1) * columnGap));
  const placed = [...fixed];
  let y = 0;
  for (const depth of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(depth)!;
    const rowHeight = Math.max(...row.map((node) => node.h));
    const rowWidth = row.reduce((sum, node) => sum + node.w, 0) + (row.length - 1) * columnGap;
    let x = (widest - rowWidth) / 2;
    for (const node of row) {
      node.x = x + node.w / 2;
      node.y = y + rowHeight / 2;
      // Explicit positions stay anchored. Move automatic nodes just past any occupied space.
      for (;;) {
        const blocker = placed.find(
          (other) => Math.abs(node.y! - other.y!) < (node.h + other.h) / 2 + 14 && Math.abs(node.x! - other.x!) < (node.w + other.w) / 2 + 14,
        );
        if (!blocker) break;
        node.x = blocker.x! + (blocker.w + node.w) / 2 + columnGap;
      }
      placed.push(node);
      x = node.x + node.w / 2 + columnGap;
    }
    y += rowHeight + rowGap;
  }
}

/** Give colliding blocks room and preserve aligned rows and columns where possible. */
export function separateFlowNodes(nodes: GraphNode[]) {
  const gap = 13;
  const placed: GraphNode[] = [];
  for (const node of nodes) {
    const [x, y] = [node.x!, node.y!];
    const obstacles = placed.map((other) => ({
      x: other.x!,
      y: other.y!,
      rx: (node.w + other.w) / 2 + gap,
      ry: (node.h + other.h) / 2 + gap,
    }));
    const overlaps = (cx: number, cy: number, box: (typeof obstacles)[number]) =>
      Math.abs(cx - box.x) < box.rx - 0.01 && Math.abs(cy - box.y) < box.ry - 0.01;
    const collisions = obstacles.filter((box) => overlaps(x, y, box));
    if (collisions.length) {
      const staysInRow = collisions.some((box) => y === box.y && x !== box.x);
      const staysInColumn = collisions.some((box) => x === box.x && y !== box.y);
      let distance = Infinity;
      for (const box of obstacles) {
        const candidates = [
          [box.x - box.rx, y],
          [box.x + box.rx, y],
          [x, box.y - box.ry],
          [x, box.y + box.ry],
        ] as const;
        for (const [cx, cy] of candidates) {
          if (staysInRow !== staysInColumn && (staysInRow ? cy !== y : cx !== x)) continue;
          const cost = Math.hypot(cx - x, cy - y);
          if (cost >= distance || obstacles.some((obstacle) => overlaps(cx, cy, obstacle))) continue;
          distance = cost;
          node.x = cx;
          node.y = cy;
        }
      }
    }
    placed.push(node);
  }
}

/**
 * layout: force — вершины отталкиваются, рёбра стягивают (как на сайте группы). Старт — круг, двигаются только
 * вершины без @. ponytail: O(n²) на шаг, у группы до ~120 вершин — хватает
 */
function relax(model: GraphModel, movable: Set<GraphNode>) {
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  for (let step = 0; step < 120; step++) {
    for (const node of movable) {
      let [dx, dy] = [0, 0];
      for (const other of model.nodes) {
        if (other === node) continue;
        const [ox, oy] = [node.x! - other.x!, node.y! - other.y!];
        const d2 = Math.max(400, ox * ox + oy * oy);
        dx += (ox / d2) * 6000;
        dy += (oy / d2) * 6000;
      }
      for (const edge of model.edges) {
        const other = edge.from === node.id ? byId.get(edge.to) : edge.to === node.id ? byId.get(edge.from) : undefined;
        if (!other || other === node) continue;
        dx += (other.x! - node.x!) * 0.04;
        dy += (other.y! - node.y!) * 0.04;
      }
      node.x! += Math.max(-20, Math.min(20, dx));
      node.y! += Math.max(-20, Math.min(20, dy));
    }
  }
}
