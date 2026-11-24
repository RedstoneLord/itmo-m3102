import { placeEdgeLabels, type FlowRoute } from './flowRoutes';
import { wrapText } from './parse';
import { graphTextWidth, type GraphModel, type GraphNode } from './graphLayout';

/** Точка на границе узла в направлении (dx, dy) от центра — чтобы стрелка упиралась в край */
function boundary(node: GraphNode, dx: number, dy: number): [number, number] {
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  if (node.shape === 'circle') {
    const rx = node.w / 2;
    const ry = node.h / 2;
    const t = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
    return [node.x! + ux * t, node.y! + uy * t];
  }
  if (node.shape === 'diamond') {
    const t = 1 / (Math.abs(ux) / (node.w / 2) + Math.abs(uy) / (node.h / 2));
    return [node.x! + ux * t, node.y! + uy * t];
  }
  const t = Math.min(node.w / 2 / Math.max(Math.abs(ux), 1e-9), node.h / 2 / Math.max(Math.abs(uy), 1e-9));
  return [node.x! + ux * t, node.y! + uy * t];
}

type Point = [number, number];
export const EDGE_LABEL_LINE = 15;
export const edgeLabelLines = (text: string) => wrapText(text, 28);
export function labelSize(text: string): Point {
  const lines = edgeLabelLines(text);
  return [Math.max(...lines.map((line) => graphTextWidth(line, 12))) + 12, lines.length * EDGE_LABEL_LINE + 5];
}

function sample(points: Point[]) {
  const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1]), 0);
  const count = Math.max(2, Math.min(512, Math.ceil(length / 5)));
  return Array.from({ length: count + 1 }, (_, index): Point => {
    const t = index / count;
    let level = points;
    while (level.length > 1) {
      level = level.slice(1).map(([x, y], i) => [level[i]![0] * (1 - t) + x * t, level[i]![1] * (1 - t) + y * t]);
    }
    return level[0]!;
  });
}

export function routeGraph(model: Pick<GraphModel, 'nodes' | 'edges'>, measure = labelSize) {
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  const pairs = new Set(model.edges.map((edge) => JSON.stringify([edge.from, edge.to])));
  const repeats = new Map<string, number>();
  const routes = model.edges.map((edge): FlowRoute => {
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    const key = JSON.stringify([edge.from, edge.to]);
    const repeat = repeats.get(key) ?? 0;
    repeats.set(key, repeat + 1);

    if (from === to) {
      const [x, y, radius] = [from.x!, from.y!, Math.max(22, from.w / 2) + repeat * 12];
      const start = boundary(from, 1, -1);
      const finish = boundary(from, -1, -1);
      const controls: Point[] = [start, [x + 1.8 * radius, y - from.h / 2 - radius * 2], [x - 1.8 * radius, y - from.h / 2 - radius * 2], finish];
      return { d: `M${start}C${controls.slice(1).join(' ')}`, pts: sample(controls) };
    }

    const dx = to.x! - from.x!;
    const dy = to.y! - from.y!;
    const length = Math.hypot(dx, dy) || 1;
    const reverse = pairs.has(JSON.stringify([edge.to, edge.from]));
    const bend = (repeat + (reverse ? 1 : 0)) * Math.min(48, length * 0.26);
    const cx = (from.x! + to.x!) / 2 - (dy / length) * bend;
    const cy = (from.y! + to.y!) / 2 + (dx / length) * bend;
    const start = boundary(from, cx - from.x!, cy - from.y!);
    const finish = boundary(to, cx - to.x!, cy - to.y!);
    return bend
      ? { d: `M${start}Q${cx},${cy} ${finish}`, pts: sample([start, [cx, cy], finish]) }
      : { d: `M${start}L${finish}`, pts: sample([start, finish]) };
  });
  return { routes, labels: placeEdgeLabels(model, routes, measure) };
}

export function diagramBounds(
  model: Pick<GraphModel, 'nodes' | 'edges'>,
  routes: FlowRoute[],
  labels: (Point | null)[],
  measure = labelSize,
): [number, number, number, number] {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number, rx = 0, ry = 0) => {
    left = Math.min(left, x - rx);
    top = Math.min(top, y - ry);
    right = Math.max(right, x + rx);
    bottom = Math.max(bottom, y + ry);
  };
  for (const node of model.nodes) add(node.x!, node.y!, node.w / 2, node.h / 2);
  for (const route of routes) for (const [x, y] of route.pts) add(x, y);
  labels.forEach((at, index) => {
    if (!at) return;
    const [width, height] = measure(model.edges[index]!.label!);
    add(at[0], at[1], width / 2, height / 2);
  });
  return Number.isFinite(left) ? [left - 12, top - 12, right - left + 24, bottom - top + 24] : [0, 0, 120, 80];
}
