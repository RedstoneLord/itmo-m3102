import { expect, it } from 'vitest';
import type { GraphModel } from './Graph';
import { parseGraph } from './Graph';
import { splitLines, textWidth } from './parse';
import { routeFlow } from './flowRoutes';

const node = (id: string, x: number, y: number, shape: GraphModel['nodes'][number]['shape'] = 'box') => ({
  id,
  label: id,
  shape,
  x,
  y,
  w: 120,
  h: 40,
  lines: [id],
});

it('стрелка блок-схемы обходит блок на пути, подпись не ложится на блоки', () => {
  // A сверху, B посередине на той же вертикали, C снизу: A -> C напрямую прошла бы сквозь B
  const nodes = [node('A', 200, 40), node('B', 200, 140), node('C', 200, 240)];
  const model = { nodes, edges: [{ from: 'A', to: 'C', directed: true, label: 'да' }] };
  const { routes, labels } = routeFlow(model, () => [30, 18]);
  const b = nodes[1]!;
  const insideB = routes[0]!.pts.some(([x, y]) => x > b.x - b.w / 2 && x < b.x + b.w / 2 && y > b.y - b.h / 2 && y < b.y + b.h / 2);
  expect(insideB).toBe(false);
  // Конец — у верхней грани C
  const end = routes[0]!.pts[routes[0]!.pts.length - 1]!;
  expect(Math.abs(end[1] - (240 - 20))).toBeLessThan(4);
  const [lx, ly] = labels[0]!;
  expect(nodes.some((n) => Math.abs(lx - n.x) < n.w / 2 && Math.abs(ly - n.y) < n.h / 2)).toBe(false);
});

it('свободный путь — плавная кривая сверху вниз, петля — своей дорожкой', () => {
  const nodes = [node('A', 100, 40), node('B', 300, 160, 'diamond')];
  const { routes } = routeFlow(
    {
      nodes,
      edges: [
        { from: 'A', to: 'B', directed: true },
        { from: 'B', to: 'B', directed: true },
      ],
    },
    () => [30, 18],
  );
  expect(routes[0]!.d).toContain('C');
  expect(routes[1]!.d.startsWith('M')).toBe(true);
});

it('подписи тесно стоящих блоков уходят в свободное место: не на блоки и не друг на друга («Две лестницы бесконечности»)', () => {
  const source = [
    'title: Две лестницы бесконечности',
    'A0: round "Aleph_0 = Beth_0 = |N|" @ 180, 50',
    'A1: round "Aleph_1" @ 100, 140',
    'A2: round "Aleph_2" @ 100, 220',
    'B1: round "Beth_1 = 2^(Aleph_0)" @ 260, 140',
    'B2: round "Beth_2 = 2^(Beth_1)" @ 260, 220',
    'A0 -> A1 : следующий кардинал',
    'A1 -> A2 : следующий кардинал',
    'A0 -> B1 : булеан (2^x)',
    'B1 -> B2 : булеан (2^x)',
    'A1 -> B1 : CH: равны ли они?',
  ].join('\n');
  const model = parseGraph(splitLines(source, 'diagram'), 'diagram');
  const size = (text: string): [number, number] => [textWidth(text, 11) + 10, 18];
  const { labels } = routeFlow(model, size);
  const rects = labels.map((at, index) => {
    const [w, h] = size(model.edges[index]!.label!);
    return { x0: at![0] - w / 2, y0: at![1] - h / 2, x1: at![0] + w / 2, y1: at![1] + h / 2 };
  });
  const overlap = (a: (typeof rects)[number], b: (typeof rects)[number]) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  for (const rect of rects) {
    for (const n of model.nodes)
      expect(overlap(rect, { x0: n.x! - n.w / 2, y0: n.y! - n.h / 2, x1: n.x! + n.w / 2, y1: n.y! + n.h / 2 })).toBe(false);
    expect(rects.filter((other) => other !== rect && overlap(rect, other))).toEqual([]);
  }
});

it('смещённый ромб получает прямой участок перед наконечником', () => {
  const model = {
    nodes: [node('A', 280, 40, 'round'), node('B', 80, 113, 'diamond')],
    edges: [{ from: 'A', to: 'B', directed: true }],
  };
  const { routes } = routeFlow(model, () => [30, 18]);
  expect(routes[0]!.d).toMatch(/ 80 [\d.]+L80 92$/);
  const last = routes[0]!.pts.slice(-2);
  expect(last[0]![0]).toBe(last[1]![0]);
  expect(last[0]![1]).toBeLessThan(last[1]![1]);
});

it('автоматические блоки обходят блок с заданными координатами и вмещают длинные подписи', () => {
  const source = 'A: box "Первый блок" @ 80, 18\nB: box "ШИРОКАЯ ПОДПИСЬ"\nC: diamond "Условие для перехода к следующему этапу"\nB -> C';
  const { nodes } = parseGraph(splitLines(source, 'diagram'), 'diagram');
  const [fixed, first, second] = nodes;
  expect(fixed).toMatchObject({ x: 80, y: 18 });
  expect(first!.x! - first!.w / 2).toBeGreaterThan(fixed!.x! + fixed!.w / 2);
  expect(second!.lines.length).toBeGreaterThan(1);
  expect(second!.y! - second!.h / 2).toBeGreaterThan(first!.y! + first!.h / 2);
});

it('пересекающиеся фигуры с ручными координатами расходятся в пределах ряда', () => {
  const model = parseGraph(
    splitLines('A: box "Начало вычисления" @ 40, 60\nB: diamond "Проверка результата" @ 120, 60\nA -> B', 'diagram'),
    'diagram',
  );
  const [first, second] = model.nodes;
  expect(first).toMatchObject({ x: 40, y: 60 });
  expect(second!.y).toBe(60);
  expect(second!.x! - second!.w / 2 - (first!.x! + first!.w / 2)).toBeGreaterThanOrEqual(12);
});
