import { routeFlow } from './flowRoutes';
import { diagramBounds, edgeLabelLines, EDGE_LABEL_LINE, labelSize, routeGraph } from './graphRoutes';
import type { GraphModel } from './graphLayout';

export { applyLayout, separateFlowNodes, sizeNode, NODE_FONT } from './graphLayout';

export function classicEdges(model: Pick<GraphModel, 'nodes' | 'edges' | 'flow'>, marker: string, formatLabel: (text: string) => string) {
  const { routes, labels } = model.flow ? routeFlow(model, labelSize) : routeGraph(model);
  const color = model.flow ? 'var(--accent)' : 'var(--muted)';
  const defs = `<marker id="${marker}" viewBox="0 0 10 8" markerWidth="10" markerHeight="8" refX="10" refY="4" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 4L0 8L2.5 4Z" fill="${color}" style="fill:context-stroke"/></marker>`;
  const edges = routes
    .map(({ d }, index) => {
      const edge = model.edges[index]!;
      return `<g data-dgm-edge="${index}"><path d="${d}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke"/><path d="${d}" fill="none" stroke="${edge.color || color}" stroke-width="1.6" stroke-linecap="round"${edge.dashed ? ' stroke-dasharray="5 4"' : ''}${edge.directed ? ` marker-end="url(#${marker})"` : ''}/></g>`;
    })
    .join('');
  const notes = labels
    .map((at, index) => {
      if (!at) return '';
      const [x, y] = at;
      const label = model.edges[index]!.label!;
      const [w, h] = labelSize(label);
      const lines = edgeLabelLines(label);
      const spans = lines
        .map((line, i) => `<tspan x="${x}" y="${y + 4 + (i - (lines.length - 1) / 2) * EDGE_LABEL_LINE}">${formatLabel(line)}</tspan>`)
        .join('');
      return `<g data-dgm-edge="${index}"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="5" fill="var(--card)" stroke="var(--border)"/><text fill="var(--text)" font-size="12" font-weight="600" text-anchor="middle">${spans}</text></g>`;
    })
    .join('');
  const [x, y, w, h] = diagramBounds(model, routes, labels);
  return { defs, edges, notes, view: { x, y, w, h } };
}
