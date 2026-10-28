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
declare module '*/js/slots.js' {
  export function renderSlotsPage(): void;
}
declare module '*/js/casino-themes.js' {
  interface CasinoTheme {
    id: string;
    name: string;
    cls: string;
    skin: string;
    font: string;
    fontDisplay: string;
    vars: Record<string, string>;
  }
  export const THEMES: Record<string, CasinoTheme>;
  /** Оформление предметов (сукно, фишки, рубашки): переменные --ct-*, которые перекрывают тему */
  export const ITEM_STYLES: Record<string, Record<string, string>>;
  export function themeVars(state: unknown): { id: string; theme: CasinoTheme; vars: Record<string, string>; picked: Record<string, string> };
  export function installCasinoThemes(): void;
  export function decorateCasinoPage(scope?: Element): void;
  export function applyCasinoTheme(root: Element, state?: unknown): CasinoTheme | null;
}

/** Математика и общее сохранение казино: нужны странице коллекции (она написана у нас и берёт состояние у тех же модулей) */
declare module '*/js/slots-math.js' {
  export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
  export interface CatalogItem {
    id: string;
    kind: string;
    name: string;
    rarity: Rarity;
    desc: string;
    setOnly: boolean;
  }
  export interface SlotsState {
    album: Record<string, number>;
    ach: Record<string, number>;
    capsules: number;
    free: number;
    streak: number;
    lastDay: string;
    wheelDay: string;
    sinceEpic: number;
    theme: string;
    title: string;
    equip?: Record<string, string>;
    stats: Record<string, number>;
    [key: string]: unknown;
  }
  export interface WheelSegment {
    k: 'b' | 'cap' | 'spin';
    v?: number;
    w: number;
  }
  export const CATALOG: CatalogItem[];
  export const ITEM: Record<string, CatalogItem>;
  export const RARITY: Record<Rarity, { name: string; dup: number; w: number }>;
  export const FREE_ITEMS: string[];
  export const EQUIPPABLE: string[];
  export const DAILY_SPINS: number[];
  export const DAILY_BET: number;
  export const WHEEL: WheelSegment[];
  export function albumProgress(state: SlotsState): { have: number; total: number };
  export function equipItem(state: SlotsState, id: string): boolean;
  export function isEquipped(state: SlotsState, id: string): boolean;
  export function pityOf(perks: unknown): number;
  export function dayKey(date?: Date): string;
  export function addDay(date: Date, days: number): Date;
  export function dailyPreview(state: SlotsState, now?: Date): { can: boolean; streak: number; today: string };
  export function dailyClaim(state: SlotsState, now?: Date, perks?: unknown): { spins: number; capsule: boolean; streak: number } | null;
  export function wheelReady(state: SlotsState, shared: unknown, now?: Date): boolean;
  export function wheelPick(rng: () => number): number;
  export function openCapsule(rng: () => number, state: SlotsState, perks?: unknown): { item: CatalogItem; dup: boolean; berries: number };
  export function grantSets(state: SlotsState): string[];
  export function cryptoRng(): () => number;
}
declare module '*/js/casino-common.js' {
  import type { CatalogItem, SlotsState } from '*/js/slots-math.js';
  /** Общее сохранение игры «Ёжик» (hh_save_v1): ягоды, шляпы, бонусы — подписано, пишется только через saveAll */
  export interface SharedSave {
    berries: number;
    owned: string[];
    hat: string;
    bonusSpins: number;
    boosts: Record<string, number>;
    daily?: { date: string; goals: { done: boolean }[] };
    [key: string]: unknown;
  }
  export interface SlotsAudio {
    win(kind: string): void;
    shake(): void;
    crack(rarity: string): void;
    wheelTick(): void;
    destroy(): void;
  }
  export const ACH: { id: string; name: string; desc: string }[];
  export const KIND_NAME: Record<string, string>;
  export const EMOTES: Record<string, string>;
  export function loadAll(): { S: SlotsState; H: SharedSave; notes: string[] };
  export function saveAll(state: SlotsState, shared: SharedSave): void;
  export function applyItem(shared: SharedSave, item: CatalogItem): void;
  export function perksOf(shared: SharedSave, state?: SlotsState): { dailyExtra?: number; crown?: boolean } & Record<string, unknown>;
  export function itemName(id: string): string;
  export function fmt(value: number): string;
  export function reduce(): boolean;
  export function toast(text: string, options?: { ms?: number }): HTMLElement | null;
  export function clearToasts(): void;
  export function makeAwards(options: {
    S: SlotsState;
    toast?: typeof toast;
    audio: SlotsAudio;
    itemName?: typeof itemName;
    onChange?: () => void;
  }): {
    award(id: string): void;
    checkAlbum(): void;
  };
  export function makeFx(): { burst(count: number, kind?: string): void; destroy(): void };
  export function getAudio(): SlotsAudio;
}
declare module '*/js/slots-art.js' {
  export function ensureSprite(): void;
  /** SVG-разметка значка из спрайта (капсулы, пульт): см. ensureSprite */
  export function icon(id: string, size?: number, cls?: string): string;
  /** SVG-разметка символа слотов (ёжик, ягода…) */
  export function sym(id: string, size?: number, cls?: string): string;
}
