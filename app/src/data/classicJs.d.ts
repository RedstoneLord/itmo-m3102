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
