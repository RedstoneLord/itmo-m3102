import { expect, it } from 'vitest';
import { fitView, startView, zoomAt } from './DiagramViewer';

it('масштаб вокруг точки: точка под курсором остаётся на месте', () => {
  const view = { x: 40, y: 20, k: 1 };
  const next = zoomAt(view, 2, 140, 120);
  expect(next.k).toBe(2);
  // Точка схемы под курсором до: ((140 - 40) / 1, (120 - 20) / 1) — после должна быть там же
  expect((140 - next.x) / next.k).toBeCloseTo(100);
  expect((120 - next.y) / next.k).toBeCloseTo(100);
});

it('масштаб не выходит за пределы', () => {
  expect(zoomAt({ x: 0, y: 0, k: 7 }, 5, 0, 0).k).toBe(8);
  expect(zoomAt({ x: 0, y: 0, k: 0.2 }, 0.1, 0, 0).k).toBe(0.1);
});

it('вписывание: широкая схема сжимается по ширине, мелкая растёт не больше чем вдвое, обе по центру', () => {
  const wide = fitView(2000, 400, 1000, 600);
  expect(wide.k).toBeCloseTo((1000 - 48) / 2000);
  expect(wide.x).toBeCloseTo(24);
  const small = fitView(100, 50, 1000, 600);
  expect(small.k).toBe(2);
  expect(small.x).toBeCloseTo((1000 - 200) / 2);
  expect(small.y).toBeCloseTo((600 - 100) / 2);
});

it('начальный вид: на компьютере схема целиком, на телефоне широкая — крупнее с левого края', () => {
  expect(startView(1395, 246, 1400, 800)).toEqual(fitView(1395, 246, 1400, 800));
  const phone = startView(1395, 246, 335, 600);
  expect(phone.k).toBe(0.7);
  expect(phone.x).toBe(24);
  // Узкая высокая схема на телефоне и так вписывается крупно — не трогаем
  expect(startView(300, 600, 335, 600)).toEqual(fitView(300, 600, 335, 600));
});
