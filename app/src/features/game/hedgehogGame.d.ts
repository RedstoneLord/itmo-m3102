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
  options: { curl?: number; run?: number; hat?: string; blink?: number; leg?: number },
): void;
