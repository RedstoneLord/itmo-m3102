/** Языки fenced-блоков схем группы и учебных инструментов. Отдельно от DiagramBlock:
 * Markdown проверяет язык сразу, а сам рисовальщик (~400 КБ) грузит, только когда в тексте есть схема */
export const DIAGRAM_LANGUAGES = ['graph', 'plot', 'chart', 'tree', 'array', 'diagram', 'canvas', 'geometry3d', 'matrix'] as const;
export type DiagramLanguage = (typeof DIAGRAM_LANGUAGES)[number];

export const isDiagramLanguage = (lang: string): lang is DiagramLanguage => (DIAGRAM_LANGUAGES as readonly string[]).includes(lang);
