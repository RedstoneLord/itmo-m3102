// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountStudyFigures, printStudyFigures, studyFigure } from './classic';
import { geometrySvg, parseGeometry } from './geometry';
import { matrixSvg, parseMatrix } from './matrix';
import { mountStudyDiagram, studyArt } from './player';
import { studyTypes } from './source';

describe('Пошаговые матрицы', () => {
  it('воспроизводит вычисление матрицы перехода из лекции', () => {
    const model = parseMatrix(studyTypes.matrix.template);
    expect(model.frames.map(({ rows }) => rows)).toEqual([
      [
        ['1', '1', '3', '2'],
        ['2', '3', '7', '1'],
      ],
      [
        ['1', '1', '3', '2'],
        ['0', '1', '1', '-3'],
      ],
      [
        ['1', '0', '2', '5'],
        ['0', '1', '1', '-3'],
      ],
    ]);
    expect(model.printIndex).toBe(2);
  });

  it('считает дроби точно для всех столбцов и умеет менять строки местами', () => {
    const model = parseMatrix('1/3 | 2/3\n1/6 | 5/6\nswap 1 2\nscale 1 3\nadd 2 1 -2/3');
    expect(model.frames[3]?.rows).toEqual([
      ['1/2', '5/2'],
      ['0', '-1'],
    ]);
    expect(model.frames[1]?.affected).toEqual([0, 1]);
  });

  it('отличает границу правой части и экранирует символические ячейки', () => {
    const model = parseMatrix('columns: Базисные | Свободные | Правая часть\nrhs: last\npivots: 1\n1 | <a> | 0');
    expect(model.boundaries).toEqual([1, 2]);
    expect(model.rhs).toBe(2);
    expect(matrixSvg(model, 0)).toContain('stroke-width="2.6"');
    expect(matrixSvg(model, 0)).toContain('&lt;a&gt;');
  });

  it.each([
    ['1 | 2\n3 4', 'Строка 2: число ячеек и границы'],
    ['1\nscale 2 1', 'Строка 2: номер строки'],
    ['1\nscale 1 0', 'Строка 2: множитель'],
    ['1\nscale 1 1/0', 'Строка 2: знаменатель'],
    ['1\nprint: 3', 'Строка 2: кадр печати'],
  ])('возвращает ошибку около неправильной строки', (source, error) => {
    expect(() => parseMatrix(source)).toThrow(error);
  });

  it('листит кадры, а в печати показывает выбранный автором', () => {
    const container = document.createElement('div');
    container.innerHTML = studyFigure('matrix', studyTypes.matrix.template);
    mountStudyFigures(container);
    const click = (action: string) => container.querySelector<HTMLButtonElement>(`[data-study-action="${action}"]`)!.click();
    const current = () => container.querySelector('[data-study-current]')?.getAttribute('aria-label');
    expect(current()).toBe('1, 1, 3, 2. 2, 3, 7, 1');
    click('next');
    click('next');
    expect(current()).toBe('1, 0, 2, 5. 0, 1, 1, -3');
    click('previous');
    expect(current()).toBe('1, 1, 3, 2. 0, 1, 1, -3');
    click('first');
    expect(current()).toBe('1, 1, 3, 2. 2, 3, 7, 1');
    printStudyFigures(container);
    expect(container.querySelector('.study-print svg')?.getAttribute('aria-label')).toBe('1, 0, 2, 5. 0, 1, 1, -3');
  });
});

describe('3D-геометрия', () => {
  it('проецирует плоскость с ребра и сохраняет высоту выходящего из неё вектора', () => {
    const model = parseGeometry(studyTypes.geometry3d.template);
    const edge = geometrySvg(model, { yaw: 0, pitch: 0, zoom: 1 }, true);
    expect(edge).toContain('<polyline');
    expect(edge).not.toContain('<polygon');
    const svg = new DOMParser().parseFromString(edge, 'image/svg+xml').documentElement;
    const vector = (color: string) =>
      svg
        .querySelector(`path[stroke="var(--study-${color})"]`)!
        .getAttribute('d')!
        .match(/-?[\d.]+/g)!
        .map(Number);
    const [, planeStart, , planeEnd] = vector('blue');
    const [x, y, tipX, tipY] = vector('purple') as [number, number, number, number];
    expect(planeEnd).toBe(planeStart);
    expect(y - tipY).toBeGreaterThan(80);
    expect((y - tipY) / (tipX - x)).toBeCloseTo(2, 2);
    expect(geometrySvg(model, { yaw: 0, pitch: 90, zoom: 1 }, true)).toContain('<polygon');
  });

  it('рисует нулевой вектор точкой и отклоняет зависимые направления плоскости', () => {
    const model = parseGeometry('axes: off\nvector 1 2 3 -> 1 2 3 "0"');
    const image = geometrySvg(model, model.view, true);
    expect(image).toContain('<circle');
    expect(image).not.toContain('<path');
    expect(() => parseGeometry('title: Плоскость\nplane 0 0 0 | 1 2 3 | -2 -4 -6')).toThrow('Строка 2: укажите два независимых');
  });

  it('поворачивает с клавиатуры, сбрасывает вид и сохраняет плоскость для печати', () => {
    const model = parseGeometry(studyTypes.geometry3d.template);
    const container = document.createElement('div');
    container.innerHTML = studyArt(model);
    const dispose = mountStudyDiagram(container, model);
    const svg = () => container.querySelector('[data-study-current]')!.innerHTML;
    const initial = svg();
    container.querySelector('[data-study-stage]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(svg()).not.toBe(initial);
    container.querySelector<HTMLButtonElement>('[data-study-action="reset"]')!.click();
    expect(svg()).toBe(initial);
    const plane = container.querySelector<HTMLInputElement>('[data-study-plane]')!;
    plane.checked = false;
    plane.dispatchEvent(new Event('change'));
    expect(svg()).not.toContain('<polygon');
    expect(container.querySelector('.study-print polygon')).toBeTruthy();
    dispose();
  });
});
