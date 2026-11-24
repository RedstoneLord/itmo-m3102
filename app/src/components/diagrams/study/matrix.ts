import { escapeMarkup, lineError, readStudySource } from './source';

type Fraction = readonly [numerator: bigint, denominator: bigint];

function fraction(numerator: bigint, denominator: bigint): Fraction {
  let a = numerator < 0n ? -numerator : numerator;
  let b = denominator < 0n ? -denominator : denominator;
  const sign = denominator < 0n ? -1n : 1n;
  while (b) [a, b] = [b, a % b];
  return [sign * (numerator / a), sign * (denominator / a)];
}

function readFraction(value: string, line: number): Fraction {
  const match = /^([+-]?\d{1,24})(?:\/([+-]?\d{1,24}))?$/.exec(value);
  if (!match) lineError(line, `ожидалось целое число или дробь, получено «${value}»`);
  const denominator = BigInt(match[2] ?? '1');
  if (!denominator) lineError(line, 'знаменатель не может быть нулём');
  return fraction(BigInt(match[1]!), denominator);
}

const format = ([n, d]: Fraction) => (d === 1n ? String(n) : `${n}/${d}`);
const multiply = ([a, b]: Fraction, [c, d]: Fraction) => fraction(a * c, b * d);
const add = ([a, b]: Fraction, [c, d]: Fraction) => fraction(a * d + c * b, b * d);

interface MatrixFrame {
  rows: string[][];
  description: string;
  affected: number[];
}

export function parseMatrix(source: string) {
  const { header, body } = readStudySource(source, 'matrix');
  const rows: { cells: string[]; line: number }[] = [];
  const operations: { text: string; line: number }[] = [];
  let boundaries: number[] = [];
  let columns: string[] = [];
  let pivots: number[] = [];
  let columnLine = 1;
  let pivotLine = 1;
  let rhsLine = 0;
  let print = 'first';
  let printLine = 1;

  for (const { text, line } of body) {
    if (text.startsWith('columns:')) {
      columns = text
        .slice(8)
        .split('|')
        .map((label) => label.trim());
      if (columns.some((label) => !label || label.length > 40)) lineError(line, 'укажите подписи до 40 символов');
      columnLine = line;
    } else if (text.startsWith('pivots:')) {
      const values = text
        .slice(7)
        .trim()
        .split(/[\s,]+/);
      if (values.some((value) => !/^[1-9]\d*$/.test(value))) lineError(line, 'укажите номера столбцов начиная с 1');
      pivots = values.map((value) => Number(value) - 1);
      pivotLine = line;
    } else if (text === 'rhs: last') {
      rhsLine = line;
    } else if (text.startsWith('print:')) {
      print = text.slice(6).trim();
      printLine = line;
    } else if (/^(swap|scale|add)\b/.test(text)) {
      operations.push({ text, line });
      if (operations.length > 100) lineError(line, 'допустимо до 100 операций');
    } else {
      if (operations.length) lineError(line, 'строки матрицы должны идти перед операциями');
      const blocks = text.split('|').map((part) => part.trim().split(/\s+/));
      const cells = blocks.flat();
      if (cells.some((cell) => !cell || cell.length > 24) || cells.length > 20 || rows.length >= 20) {
        lineError(line, 'предел — 20 строк и столбцов, 24 символа в каждой ячейке');
      }
      const splits = blocks.slice(0, -1).map((_, index) => blocks.slice(0, index + 1).flat().length);
      if (!rows.length) boundaries = splits;
      if (rows.length && (cells.length !== rows[0]!.cells.length || String(splits) !== String(boundaries))) {
        lineError(line, 'число ячеек и границы блоков должны совпадать во всех строках');
      }
      rows.push({ cells, line });
    }
  }

  if (!rows.length) lineError(1, 'добавьте хотя бы одну строку матрицы');
  const width = rows[0]!.cells.length;
  if (rhsLine && !boundaries.length) lineError(rhsLine, 'отделите правую часть знаком |');
  if (columns.length && columns.length !== boundaries.length + 1) lineError(columnLine, 'укажите по одной подписи на группу столбцов');
  if (pivots.some((index) => index >= width)) lineError(pivotLine, 'ведущий столбец за пределами матрицы');

  const numeric = operations.length ? rows.map(({ cells, line }) => cells.map((cell) => readFraction(cell, line))) : [];
  const frames: MatrixFrame[] = [
    { rows: numeric.length ? numeric.map((row) => row.map(format)) : rows.map(({ cells }) => cells), description: 'Исходная матрица', affected: [] },
  ];
  for (const { text, line } of operations) {
    const [op, to, from, factorValue, extra] = text.split(/\s+/);
    const rowIndex = (value: string | undefined) => {
      const index = Number(value) - 1;
      if (!value || !/^[1-9]\d*$/.test(value) || index >= rows.length) lineError(line, 'номер строки за пределами матрицы');
      return index;
    };
    const target = rowIndex(to);
    const affected = [target];
    let description: string;
    if (op === 'scale') {
      if (!from || factorValue) lineError(line, 'формат: scale строка множитель');
      const factor = readFraction(from, line);
      if (!factor[0]) lineError(line, 'множитель строки должен быть ненулевым');
      numeric[target] = numeric[target]!.map((entry) => multiply(entry, factor));
      description = `R${to} ← (${format(factor)}) · R${to}`;
    } else {
      const other = rowIndex(from);
      if (other === target) lineError(line, 'укажите разные строки');
      if (op === 'swap') {
        if (factorValue) lineError(line, 'формат: swap строка строка');
        [numeric[target], numeric[other]] = [numeric[other]!, numeric[target]!];
        affected.push(other);
        description = `R${to} ↔ R${from}`;
      } else {
        if (!factorValue || extra) lineError(line, 'формат: add строка другая_строка множитель');
        const factor = readFraction(factorValue, line);
        numeric[target] = numeric[target]!.map((entry, j) => add(entry, multiply(numeric[other]![j]!, factor)));
        description = `R${to} ← R${to} + (${format(factor)}) · R${from}`;
      }
    }
    const display = numeric.map((row) => row.map(format));
    if (display.some((row) => row.some((cell) => cell.length > 50))) lineError(line, 'результат превышает 50 символов в ячейке');
    frames.push({ rows: display, description, affected });
  }

  const printIndex = print === 'last' ? frames.length - 1 : print === 'first' ? 0 : /^\d+$/.test(print) ? Number(print) : -1;
  if (printIndex < 0 || printIndex >= frames.length) lineError(printLine, 'кадр печати вне диапазона');
  return { kind: 'matrix' as const, source, header, columns, boundaries, pivots, rhs: rhsLine ? boundaries.at(-1) : undefined, frames, printIndex };
}

export type MatrixModel = ReturnType<typeof parseMatrix>;

export function matrixSvg(model: MatrixModel, step: number, current = false) {
  const { rows, description, affected } = model.frames[step]!;
  const count = rows[0]!.length;
  const heads = [0, ...model.boundaries, count];
  const width = Array.from({ length: count }, (_, j) => Math.max(48, ...rows.map((row) => row[j]!.length * 9 + 18)));
  model.columns.forEach((label, i) => {
    const from = heads[i]!;
    const to = heads[i + 1]!;
    const missing = label.length * 8 + 16 - width.slice(from, to).reduce((sum, value) => sum + value, 0);
    if (missing > 0) width[to - 1] = width[to - 1]! + missing;
  });
  const x = [35];
  for (const w of width) x.push(x.at(-1)! + w);
  const top = model.columns.length ? 33 : 9;
  const bottom = top + 32 * rows.length;
  const viewWidth = Math.max(x.at(-1)! + 18, model.frames.length > 1 ? description.length * 8 + 24 : 0);
  const height = bottom + (model.frames.length > 1 ? 35 : 10);
  const groups = model.columns
    .map((label, i) => `<text x="${(x[heads[i]!]! + x[heads[i + 1]!]!) / 2}" y="19">${escapeMarkup(label)}</text>`)
    .join('');
  const rules = model.boundaries
    .map((j) => `<line x1="${x[j]}" x2="${x[j]}" y1="${top}" y2="${bottom}"${j === model.rhs ? ' stroke-width="2.6"' : ''}/>`)
    .join('');
  const pivotBands = [...new Set(model.pivots)]
    .map(
      (j) =>
        `<rect x="${x[j]}" y="${top}" width="${width[j]}" height="${bottom - top}" fill="var(--study-blue)" opacity=".14"/><path d="M${x[j]! + 4} ${top + 2}h${width[j]! - 8}" stroke="var(--study-blue)" stroke-width="2"/>`,
    )
    .join('');
  const rowsSvg = rows
    .map((row, i) => {
      const y = top + i * 32;
      const band = affected.includes(i)
        ? `<rect x="${x[0]}" y="${y}" width="${x.at(-1)! - x[0]!}" height="32" fill="var(--study-green)" opacity=".17"/>`
        : '';
      const cells = row.map((cell, j) => `<text x="${x[j]! + width[j]! / 2}" y="${y + 21}">${escapeMarkup(cell)}</text>`).join('');
      return `${band}<text x="16" y="${y + 21}" font-size="12">${i + 1}</text>${cells}`;
    })
    .join('');
  const right = x.at(-1)! + 4;
  const desc = rows.map((row) => row.join(', ')).join('. ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${height}" width="${viewWidth}" height="${height}" ${current ? 'data-study-current' : ''} role="img" aria-label="${escapeMarkup(desc)}"><g font-family="system-ui, sans-serif" font-size="14" text-anchor="middle" fill="var(--study-ink)">${groups}${pivotBands}${rowsSvg}<g stroke="var(--study-ink)" stroke-width="1.4" fill="none"><path d="M${x[0]} ${top}h-6v${bottom - top}h6 M${right - 6} ${top}h6v${bottom - top}h-6"/>${rules}</g>${model.frames.length > 1 ? `<text x="${viewWidth / 2}" y="${bottom + 23}">${escapeMarkup(description)}</text>` : ''}</g></svg>`;
}
