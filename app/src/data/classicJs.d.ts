/** Типы для файлов классической версии, которые приложение читает при сборке (сами файлы не меняем) */
declare module '*/js/greetings.js' {
  export const GREETINGS: string[];
  export const GREETING_PACKS: Record<string, string[]>;
}

declare module '*/js/rewards.js' {
  interface QuizEntry {
    ok: boolean;
    valid: boolean;
  }
  export function trackReading(path: string, body: HTMLElement): void;
  export const quizReward: {
    quizId(questions: { q: string }[]): string;
    attempt(id: string, question: { q: string }, ok: boolean, ms: number): QuizEntry | null;
    settle(fresh: unknown[]): { berries: number; html: string } | null;
  };
}

/** Страницы казино группы: каждая рисует себя в элемент #content и регистрирует очистку в window.__hhDestroy */
declare module '*/js/casino.js' {
  export function renderCasinoPage(): void;
}
declare module '*/js/blackjack.js' {
  export function renderBlackjackPage(): void;
}
declare module '*/js/roulette.js' {
  export function renderRoulettePage(): void;
}
declare module '*/js/casino-collection.js' {
  export function renderCollectionPage(): void;
}
declare module '*/js/slots.js' {
  export function renderSlotsPage(): void;
}
declare module '*/js/casino-themes.js' {
  export function installCasinoThemes(): void;
  export function decorateCasinoPage(scope?: Element): void;
}
