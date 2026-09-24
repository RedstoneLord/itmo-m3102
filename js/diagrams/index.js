import { parseExpression } from './expression.js';

const registry = new Map();
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = (value, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(-10000, Math.min(10000, parsed)) : fallback; };
const size = (value, fallback) => Math.max(120, Math.min(1600, number(value || fallback, fallback)));
const palette = ['var(--accent)', 'var(--text)', 'var(--muted)', '#dd7956', '#42a592', '#4d87bf', '#b36da3'];
const names = { red: '#dd7956', blue: '#4d87bf', green: '#42a592', purple: '#9069cf', orange: '#db9451', gray: 'var(--muted)', black: 'var(--text)', white: '#ffffff' };
const safeColor = value => names[value] || (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value || '') ? value : 'var(--accent)');
const hash = text => [...text].reduce((state, char) => (state * 31 + char.charCodeAt(0)) >>> 0, 17).toString(36);
const format = value => Math.round(value * 10) / 10;
const lineError = (line, message) => { throw new Error(`Строка ${line}: ${message}`); };
const fmtLabel = raw => escape(String(raw).replace(/\\alpha/g, 'α').replace(/\\to/g, '→').replace(/\\le/g, '≤')).replace(/([A-Za-zА-Яа-я0-9])_([A-Za-zА-Яа-я0-9]+)/g, '$1<tspan baseline-shift="sub" font-size="70%">$2</tspan>').replace(/([A-Za-zА-Яа-я0-9])\^([A-Za-zА-Яа-я0-9]+)/g, '$1<tspan baseline-shift="super" font-size="70%">$2</tspan>');
const textSvg = (x, y, label, attrs = '') => `<text x="${format(x)}" y="${format(y)}" ${attrs}>${fmtLabel(label)}</text>`;
const svg = (model, inner, width = 640, height = 360, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size(model.width, width)} ${size(model.height, height)}" role="img" aria-label="${escape(model.title || model.lang)}"><title>${escape(model.title || 'Диаграмма')}</title><desc>${escape(model.caption || `Диаграмма ${model.lang}`)}</desc><defs>${defs}</defs>${inner}</svg>`;
const markup = (text, renderer) => {
  const lines = String(text).split(/\r?\n/);
  const model = { source: text.trim(), title: '', caption: '', width: 0, height: 0 };
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const match = /^(title|caption|width|height):\s*(.*)$/i.exec(trimmed);
    if (match) { model[match[1].toLowerCase()] = ['width', 'height'].includes(match[1].toLowerCase()) ? size(match[2], 0) : match[2]; continue; }
    renderer(model, trimmed, i + 1, lines[i]);
  }
  return model;
};
const styleOf = line => {
  const style = /\{([^}]*)\}\s*$/.exec(line);
  if (!style) return { line, color: '', dashed: false, label: '' };
  const raw = Object.fromEntries(style[1].split(',').map(part => part.split(':').map(value => value?.trim())).filter(part => part.length === 2));
  return { line: line.slice(0, style.index).trim(), color: raw.color ? safeColor(raw.color) : '', dashed: /\bdashed\b/.test(style[1]), label: raw.label?.replace(/^"|"$/g, '') || '' };
};
export function registerDiagram(lang, definition) { registry.set(lang, definition); }
export const hasDiagram = lang => registry.has(lang);
export const diagramLanguages = () => [...registry.keys()];
export function parseDiagram(lang, text) {
  const definition = registry.get(lang);
  if (!definition) throw new Error(`Неизвестный тип диаграммы: ${lang}`);
  const model = definition.parse(text); model.lang = lang;
  return model;
}
export function serializeDiagram(model) { return registry.get(model.lang)?.serialize?.(model) || model.source; }
export function renderDiagram(lang, text) { const model = parseDiagram(lang, text); return { model, svg: registry.get(lang).render(model) }; }
export function codeFigure(lang, text) {
  try {
    const { model, svg: image } = renderDiagram(lang, text);
    return `<figure class="dgm" data-dgm-lang="${escape(lang)}" data-dgm-src="${escape(text)}"><div class="dgm-art">${image}</div>${model.caption ? `<figcaption>${escape(model.caption)}</figcaption>` : ''}<div class="dgm-actions"><button type="button" data-dgm-copy>Копировать SVG</button><button type="button" data-dgm-save="svg">SVG</button><button type="button" data-dgm-save="png">PNG</button><button type="button" data-dgm-edit>✎ Редактировать</button></div></figure>`;
  } catch (error) { return `<div class="mermaid-err" role="alert">${escape(error.message || String(error))}</div>`; }
}

function parseGraph(text) {
  const model = markup(text, (m, line, at) => {
    m.nodes ||= new Map(); m.edges ||= []; m.layout ||= 'circle';
    if (/^graph(?:\s+directed)?$/i.test(line)) { m.directed = /directed/i.test(line); return; }
    if (/^layout:\s*/i.test(line)) { const value = line.split(':')[1].trim(); if (!['circle', 'grid', 'layered', 'force', 'manual'].includes(value)) lineError(at, 'неизвестная раскладка'); m.layout = value; return; }
    const styled = styleOf(line), edge = /^([^\s]+)\s*(->|--)\s*([^\s:]+)(?:\s*:\s*(.+))?$/.exec(styled.line);
    if (edge) { if (m.edges.length >= 500) lineError(at, 'слишком много рёбер'); for (const key of [edge[1], edge[3]]) if (!m.nodes.has(key)) m.nodes.set(key, { id: key }); m.edges.push({ from: edge[1], to: edge[3], directed: edge[2] === '->', weight: edge[4] || '', color: styled.color, dashed: styled.dashed }); return; }
    const positioned = /^([^\s@]+)\s*@\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(styled.line);
    if (positioned) { m.nodes.set(positioned[1], { ...m.nodes.get(positioned[1]), id: positioned[1], x: number(positioned[2]), y: number(positioned[3]), color: styled.color }); return; }
    const node = /^([^\s]+)(?:\s+"([^"]+)")?$/.exec(styled.line);
    if (node) { if (m.nodes.size >= 500) lineError(at, 'слишком много вершин'); m.nodes.set(node[1], { ...m.nodes.get(node[1]), id: node[1], label: node[2] || node[1], color: styled.color }); return; }
    lineError(at, 'не удалось прочитать вершину или ребро');
  });
  model.nodes ||= new Map(); model.edges ||= []; model.layout ||= 'circle';
  if (model.nodes.size > 500) throw new Error('Слишком много вершин');
  if (model.layout === 'force' && model.nodes.size > 120) throw new Error('Для force-layout допустимо не больше 120 вершин');
  return model;
}
function graphPositions(model, width, height) {
  const nodes = [...model.nodes.values()], points = new Map(), n = nodes.length;
  nodes.forEach((node, i) => {
    let x, y;
    if (model.layout === 'grid' || model.layout === 'layered') { const columns = model.layout === 'grid' ? Math.ceil(Math.sqrt(n)) : Math.min(5, n); x = width * ((i % columns) + 1) / (columns + 1); y = height * (Math.floor(i / columns) + 1) / (Math.ceil(n / columns) + 1); }
    else { const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2; x = width / 2 + Math.min(width, height) * .34 * Math.cos(angle); y = height / 2 + Math.min(width, height) * .34 * Math.sin(angle); }
    points.set(node.id, { x: node.x ?? x, y: node.y ?? y });
  });
  if (model.layout === 'force' && n > 1) for (let iter = 0; iter < 70; iter++) {
    for (let i = 0; i < n; i++) {
      const point = points.get(nodes[i].id); if (nodes[i].x != null) continue;
      let dx = 0, dy = 0;
      for (let j = 0; j < n; j++) if (i !== j) { const other = points.get(nodes[j].id), ox = point.x - other.x, oy = point.y - other.y, d2 = Math.max(100, ox * ox + oy * oy); dx += ox / d2 * 800; dy += oy / d2 * 800; }
      for (const edge of model.edges) if (edge.from === nodes[i].id || edge.to === nodes[i].id) { const other = points.get(edge.from === nodes[i].id ? edge.to : edge.from); dx += (other.x - point.x) * .006; dy += (other.y - point.y) * .006; }
      point.x = Math.max(35, Math.min(width - 35, point.x + dx * .15)); point.y = Math.max(35, Math.min(height - 35, point.y + dy * .15));
    }
  }
  return points;
}
function drawGraph(model) {
  const width = size(model.width, 640), height = size(model.height, 360), points = graphPositions(model, width, height), id = `dgm-arrow-${hash(model.source)}`;
  const defs = `<marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="var(--muted)"/></marker>`;
  const edges = model.edges.map((edge, index) => {
    const a = points.get(edge.from), b = points.get(edge.to), color = edge.color || 'var(--muted)', dash = edge.dashed ? 'stroke-dasharray="5 5"' : '';
    if (edge.from === edge.to) return `<g data-dgm-edge="${index}"><path d="M ${format(a.x + 15)} ${format(a.y - 14)} C ${format(a.x + 70)} ${format(a.y - 75)}, ${format(a.x - 70)} ${format(a.y - 75)}, ${format(a.x - 15)} ${format(a.y - 14)}" fill="none" stroke="${color}" stroke-width="2" ${dash} ${edge.directed ? `marker-end="url(#${id})"` : ''}/></g>`;
    const angle = Math.atan2(b.y - a.y, b.x - a.x), offset = model.edges.slice(0, index).filter(other => other.from === edge.from && other.to === edge.to).length * 12;
    const x1 = a.x + Math.cos(angle) * 23, y1 = a.y + Math.sin(angle) * 23 + offset, x2 = b.x - Math.cos(angle) * 25, y2 = b.y - Math.sin(angle) * 25 + offset;
    return `<g data-dgm-edge="${index}"><path d="M ${format(x1)} ${format(y1)} L ${format(x2)} ${format(y2)}" fill="none" stroke="${color}" stroke-width="2" ${dash} ${edge.directed ? `marker-end="url(#${id})"` : ''}/>${edge.weight ? textSvg((x1 + x2) / 2, (y1 + y2) / 2 - 7, edge.weight, 'text-anchor="middle" fill="var(--muted)" font-size="12"') : ''}</g>`;
  }).join('');
  const nodes = [...model.nodes.values()].map(node => { const p = points.get(node.id); return `<g data-dgm-node="${escape(node.id)}"><circle cx="${format(p.x)}" cy="${format(p.y)}" r="23" fill="var(--card)" stroke="${node.color || 'var(--accent)'}" stroke-width="2.5"/>${textSvg(p.x, p.y + 5, node.label || node.id, 'text-anchor="middle" fill="var(--text)" font-size="13" font-weight="650"')}</g>`; }).join('');
  return svg(model, edges + nodes, width, height, defs);
}
registerDiagram('graph', { parse: parseGraph, render: drawGraph, serialize: model => model.source });

function parsePlot(text) {
  const model = markup(text, (m, line, at) => {
    m.curves ||= []; m.points ||= []; m.verticals ||= []; m.areas ||= []; m.params ||= []; m.tangents ||= [];
    if (line === 'plot') return;
    if (/^x:\s*/.test(line)) { const x = /x:\s*(-?[\d.]+)\.\.(-?[\d.]+)/.exec(line), y = /y:\s*(-?[\d.]+)\.\.(-?[\d.]+)/.exec(line); if (!x) lineError(at, 'неверный диапазон x'); m.x = [number(x[1], -5), number(x[2], 5)]; if (y) m.y = [number(y[1], -3), number(y[2], 3)]; m.grid = /\bgrid\b/.test(line); return; }
    const styled = styleOf(line);
    const param = /^\(\s*(.+?)\s*,\s*(.+?)\s*\)\s+t:\s*(.+?)\.\.(.+)$/.exec(styled.line);
    if (param) { try { m.params.push({ xExpr: param[1], yExpr: param[2], fromExpr: param[3], toExpr: param[4], xFn: parseExpression(param[1]), yFn: parseExpression(param[2]), from: parseExpression(param[3])({}), to: parseExpression(param[4])({}), color: styled.color }); } catch (error) { lineError(at, error.message); } return; }
    const point = /^point\s*\(\s*([^,]+),\s*([^)]*)\)\s*(?:"([^"]*)")?$/i.exec(styled.line);
    if (point) { m.points.push({ x: number(point[1]), y: number(point[2]), label: point[3] || '' }); return; }
    const vertical = /^x\s*=\s*(.+)$/.exec(styled.line);
    if (vertical) { m.verticals.push({ x: number(vertical[1]), color: styled.color, dashed: styled.dashed }); return; }
    const area = /^area\s+y\s*=\s*(.+)\s+from\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)$/i.exec(styled.line);
    if (area) { try { m.areas.push({ expr: area[1], fn: parseExpression(area[1]), from: number(area[2]), to: number(area[3]) }); } catch (error) { lineError(at, error.message); } return; }
    const tangent = /^tangent\s+y\s*=\s*(.+)\s+at\s+(-?[\d.]+)$/i.exec(styled.line);
    if (tangent) { try { m.tangents.push({ expr: tangent[1], fn: parseExpression(tangent[1]), at: number(tangent[2]), color: styled.color }); } catch (error) { lineError(at, error.message); } return; }
    const curve = /^y\s*=\s*(.+)$/.exec(styled.line);
    if (curve) { try { m.curves.push({ expr: curve[1], fn: parseExpression(curve[1]), color: styled.color, dashed: styled.dashed, label: styled.label }); } catch (error) { lineError(at, error.message); } return; }
    lineError(at, 'неизвестная команда графика');
  });
  model.curves ||= []; model.points ||= []; model.verticals ||= []; model.areas ||= []; model.params ||= []; model.tangents ||= [];
  model.x ||= [-5, 5]; model.y ||= [-3, 3];
  if (model.x[0] >= model.x[1] || model.y[0] >= model.y[1]) throw new Error('Диапазон осей должен возрастать');
  if ((model.curves.length + model.params.length + model.areas.length) * 240 > 4000) throw new Error('Слишком много точек графика');
  return model;
}
function drawPlot(model) {
  const width = size(model.width, 640), height = size(model.height, 360), p = 42, id = `dgm-clip-${hash(model.source)}`;
  const X = x => p + (x - model.x[0]) / (model.x[1] - model.x[0]) * (width - 2 * p), Y = y => height - p - (y - model.y[0]) / (model.y[1] - model.y[0]) * (height - 2 * p);
  let body = '';
  if (model.grid) for (let i = 0; i <= 10; i++) { const x = p + i / 10 * (width - 2 * p), y = p + i / 10 * (height - 2 * p); body += `<path d="M${format(x)} ${p}V${height - p} M${p} ${format(y)}H${width - p}" stroke="var(--border)" stroke-width="1"/>`; }
  body += `<path d="M${p} ${format(Y(0))}H${width - p} M${format(X(0))} ${p}V${height - p}" stroke="var(--muted)" stroke-width="1.5"/>`;
  for (let i = 0; i <= 4; i++) { const vx = model.x[0] + (model.x[1] - model.x[0]) * i / 4, vy = model.y[0] + (model.y[1] - model.y[0]) * i / 4; body += textSvg(X(vx), height - 12, format(vx), 'text-anchor="middle" fill="var(--muted)" font-size="11"') + textSvg(8, Y(vy) + 4, format(vy), 'fill="var(--muted)" font-size="11"'); }
  for (const [i, curve] of model.curves.entries()) {
    let path = '', previous = null;
    for (let j = 0; j <= 240; j++) {
      const x = model.x[0] + (model.x[1] - model.x[0]) * j / 240, y = curve.fn({ x });
      if (!Number.isFinite(y) || Math.abs(y) > 1e6 || (previous !== null && Math.abs(y - previous) > (model.y[1] - model.y[0]) * 2)) { previous = null; continue; }
      path += `${previous === null ? 'M' : 'L'}${format(X(x))} ${format(Y(y))} `; previous = y;
    }
    body += `<path d="${path}" fill="none" stroke="${curve.color || palette[i % palette.length]}" stroke-width="2.5" ${curve.dashed ? 'stroke-dasharray="6 5"' : ''} clip-path="url(#${id})"/>`;
    if (curve.label) body += textSvg(width - p - 8, p + 20 + i * 18, curve.label, `text-anchor="end" fill="${curve.color || palette[i % palette.length]}" font-size="12"`);
  }
  for (const [i, param] of model.params.entries()) {
    let path = '', previous = null;
    for (let j = 0; j <= 240; j++) {
      const t = param.from + (param.to - param.from) * j / 240, x = param.xFn({ t }), y = param.yFn({ t });
      if (!Number.isFinite(x) || !Number.isFinite(y) || previous && Math.hypot(x - previous.x, y - previous.y) > Math.max(model.x[1] - model.x[0], model.y[1] - model.y[0])) { previous = null; continue; }
      path += `${previous ? 'L' : 'M'}${format(X(x))} ${format(Y(y))} `; previous = { x, y };
    }
    body += `<path d="${path}" fill="none" stroke="${param.color || palette[(i + model.curves.length) % palette.length]}" stroke-width="2.5" clip-path="url(#${id})"/>`;
  }
  for (const tangent of model.tangents) {
    const x = tangent.at, y = tangent.fn({ x }), delta = .001, slope = (tangent.fn({ x: x + delta }) - tangent.fn({ x: x - delta })) / (delta * 2);
    if (Number.isFinite(y) && Number.isFinite(slope)) body += `<path d="M${format(X(model.x[0]))} ${format(Y(y + slope * (model.x[0] - x)))} L${format(X(model.x[1]))} ${format(Y(y + slope * (model.x[1] - x)))}" fill="none" stroke="${tangent.color || 'var(--accent)'}" stroke-dasharray="6 5" stroke-width="1.5" clip-path="url(#${id})"/>`;
  }
  for (const area of model.areas) {
    let path = `M${format(X(area.from))} ${format(Y(0))} `;
    for (let j = 0; j <= 100; j++) { const x = area.from + (area.to - area.from) * j / 100, y = area.fn({ x }); if (Number.isFinite(y)) path += `L${format(X(x))} ${format(Y(y))} `; }
    path += `L${format(X(area.to))} ${format(Y(0))} Z`;
    body += `<path d="${path}" fill="var(--accent)" opacity=".16" clip-path="url(#${id})"/>`;
  }
  model.verticals.forEach(line => { body += `<path d="M${format(X(line.x))} ${p}V${height - p}" stroke="${line.color || 'var(--accent)'}" ${line.dashed ? 'stroke-dasharray="5 5"' : ''} stroke-width="2"/>`; });
  model.points.forEach(point => { body += `<circle cx="${format(X(point.x))}" cy="${format(Y(point.y))}" r="5" fill="var(--accent)"/>${point.label ? textSvg(X(point.x) + 8, Y(point.y) - 8, point.label, 'fill="var(--text)" font-size="12"') : ''}`; });
  return svg(model, body, width, height, `<clipPath id="${id}"><rect x="${p}" y="${p}" width="${width - p * 2}" height="${height - p * 2}"/></clipPath>`);
}
registerDiagram('plot', { parse: parsePlot, render: drawPlot, serialize: model => model.source });

function parseChart(text) {
  const model = markup(text, (m, line, at) => {
    m.rows ||= []; m.type ||= 'bar';
    if (/^chart(?:\s+\w+)?$/.test(line)) { m.type = line.split(/\s+/)[1] || 'bar'; if (!['bar', 'line', 'pie', 'scatter'].includes(m.type)) lineError(at, 'неизвестный тип диаграммы'); return; }
    if (/^series:\s*/.test(line)) { m.series = line.slice(7).split('|').map(part => part.trim()); return; }
    if (line.includes('|')) { const [label, ...values] = line.split('|').map(part => part.trim()); if (!values.length || values.some(value => !Number.isFinite(Number(value)))) lineError(at, 'в таблице ожидаются числа'); m.rows.push({ label, values: values.map(Number) }); return; }
    const row = /^(.+?):\s*(-?\d+(?:\.\d+)?)$/.exec(line);
    if (row) { m.rows.push({ label: row[1], values: [Number(row[2])] }); return; }
    lineError(at, 'ожидалась строка «Название: число»');
  });
  model.rows ||= []; model.type ||= 'bar';
  if (model.rows.length > 100) throw new Error('Слишком много строк диаграммы');
  if (model.rows.some(row => row.values.length > 8)) throw new Error('Допустимо не больше восьми серий');
  return model;
}
function drawChart(model) {
  const width = size(model.width, 640), height = size(model.height, 360), rows = model.rows, max = Math.max(1, ...rows.flatMap(row => row.values.map(Math.abs))), bottom = height - 48;
  if (!rows.length) return svg(model, textSvg(width / 2, height / 2, 'Нет данных', 'text-anchor="middle" fill="var(--muted)"'), width, height);
  let body = '';
  if (model.type === 'pie') {
    const total = rows.reduce((sum, row) => sum + Math.max(0, row.values[0]), 0) || 1; let angle = -Math.PI / 2;
    rows.forEach((row, i) => { const next = angle + Math.max(0, row.values[0]) / total * 2 * Math.PI, r = Math.min(width, height) * .32, cx = width * .34, cy = height / 2; if (next > angle) body += `<path d="M${format(cx)} ${format(cy)} L${format(cx + r * Math.cos(angle))} ${format(cy + r * Math.sin(angle))} A${format(r)} ${format(r)} 0 ${next - angle > Math.PI ? 1 : 0} 1 ${format(cx + r * Math.cos(next))} ${format(cy + r * Math.sin(next))} Z" fill="${palette[i % palette.length]}"/>`; angle = next; body += `<rect x="${format(width * .68)}" y="${35 + i * 22}" width="10" height="10" fill="${palette[i % palette.length]}"/>${textSvg(width * .68 + 17, 44 + i * 22, `${row.label}: ${row.values[0]}`, 'fill="var(--text)" font-size="12"')}`; });
  } else {
    body += `<path d="M42 26V${bottom}H${width - 18}" fill="none" stroke="var(--muted)"/>`;
    const seriesCount = Math.max(1, ...rows.map(row => row.values.length)), step = (width - 75) / rows.length;
    rows.forEach((row, i) => {
      const x = 46 + i * step;
      row.values.forEach((value, j) => {
        const y = bottom - value / max * (height - 100), color = palette[j % palette.length];
        if (model.type === 'bar') body += `<rect x="${format(x + step * .1 + j * step * .8 / seriesCount)}" y="${format(Math.min(y, bottom))}" width="${format(step * .8 / seriesCount)}" height="${format(Math.abs(bottom - y))}" rx="4" fill="${color}"/>`;
        else if (model.type !== 'scatter') body += `<circle cx="${format(x + step / 2)}" cy="${format(y)}" r="4" fill="${color}"/>`;
        if (model.type === 'bar') body += textSvg(x + step * (.1 + (j + .5) * .8 / seriesCount), Math.min(y, bottom) - 6, value, 'text-anchor="middle" fill="var(--text)" font-size="10"');
      });
      body += textSvg(x + step / 2, bottom + 19, row.label, 'text-anchor="middle" fill="var(--muted)" font-size="11"');
    });
    if (model.type === 'line') for (let j = 0; j < seriesCount; j++) body += `<path d="${rows.map((row, i) => { const value = row.values[j]; if (!Number.isFinite(value)) return ''; return `${i ? 'L' : 'M'}${format(46 + i * step + step / 2)} ${format(bottom - value / max * (height - 100))}`; }).join(' ')}" fill="none" stroke="${palette[j % palette.length]}" stroke-width="2"/>`;
    if (model.type === 'scatter') rows.forEach((row, i) => { const x = row.values.length > 1 ? row.values[0] : i, y = row.values.length > 1 ? row.values[1] : row.values[0]; body += `<circle cx="${format(46 + x / max * (width - 95))}" cy="${format(bottom - y / max * (height - 100))}" r="5" fill="${palette[i % palette.length]}"/>`; });
    if (seriesCount > 1 && model.type !== 'scatter') for (let j = 0; j < seriesCount; j++) body += `<rect x="${width - 105}" y="${25 + j * 18}" width="9" height="9" fill="${palette[j % palette.length]}"/>${textSvg(width - 92, 34 + j * 18, model.series?.[j] || `Серия ${j + 1}`, 'fill="var(--muted)" font-size="11"')}`;
  }
  return svg(model, body, width, height);
}
registerDiagram('chart', { parse: parseChart, render: drawChart, serialize: model => model.source });

function parseArray(text) {
  const model = markup(text, (m, line, at) => {
    if (/^array(?:\s+(linked|stack|queue))?$/.test(line)) { m.variant = line.split(/\s+/)[1] || 'array'; return; }
    const values = /^\[([^\]]*)\]/.exec(line);
    if (!values) lineError(at, 'ожидался массив [значения]');
    m.values = values[1].split(',').map(item => item.trim());
    m.pointers = [...line.matchAll(/\b([ij])=(\d+)/g)].map(match => ({ name: match[1], index: Number(match[2]) }));
    m.highlight = (/(?:highlight):\s*([\d,\s]+)/.exec(line)?.[1] || '').split(',').map(Number);
    m.sorted = Number(/sorted:\s*(\d+)/.exec(line)?.[1] ?? -1);
  });
  model.values ||= []; model.pointers ||= []; model.highlight ||= []; model.variant ||= 'array';
  if (model.values.length > 100) throw new Error('Массив слишком длинный');
  return model;
}
function drawArray(model) {
  const width = size(model.width, Math.max(400, model.values.length * 65 + 60)), height = size(model.height, model.variant === 'stack' ? Math.max(220, model.values.length * 58 + 60) : 180), cell = Math.min(68, (width - 40) / Math.max(model.values.length, 1)), start = (width - cell * model.values.length) / 2;
  let body = '';
  model.values.forEach((value, i) => { const x = model.variant === 'stack' ? width / 2 - 35 : start + i * cell, y = model.variant === 'stack' ? height - 58 * (i + 1) : 64, w = model.variant === 'stack' ? 70 : cell, color = model.highlight.includes(i) ? 'var(--accent)' : i <= model.sorted ? '#42a592' : 'var(--border)'; body += `<rect x="${format(x)}" y="${format(y)}" width="${format(w)}" height="54" fill="var(--card)" stroke="${color}" stroke-width="2"/>${textSvg(x + w / 2, y + 33, value, 'text-anchor="middle" fill="var(--text)" font-size="17"')}${model.variant === 'stack' ? '' : textSvg(x + w / 2, y + 75, i, 'text-anchor="middle" fill="var(--muted)" font-size="11"')}`; if (model.variant === 'linked' && i < model.values.length - 1) body += textSvg(x + w - 5, y + 31, '→', 'fill="var(--accent)" font-size="16"'); });
  model.pointers.forEach((pointer, i) => { body += textSvg(start + (pointer.index + .5) * cell, 50 - i * 19, `${pointer.name} ↓`, 'text-anchor="middle" fill="var(--accent)" font-size="12"'); });
  if (model.variant === 'queue') body += textSvg(start, 32, 'начало →', 'fill="var(--accent)" font-size="12"') + textSvg(width - start, 32, '← конец', 'text-anchor="end" fill="var(--accent)" font-size="12"');
  return svg(model, body, width, height);
}
registerDiagram('array', { parse: parseArray, render: drawArray, serialize: model => model.source });

function parseTree(text) {
  const model = markup(text, (m, line, at, original) => {
    m.nodes ||= [];
    if (line === 'tree') return;
    const depth = Math.floor((original.match(/^\s*/)?.[0].length || 0) / 2), label = line.replace(/^-\s*/, '');
    if (depth > 25 || !label) lineError(at, 'неверный уровень дерева');
    const parent = depth ? [...m.nodes].reverse().find(node => node.depth === depth - 1) : null;
    if (depth && !parent) lineError(at, 'нет родительской вершины');
    m.nodes.push({ label, depth, parent: parent ? m.nodes.indexOf(parent) : -1 });
  });
  model.nodes ||= [];
  if (model.nodes.length > 500) throw new Error('Слишком большое дерево');
  return model;
}
function drawTree(model) {
  const width = size(model.width, 640), height = size(model.height, Math.max(280, 90 + Math.max(0, ...model.nodes.map(node => node.depth)) * 100)), depths = new Map(), points = [];
  model.nodes.forEach((node, i) => { const list = depths.get(node.depth) || []; list.push(i); depths.set(node.depth, list); });
  model.nodes.forEach((node, i) => { const list = depths.get(node.depth), slot = list.indexOf(i); points[i] = { x: width * (slot + 1) / (list.length + 1), y: 55 + node.depth * 90 }; });
  const lines = model.nodes.map((node, i) => node.parent < 0 ? '' : `<line x1="${format(points[node.parent].x)}" y1="${format(points[node.parent].y + 21)}" x2="${format(points[i].x)}" y2="${format(points[i].y - 21)}" stroke="var(--border)" stroke-width="2"/>`).join('');
  const nodes = model.nodes.map((node, i) => `<circle cx="${format(points[i].x)}" cy="${format(points[i].y)}" r="22" fill="var(--card)" stroke="var(--accent)" stroke-width="2"/>${textSvg(points[i].x, points[i].y + 5, node.label, 'text-anchor="middle" fill="var(--text)" font-size="13"')}`).join('');
  return svg(model, lines + nodes, width, height);
}
registerDiagram('tree', { parse: parseTree, render: drawTree, serialize: model => model.source });

function parseFlow(text) {
  const model = markup(text, (m, line, at) => {
    m.nodes ||= new Map(); m.edges ||= [];
    if (line === 'diagram') return;
    const edge = /^([^\s]+)\s*->\s*([^\s:]+)(?:\s*:\s*(.+))?$/.exec(line);
    if (edge) { m.edges.push({ from: edge[1], to: edge[2], label: edge[3] || '' }); return; }
    const node = /^([^\s:]+)\s*:\s*(box|round|diamond|circle|db|note)\s*(?:"([^"]*)")?(?:\s*@\s*(-?[\d.]+),\s*(-?[\d.]+))?$/.exec(line);
    if (node) { m.nodes.set(node[1], { id: node[1], shape: node[2], label: node[3] || node[1], x: node[4] == null ? null : number(node[4]), y: node[5] == null ? null : number(node[5]) }); return; }
    lineError(at, 'ожидался узел «A: box "Текст"» или стрелка «A -> B»');
  });
  model.nodes ||= new Map(); model.edges ||= [];
  if (model.nodes.size + model.edges.length > 500) throw new Error('Слишком большая схема');
  for (const edge of model.edges) if (!model.nodes.has(edge.from) || !model.nodes.has(edge.to)) throw new Error('Стрелка указывает на неизвестный узел');
  return model;
}
function drawFlow(model) {
  const width = size(model.width, 640), height = size(model.height, 360), nodes = [...model.nodes.values()], positions = new Map(), marker = `dgm-flow-arrow-${hash(model.source)}`;
  nodes.forEach((node, i) => positions.set(node.id, { x: node.x ?? width * ((i % 3) + 1) / (Math.min(3, nodes.length) + 1), y: node.y ?? height * (Math.floor(i / 3) + 1) / (Math.ceil(nodes.length / 3) + 1) }));
  const defs = `<marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="var(--accent)"/></marker>`;
  const arrows = model.edges.map(edge => { const a = positions.get(edge.from), b = positions.get(edge.to); return `<line x1="${format(a.x)}" y1="${format(a.y + 28)}" x2="${format(b.x)}" y2="${format(b.y - 34)}" stroke="var(--accent)" stroke-width="2" marker-end="url(#${marker})"/>${edge.label ? textSvg((a.x + b.x) / 2, (a.y + b.y) / 2 - 8, edge.label, 'text-anchor="middle" fill="var(--muted)" font-size="11"') : ''}`; }).join('');
  const shapes = nodes.map(node => { const p = positions.get(node.id), x = format(p.x), y = format(p.y); let shape;
    if (node.shape === 'diamond') shape = `<path d="M${x} ${y - 33} L${p.x + 66} ${y} L${x} ${p.y + 33} L${p.x - 66} ${y} Z"/>`;
    else if (node.shape === 'circle') shape = `<circle cx="${x}" cy="${y}" r="33"/>`;
    else shape = `<rect x="${format(p.x - 65)}" y="${format(p.y - 28)}" width="130" height="56" rx="${node.shape === 'round' ? 25 : 9}"/>`;
    return `<g data-dgm-node="${escape(node.id)}"><g fill="var(--card)" stroke="var(--accent)" stroke-width="2">${shape}</g>${textSvg(p.x, p.y + 5, node.label, 'text-anchor="middle" fill="var(--text)" font-size="12"')}</g>`;
  }).join('');
  return svg(model, arrows + shapes, width, height, defs);
}
registerDiagram('diagram', { parse: parseFlow, render: drawFlow, serialize: model => model.source });

function parseCanvas(text) {
  const model = markup(text, (m, line, at) => {
    m.shapes ||= [];
    const header = /^canvas(?:\s+(\d+)x(\d+))?$/.exec(line);
    if (header) { if (header[1]) { m.width = size(header[1], 400); m.height = size(header[2], 200); } return; }
    const quoted = /"([^"]*)"/.exec(line), label = quoted?.[1] || '', clean = line.replace(/"[^"]*"/, '').trim(), parts = clean.split(/\s+/), type = parts.shift();
    if (!['rect', 'circle', 'ellipse', 'line', 'arrow', 'path', 'text'].includes(type)) lineError(at, 'неизвестная фигура');
    const color = /(?:fill|color)=(#[0-9a-fA-F]{3,6}|[a-z]+)/.exec(clean)?.[1];
    m.shapes.push({ type, parts, label, color: color ? safeColor(color) : '' });
    if (m.shapes.length > 500) lineError(at, 'слишком много фигур');
  });
  model.shapes ||= []; return model;
}
function drawCanvas(model) {
  const width = size(model.width, 400), height = size(model.height, 200), marker = `dgm-canvas-arrow-${hash(model.source)}`;
  const defs = `<marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="var(--accent)"/></marker>`;
  const body = model.shapes.map(shape => {
    const p = shape.parts, x = number(p[0]), y = number(p[1]), fill = shape.color || 'var(--accent)', label = shape.label;
    if (shape.type === 'rect') return `<rect x="${x}" y="${y}" width="${number(p[2])}" height="${number(p[3])}" rx="8" fill="${fill}" opacity=".18" stroke="${fill}" stroke-width="2"/>${label ? textSvg(x + number(p[2]) / 2, y + number(p[3]) / 2 + 4, label, 'text-anchor="middle" fill="var(--text)" font-size="13"') : ''}`;
    if (shape.type === 'circle') { const radius = number((/r=([\d.]+)/.exec(p.join(' ')) || [])[1], 25); return `<circle cx="${x}" cy="${y}" r="${radius}" fill="var(--card)" stroke="${fill}" stroke-width="2"/>${label ? textSvg(x, y + 5, label, 'text-anchor="middle" fill="var(--text)" font-size="13"') : ''}`; }
    if (shape.type === 'ellipse') return `<ellipse cx="${x}" cy="${y}" rx="${number(p[2])}" ry="${number(p[3])}" fill="var(--card)" stroke="${fill}" stroke-width="2"/>${label ? textSvg(x, y + 5, label, 'text-anchor="middle" fill="var(--text)" font-size="13"') : ''}`;
    if (shape.type === 'line' || shape.type === 'arrow') { const tx = number(p[p[2] === '->' ? 3 : 2]), ty = number(p[p[2] === '->' ? 4 : 3]); return `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${fill}" stroke-width="2" ${shape.type === 'arrow' ? `marker-end="url(#${marker})"` : ''}/>`; }
    if (shape.type === 'text') return textSvg(x, y, label || p.slice(2).join(' '), `fill="${fill}" font-size="14"`);
    const path = p.join(' ').replace(/(?:fill|color)=\S+/g, '').trim();
    if (!/^[MmLlHhVvCcQqZz0-9.,\s-]+$/.test(path)) throw new Error('Путь содержит недопустимую команду');
    return `<path d="${escape(path)}" fill="none" stroke="${fill}" stroke-width="2"/>`;
  }).map((item, index) => `<g data-dgm-shape="${index}">${item}</g>`).join('');
  return svg(model, body, width, height, defs);
}
registerDiagram('canvas', { parse: parseCanvas, render: drawCanvas, serialize: model => model.source });
