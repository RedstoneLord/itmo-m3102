/** Типы для перенесённой игры (сам код — обычный JS, см. hedgehogGame.js) */
export const HedgehogGame: {
  /** Рисует игру в container; возвращает функцию остановки (снимает обработчики, сохраняет прогресс) */
  mount(container: HTMLElement, opts?: { onBack?: () => void }): () => void;
};

/** Шляпа из магазина игры: цена в ягодах, secret — не показывается, пока не получена */
export interface GameHat {
  id: string;
  name: string;
  cost: number;
  secret?: boolean;
  perk?: string;
}
export const HATS: GameHat[];
/** Рисует ёжика с центром в (0, 0) (профиль, мордой вправо) радиусом R; hat — id шляпы */
export function drawHog(
  ctx: CanvasRenderingContext2D,
  radius: number,
  /** roll — угол клубка, рад; sleepy — 1: глаза закрыты */
  options: { curl?: number; run?: number; hat?: string; blink?: number; leg?: number; roll?: number; sleepy?: number },
): void;

/** Препятствие игры в (o.x, T.y(o.x)) — камень, бревно, улитка, лужа; T — рельеф (высота и наклон), pal.night — 0 днём */
export function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obstacle: { kind: 'rock' | 'log' | 'snail' | 'puddle'; x: number; wob?: number; ph?: number; w?: number },
  terrain: { y(x: number): number; angle(x: number): number },
  palette: { night: number },
  clock: number,
): void;
/** Угощение или бонус игры в (k.x, k.y) с покачиванием */
export function drawPickup(
  ctx: CanvasRenderingContext2D,
  pickup: { kind: 'apple' | 'berry' | 'mush' | 'flower'; x: number; y: number; ph?: number },
  clock: number,
): void;
