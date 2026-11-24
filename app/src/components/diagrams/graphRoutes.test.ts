import { expect, it } from 'vitest';
import { parseGraph } from './Graph';
import { diagramBounds, labelSize, routeGraph } from './graphRoutes';
import { splitLines } from './parse';

it('подписи горизонтального и вертикального рёбер не перекрывают линии, подпись петли входит в SVG', () => {
  const model = parseGraph(
    splitLines('A @ 30, 100\nB @ 290, 100\nC @ 160, 0\nD @ 160, 200\nA -> B : 12\nC -> D : длинная подпись\nC -> C : петля', 'graph'),
    'graph',
  );
  const { routes, labels } = routeGraph(model);
  const [minX, minY, width, height] = diagramBounds(model, routes, labels);
  labels.forEach((at, index) => {
    const [x, y] = at!;
    const [w, h] = labelSize(model.edges[index]!.label!);
    expect(x - w / 2).toBeGreaterThan(minX);
    expect(y - h / 2).toBeGreaterThan(minY);
    expect(x + w / 2).toBeLessThan(minX + width);
    expect(y + h / 2).toBeLessThan(minY + height);
    for (const route of routes) {
      expect(route.pts.some(([px, py]) => Math.abs(px - x) < w / 2 && Math.abs(py - y) < h / 2)).toBe(false);
    }
  });
});
