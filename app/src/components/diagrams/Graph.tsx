import { useId, type CSSProperties } from 'react';
import { routeFlow } from './flowRoutes';
import { diagramBounds, edgeLabelLines, EDGE_LABEL_LINE, labelSize, routeGraph } from './graphRoutes';
import { resolveColor, takeOptions, unquote, type DiagramLines } from './parse';
import styles from './Diagrams.module.css';

import { applyLayout, separateFlowNodes, sizeNode, NODE_LINE, type GraphModel, type GraphNode, type NodeShape, type GraphEdge } from './graphLayout';
export type { GraphModel, GraphNode, GraphEdge, NodeShape } from './graphLayout';

const EDGE = /^(.+?)\s*(-->|->|--|<-)\s*(.+?)(?:\s*:\s*(.+))?$/;
/** Стрелки в цепочке `A -> B -> C` (движок группы понимает цепочки и `-->`) */
const ARROW = /\s*(-->|->|--|<-)\s*/;
const POSITION = /@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/;

/**
 * `graph`: узлы `id "Подпись" @ x, y`, рёбра `A -> B : подпись` / `A -- B`, layout: manual|circle|grid|layered.
 * `diagram`: узлы `A: box|round|diamond|db|note "Текст" @ x, y`, рёбра как у графа, по умолчанию — сверху вниз.
 */
export function parseGraph({ header, body }: DiagramLines, kind: 'graph' | 'diagram'): GraphModel {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const directed = header.variant.includes('directed');
  const defaultShape: NodeShape = kind === 'graph' ? 'circle' : 'box';

  const ensure = (id: string): GraphNode => {
    let node = nodes.get(id);
    if (!node) {
      node = { id, label: id, shape: defaultShape, lines: [], w: 0, h: 0 };
      nodes.set(id, node);
    }
    return node;
  };

  for (const { text: raw, line } of body) {
    // `{color: red, dashed}` в конце строки — цвет и пунктир вершины или ребра (формат сайта группы)
    const { rest: text, options } = takeOptions(raw);
    const color = options.color ? resolveColor(options.color) : undefined;
    // diagram: "A: round "Текст" @ 80, 40"
    const flowNode = /^([^\s:"]+)\s*:\s*(box|round|diamond|db|circle|note)?\s*(".*?")?\s*(@.*)?$/.exec(text);
    if (kind === 'diagram' && flowNode && !EDGE.test(text.split(':')[0]!)) {
      const node = ensure(flowNode[1]!);
      node.shape = (flowNode[2] as NodeShape) ?? 'box';
      if (flowNode[3]) node.label = unquote(flowNode[3]);
      const at = POSITION.exec(flowNode[4] ?? '');
      if (at) [node.x, node.y] = [Number(at[1]), Number(at[2])];
      if (color) node.color = color;
      continue;
    }

    const edge = EDGE.exec(text);
    if (edge && !text.startsWith('"')) {
      // Цепочка `A -> B -> C` — это рёбра A→B и B→C с общей подписью; одиночное ребро — частный случай
      const parts = [edge[1]!.trim(), edge[2]!, ...edge[3]!.trim().split(ARROW)];
      for (let i = 0; i + 2 < parts.length; i += 2) {
        const [left, arrow, right] = [parts[i]!, parts[i + 1]!, parts[i + 2]!];
        ensure(left);
        ensure(right);
        edges.push({
          from: arrow === '<-' ? right : left,
          to: arrow === '<-' ? left : right,
          label: edge[4]?.trim() || options.label || undefined,
          directed: arrow !== '--' || directed,
          color,
          dashed: options.dashed,
        });
      }
      continue;
    }

    // graph: "A "Подпись" @ 220, 70" или "a1 @ 120, 60"
    const graphNode = /^([^\s"@]+)\s*(".*?")?\s*(@\s*-?[\d.]+\s*,\s*-?[\d.]+)?$/.exec(text);
    if (graphNode) {
      const node = ensure(graphNode[1]!);
      if (graphNode[2]) node.label = unquote(graphNode[2]);
      const at = POSITION.exec(graphNode[3] ?? '');
      if (at) [node.x, node.y] = [Number(at[1]), Number(at[2])];
      if (color) node.color = color;
      continue;
    }
    throw new Error(`Строка ${line}: непонятная команда`);
  }

  for (const node of nodes.values()) Object.assign(node, sizeNode(node, kind === 'diagram'));
  const layout = header.layout ?? (kind === 'diagram' ? 'layered' : [...nodes.values()].every((node) => node.x !== undefined) ? 'manual' : 'circle');
  const model: GraphModel = { nodes: [...nodes.values()], edges, layout, directed, flow: kind === 'diagram' };
  if (model.nodes.length === 0) throw new Error('Пустая диаграмма');
  applyLayout(model);
  if (model.flow) separateFlowNodes(model.nodes);
  return model;
}

function NodeShapeView({ node }: { node: GraphNode }) {
  const { x = 0, y = 0, w, h } = node;
  if (!node.color) return shape(node, x, y, w, h);
  return (
    <g className={styles.colored} style={{ '--node-color': node.color } as CSSProperties}>
      {shape(node, x, y, w, h)}
    </g>
  );
}

function shape(node: GraphNode, x: number, y: number, w: number, h: number) {
  switch (node.shape) {
    case 'circle':
      return <ellipse className={styles.node} cx={x} cy={y} rx={w / 2} ry={h / 2} />;
    case 'round':
      return <rect className={styles.nodeAccent} x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} />;
    case 'diamond':
      return <polygon className={styles.nodeWarm} points={`${x},${y - h / 2} ${x + w / 2},${y} ${x},${y + h / 2} ${x - w / 2},${y}`} />;
    case 'db':
      return (
        <g>
          <path
            className={styles.node}
            d={`M${x - w / 2},${y - h / 2 + 6} v${h - 12} a${w / 2},6 0 0 0 ${w},0 v${-(h - 12)} a${w / 2},6 0 0 0 ${-w},0 z`}
          />
          <ellipse className={styles.node} cx={x} cy={y - h / 2 + 6} rx={w / 2} ry={6} />
        </g>
      );
    case 'note': {
      // Лист с загнутым уголком, как у движка группы
      const [left, right, top, bottom, fold] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2, 18];
      return (
        <g>
          <path className={styles.node} d={`M${left},${top} H${right - fold} L${right},${top + fold} V${bottom} H${left} Z`} />
          <path className={styles.nodeFold} d={`M${right - fold},${top} V${top + fold} H${right}`} />
        </g>
      );
    }
    default:
      return <rect className={styles.node} x={x - w / 2} y={y - h / 2} width={w} height={h} rx={8} />;
  }
}

function EdgeLabel({ x, y, label }: { x: number; y: number; label: string }) {
  const [width, height] = labelSize(label);
  const lines = edgeLabelLines(label);
  return (
    <g>
      <rect className={styles.edgeLabelBox} x={x - width / 2} y={y - height / 2} width={width} height={height} rx={5} />
      <text className={styles.edgeLabel} textAnchor="middle">
        {lines.map((line, i) => (
          <tspan key={i} x={x} y={y + 4 + (i - (lines.length - 1) / 2) * EDGE_LABEL_LINE}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export function GraphView({ model }: { model: GraphModel }) {
  const markerId = `arrow-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const { routes, labels } = model.flow ? routeFlow(model, labelSize) : routeGraph(model, labelSize);
  const [minX, minY, width, height] = diagramBounds(model, routes, labels, labelSize);
  return (
    <svg viewBox={`${minX} ${minY} ${width} ${height}`} className={styles.svg} style={{ maxWidth: width, minWidth: width * 0.8 }} role="img">
      <defs>
        <marker id={markerId} viewBox="0 0 10 8" refX="10" refY="4" markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0 0L10 4L0 8L2.5 4Z" className={styles.arrowHead} />
        </marker>
      </defs>

      {routes.map(({ d }, index) => {
        const edge = model.edges[index]!;
        return (
          <g key={index} data-dgm-edge={index}>
            <path className={styles.edgeHit} d={d} />
            <path
              className={styles.edge}
              style={{ stroke: edge.color, strokeDasharray: edge.dashed ? '5 4' : undefined }}
              d={d}
              markerEnd={edge.directed ? `url(#${markerId})` : undefined}
            />
          </g>
        );
      })}

      {model.nodes.map((node) => (
        <g key={node.id} className={styles.nodeGroup} data-dgm-node={node.id}>
          <NodeShapeView node={node} />
          {node.lines.map((line, index) => (
            <text
              key={index}
              className={styles.nodeText}
              x={node.x}
              y={node.y! + (index - (node.lines.length - 1) / 2) * NODE_LINE + 4}
              textAnchor="middle"
            >
              {line}
            </text>
          ))}
        </g>
      ))}

      {labels.map(
        (at, index) =>
          at && (
            <g key={index} data-dgm-edge={index}>
              <EdgeLabel x={at[0]} y={at[1]} label={model.edges[index]!.label!} />
            </g>
          ),
      )}
    </svg>
  );
}
