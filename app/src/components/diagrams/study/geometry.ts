import { escapeMarkup, lineError, readStudySource } from './source';

type Vector = readonly [number, number, number];
export interface Camera {
  yaw: number;
  pitch: number;
  zoom: number;
}

const axes: Vector[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const origin: Vector = [0, 0, 0];
const plus = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vector, k: number): Vector => [a[0] * k, a[1] * k, a[2] * k];
const minus = (a: Vector, b: Vector) => plus(a, scale(b, -1));
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vector) => Math.hypot(...a);
const unit = (a: Vector) => scale(a, 1 / length(a));
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const colors = ['blue', 'green', 'purple', 'red', 'orange', 'gray'] as const;
type Color = (typeof colors)[number];
type ShapeName = 'point' | 'vector' | 'line' | 'plane';
interface Shape {
  type: ShapeName;
  start: Vector;
  parts: Vector[];
  label: string;
  color: Color;
}

function numbers(text: string, count: number, line: number) {
  const tokens = text.trim().split(/\s+/);
  const values = tokens.map(Number);
  if (tokens.length !== count || tokens.some((v, index) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) || Math.abs(values[index]!) > 10000)) {
    lineError(line, `ожидалось ${count} чисел в диапазоне от −10 000 до 10 000`);
  }
  return values;
}

export function parseGeometry(source: string) {
  const { header, body } = readStudySource(source, 'geometry3d');
  const shapes: Shape[] = [];
  let view: Camera = { yaw: 35, pitch: 26, zoom: 1 };
  let showAxes = true;

  for (const { text, line } of body) {
    if (text.startsWith('view:')) {
      const [yaw, pitch] = numbers(text.slice(5), 2, line) as [number, number];
      if (Math.abs(pitch) > 90) lineError(line, 'угол возвышения должен быть от −90° до 90°');
      view = { ...view, yaw: yaw % 360, pitch };
      continue;
    }
    if (/^axes:\s*(on|off)$/.test(text)) {
      showAxes = text.endsWith('on');
      continue;
    }
    const match = /^(point|vector|line|plane)\s+([^"]+?)(?:\s+"([^"]{1,48})")?(?:\s+color=([a-z]+))?$/.exec(text);
    if (!match) lineError(line, 'ожидалась команда point, vector, line, plane, view: или axes:');
    const type = match[1] as ShapeName;
    const color = (match[4] ?? (type === 'plane' ? 'blue' : 'gray')) as Color;
    if (!colors.includes(color)) lineError(line, `доступные цвета: ${colors.join(', ')}`);
    const blocks = match[2]!.split(type === 'vector' ? '->' : '|');
    const size = type === 'plane' ? 3 : type === 'point' ? 1 : 2;
    if (blocks.length !== size) lineError(line, `команда ${type} требует ${size} троек координат`);
    const [start, ...parts] = blocks.map((block) => numbers(block, 3, line) as unknown as Vector);
    const a = parts[0]!;
    if (type === 'line' && length(a) < 1e-9) lineError(line, 'направление прямой должно быть ненулевым');
    if (type === 'plane') {
      const b = parts[1]!;
      if (shapes.some((shape) => shape.type === 'plane')) lineError(line, 'сцена поддерживает одну плоскость');
      if (length(a) < 1e-9 || length(b) < 1e-9 || length(cross(unit(a), unit(b))) < 1e-9) {
        lineError(line, 'укажите два независимых направления плоскости');
      }
    }
    if (shapes.length >= 48) lineError(line, 'допустимо до 48 объектов');
    shapes.push({ type, start: start!, parts, label: match[3] ?? '', color });
  }
  if (!shapes.length) lineError(1, 'добавьте объект сцены');

  const positions = shapes.flatMap(({ type, start, parts }) => (type === 'vector' ? [start, parts[0]!] : [start]));
  const middle = (axis: 0 | 1 | 2) => {
    const values = positions.map((point) => point[axis]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  };
  const center: Vector = showAxes ? origin : [middle(0), middle(1), middle(2)];
  const radius = Math.max(...positions.map((point) => length(minus(point, center))));
  return { kind: 'geometry3d' as const, source, header, view, shapes, showAxes, center, radius: radius > 1e-9 ? radius : 1 };
}

export type GeometryModel = ReturnType<typeof parseGeometry>;

export function projection({ yaw, pitch }: Camera) {
  const angle = (degrees: number) => (degrees * Math.PI) / 180;
  const [s, c] = [Math.sin(angle(yaw)), Math.cos(angle(yaw))];
  const [t, u] = [Math.sin(angle(pitch)), Math.cos(angle(pitch))];
  const right: Vector = [c, s, 0];
  const up: Vector = [-s * t, c * t, u];
  return { right, up, depth: cross(right, up) };
}

const names: Record<ShapeName, string> = { point: 'Точка', vector: 'Вектор', line: 'Прямая', plane: 'Плоскость' };
const coordinates = (v: Vector) => `(${v.join(', ')})`;

export function geometryObjects(model: GeometryModel) {
  return model.shapes.map(({ type, label, start, parts, color }) => {
    const name = label && label.toLowerCase() !== names[type].toLowerCase() ? `${names[type]} ${label}` : names[type];
    const [a, b] = parts;
    const at = coordinates(start);
    const description =
      type === 'point'
        ? at
        : type === 'vector'
          ? `из ${at} в ${coordinates(a!)}`
          : b
            ? `через ${at} с направлениями ${coordinates(a!)} и ${coordinates(b)}`
            : `через ${at} с направлением ${coordinates(a!)}`;
    return { name, description, color };
  });
}

export function describeGeometry(model: GeometryModel) {
  return geometryObjects(model).map(({ name, description }) => `${name} ${description}`);
}

export function geometrySvg(model: GeometryModel, camera: Camera, showPlane: boolean, current = false) {
  const width = 480;
  const height = 320;
  const { right, up, depth } = projection(camera);
  const extent = model.radius * 0.72;
  const plane = model.shapes.find((shape) => shape.type === 'plane');
  const normal = plane ? unit(cross(unit(plane.parts[0]!), unit(plane.parts[1]!))) : origin;
  const corners = plane
    ? (() => {
        const u = scale(unit(plane.parts[0]!), extent);
        const v = scale(unit(cross(normal, u)), extent);
        return [plus(u, v), minus(v, u), scale(plus(u, v), -1), minus(u, v)].map((offset) => plus(plane.start, offset));
      })()
    : [];
  const limits = model.shapes.flatMap(({ type, start, parts }) => {
    if (type === 'vector') return [start, parts[0]!];
    if (type === 'line') {
      const offset = scale(unit(parts[0]!), model.radius * 1.13);
      return [minus(start, offset), plus(start, offset)];
    }
    return [start];
  });
  if (model.showAxes) limits.push(...axes.flatMap((axis) => [scale(axis, model.radius * 1.15), scale(axis, -model.radius * 1.035)]));
  // Hiding the plane keeps the zoom level and the positions of the other objects.
  const fit = [...limits, ...corners].reduce((result, position) => {
    const v = minus(position, model.center);
    return Math.max(result, Math.abs(dot(v, right)) / 194, Math.abs(dot(v, up)) / 132);
  }, model.radius / 155);
  const factor = camera.zoom / fit;
  const project = (v: Vector) => {
    const relative = minus(v, model.center);
    return [width / 2 + factor * dot(relative, right), height / 2 - factor * dot(relative, up)] as const;
  };
  const point = (v: Vector) =>
    project(v)
      .map((item) => item.toFixed(2))
      .join(',');
  const facing = dot(normal, depth);
  const distance = (v: Vector) => (showPlane && plane && Math.abs(facing) > 1e-9 ? dot(minus(v, plane.start), normal) * Math.sign(facing) : 0);
  const behind = (v: Vector) => distance(v) < -model.radius * 1e-8;
  const back: string[] = [];
  const front: string[] = [];
  const labels: string[] = [];

  const label = (v: Vector, value: string, left = false, dy = -7) => {
    if (!value) return;
    const [x, y] = project(v);
    const anchor = left || x > width - 65 ? 'end' : 'start';
    labels.push(
      `<text x="${x + (anchor === 'end' ? -7 : 7)}" y="${y + dy}" text-anchor="${anchor}" paint-order="stroke" stroke="var(--study-paper)" stroke-width="3" stroke-linejoin="round">${escapeMarkup(value)}</text>`,
    );
  };
  const mark = (v: Vector, color: string) => {
    const [x, y] = project(v);
    (behind(v) ? back : front).push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${color}"/>`);
  };
  const segment = (a: Vector, b: Vector, color: string, arrow = false, dashed = false) => {
    const [x, y] = project(a);
    const [X, Y] = project(b);
    const l = Math.hypot(X - x, Y - y);
    if (l < 0.5) {
      if (arrow) mark(b, color);
      return;
    }
    const line = (from: Vector, to: Vector) =>
      `<path d="M${point(from)}L${point(to)}" fill="none" stroke="${color}" stroke-width="${arrow ? 2.7 : 1.5}"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
    if (behind(a) !== behind(b)) {
      const ratio = Math.max(0, Math.min(1, distance(a) / (distance(a) - distance(b))));
      const middle = plus(a, scale(minus(b, a), ratio));
      (behind(a) ? back : front).push(line(a, middle));
      (behind(b) ? back : front).push(line(middle, b));
    } else {
      (behind(b) ? back : front).push(line(a, b));
    }
    if (arrow) {
      const dx = (X - x) / l;
      const dy = (Y - y) / l;
      const size = Math.min(10, l * 0.7);
      const bx = X - size * dx;
      const by = Y - size * dy;
      (behind(b) ? back : front).push(
        `<path d="M${X} ${Y} L${bx - 3.6 * dy} ${by + 3.6 * dx} L${bx + 3.6 * dy} ${by - 3.6 * dx}Z" fill="${color}"/>`,
      );
    }
  };

  if (model.showAxes) {
    axes.forEach((v, i) => {
      if (Math.abs(dot(v, depth)) > 1 - 1e-9) return;
      const end = scale(v, 1.15 * model.radius);
      segment(scale(end, -0.9), end, 'var(--study-muted)', true);
      label(end, ['x', 'y', 'z'][i]!);
    });
    label(origin, 'O');
  }

  for (const {
    type,
    start,
    parts: [a],
    label: name,
    color,
  } of model.shapes) {
    const ink = `var(--study-${color})`;
    if (type === 'point') {
      mark(start, ink);
      label(start, name);
    } else if (type === 'vector') {
      segment(start, a!, ink, true);
      const direction = minus(a!, start);
      const endOn = factor * Math.hypot(dot(direction, right), dot(direction, up)) < 0.5;
      label(scale(plus(start, a!), 0.5), name, false, endOn ? 17 : -7);
    } else if (type === 'line') {
      const direction = scale(unit(a!), model.radius * 1.13);
      const end = plus(start, direction);
      segment(minus(start, direction), end, ink, false, true);
      label(end, name);
    }
  }

  let planeSvg = '';
  if (plane && showPlane) {
    const ink = `var(--study-${plane.color})`;
    planeSvg =
      Math.abs(facing) < 1e-9
        ? `<polyline points="${corners.map(point).join(' ')}" fill="none" stroke="${ink}" stroke-width="2"/>`
        : `<polygon points="${corners.map(point).join(' ')}" fill="${ink}" fill-opacity=".24" stroke="${ink}" stroke-opacity=".65"/>`;
    const left = corners.reduce((best, corner) => (project(corner)[0] < project(best)[0] ? corner : best));
    label(left, plane.label, true);
  }
  const description = current ? 'Ортографический вид сцены' : describeGeometry(model).join('. ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden" ${current ? 'data-study-current' : ''} role="img" aria-label="${escapeMarkup(description)}"><g>${back.join('')}${planeSvg}${front.join('')}</g><g fill="var(--study-ink)" font-family="system-ui, sans-serif" font-size="16">${labels.join('')}</g></svg>`;
}
