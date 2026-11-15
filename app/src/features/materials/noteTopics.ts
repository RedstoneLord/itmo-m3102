import type { LectureNote } from '../../types/models';

/** Заголовки, которые ничего не говорят о теме: «Лекция 3», «Содержание», «Организационная информация», «Литература», просто «Определение» */
const GENERIC =
  /^((лекци[яи]|практик[аи]|семинар|содержание|оглавление|план|разминка|организационн\S*)(\s|$)|(литература|определени[ея]|введение|итоговый тест|тест|вопросы|ответы|задачи)$)/i;

/** Частые TeX-команды в заголовках — знаками; остальные — просто именем (\lim → lim) */
const TEX: Record<string, string> = { to: '→', infty: '∞', in: '∈', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', cdot: '·', sum: 'Σ', int: '∫' };

/** Заголовок markdown → читаемый текст: формулы без TeX-разметки, без ** и ` (\mathbb{C} → C, \to → →) */
export function plainHeading(text: string): string {
  return text
    .replace(/\\(?:mathbb|mathrm|mathbf|mathcal|text|operatorname)\{([^}]*)\}/g, '$1')
    .replace(/\\([a-zA-Z]+)/g, (_, name: string) => ` ${TEX[name] ?? name} `)
    .replace(/[${}*_`\\]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Темы занятия по заголовкам `##` его markdown-конспектов (как у классической версии из data/lectures.json — но текст конспектов
 * у приложения уже есть, лишний запрос не нужен). Без номеров «1.», без общих слов, без повторов; у PDF тем нет.
 */
export function noteTopics(notes: LectureNote[], limit = 3): string[] {
  const topics: string[] = [];
  for (const note of notes) {
    if (note.contentType !== 'markdown') continue;
    // Блоки кода — мимо: в них `##` бывает комментарием, а не заголовком
    const text = note.content.replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
    for (const match of text.matchAll(/^##\s+(.+)$/gm)) {
      const topic = plainHeading(match[1]!).replace(/^\d+(\.\d+)*\.?\s+/, '');
      if (topic.length < 3 || GENERIC.test(topic) || topics.includes(topic)) continue;
      topics.push(topic);
      if (topics.length >= limit) return topics;
    }
  }
  return topics;
}
