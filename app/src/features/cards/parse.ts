/**
 * Карточки для самопроверки по конспектам: формат файла и разбор. Файл лежит в `src/data/cards/<путь конспекта>.md`
 * (подробно — `src/data/cards/README.md`). Одна карточка:
 *
 *   @@ id=master-case-q1 type=theorem src="Случай q < 1"
 *   Q: Чему равна асимптотика T(n) при a < b^c и почему?
 *   A:
 *   Ответ в Markdown: формулы, код, схемы…
 *
 * `@@skip src="…" reason="…"` — раздел, по которому карточки не нужны (с причиной).
 */
export const CARD_TYPES = ['term', 'concept', 'theorem', 'proof', 'algo', 'trace', 'calc', 'compare', 'code', 'pitfall'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  term: 'Термин',
  concept: 'Идея',
  theorem: 'Теорема',
  proof: 'Доказательство',
  algo: 'Алгоритм',
  trace: 'Прогон',
  calc: 'Вычисли',
  compare: 'Сравни',
  code: 'Код',
  pitfall: 'Ловушка',
};

export interface Card {
  id: string;
  type: CardType;
  /** Заголовок раздела конспекта (или «Стр. 5», «Стр. 5–7» у PDF), по которому карточка */
  src: string;
  q: string;
  a: string;
  /** Строка `@@` в файле — для сообщений об ошибках */
  line: number;
}

/** Раздел, по которому карточки не нужны (титул, список литературы…); причина обязательна */
export interface CardSkip {
  src: string;
  reason: string;
  line: number;
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParsedCards {
  cards: Card[];
  skips: CardSkip[];
  issues: ParseIssue[];
}

const ATTRIBUTE = /([a-z]+)=("([^"]*)"|[^\s"]+)/g;
const KNOWN_ATTRIBUTES = new Set(['id', 'type', 'src', 'reason']);
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Строка-ограда блока кода: внутри неё `@@`, `Q:` и `A:` ничего не значат */
const isFence = (line: string) => /^\s*(```|~~~)/.test(line);

function readAttributes(text: string, line: number, issues: ParseIssue[]): Record<string, string> {
  const found: Record<string, string> = {};
  // Всё, что не разобралось как «ключ=значение», — опечатка: молча терять её нельзя
  const rest = text.replace(ATTRIBUTE, (_match, key: string, raw: string, quoted: string | undefined) => {
    if (!KNOWN_ATTRIBUTES.has(key)) issues.push({ line, message: `неизвестное поле «${key}»` });
    else found[key] = quoted ?? raw;
    return '';
  });
  if (rest.trim()) issues.push({ line, message: `лишний текст в строке с @@: «${rest.trim()}»` });
  return found;
}

/** Разбирает файл карточек; ошибки не бросает, а собирает в `issues` (с номерами строк), чтобы показать их все сразу */
export function parseCards(source: string): ParsedCards {
  const lines = source.replace(/\r/g, '').split('\n');
  const result: ParsedCards = { cards: [], skips: [], issues: [] };
  const { issues } = result;

  let head: { line: number; text: string } | null = null;
  let body: { line: number; text: string }[] = [];
  let fenced = false;

  const flush = () => {
    if (!head) return;
    const { line, text } = head;
    head = null;
    const isSkip = /^skip\b/.test(text);
    const attributes = readAttributes(isSkip ? text.replace(/^skip\b/, '') : text, line, issues);
    if (isSkip) {
      if (!attributes.src) issues.push({ line, message: '@@skip без src' });
      else if ((attributes.reason ?? '').trim().length < 5) issues.push({ line, message: '@@skip без причины (reason="…", не короче 5 знаков)' });
      else result.skips.push({ src: attributes.src, reason: attributes.reason!, line });
      return;
    }
    const { id, type, src } = attributes;
    if (!id) issues.push({ line, message: 'у карточки нет id' });
    else if (!SLUG.test(id)) issues.push({ line, message: `id «${id}»: только латиница, цифры и дефис` });
    if (!type) issues.push({ line, message: 'у карточки нет type' });
    else if (!(CARD_TYPES as readonly string[]).includes(type)) issues.push({ line, message: `type «${type}»: допустимо ${CARD_TYPES.join(', ')}` });
    if (!src) issues.push({ line, message: 'у карточки нет src (раздел конспекта)' });

    // Q: до A: — вопрос, после A: — ответ; маркеры ищем вне блоков кода
    let inFence = false;
    let questionAt = -1;
    let answerAt = -1;
    body.forEach(({ text: row }, at) => {
      if (isFence(row)) inFence = !inFence;
      else if (!inFence && questionAt < 0 && /^Q:/.test(row)) questionAt = at;
      else if (!inFence && questionAt >= 0 && answerAt < 0 && /^A:/.test(row)) answerAt = at;
    });
    const stray = body.find(({ text: row }, at) => (questionAt < 0 || at < questionAt) && row.trim() && !/^<!--.*-->$/.test(row.trim()));
    if (stray) issues.push({ line: stray.line, message: 'текст до «Q:» — вопрос должен начинаться с «Q:»' });
    if (questionAt < 0) return void issues.push({ line, message: 'нет строки «Q:»' });
    if (answerAt < 0) return void issues.push({ line, message: 'нет строки «A:» после вопроса' });
    const q = [body[questionAt]!.text.slice(2), ...body.slice(questionAt + 1, answerAt).map((row) => row.text)].join('\n').trim();
    const a = [body[answerAt]!.text.slice(2), ...body.slice(answerAt + 1).map((row) => row.text)].join('\n').trim();
    if (id && type && src && SLUG.test(id) && (CARD_TYPES as readonly string[]).includes(type))
      result.cards.push({ id, type: type as CardType, src, q, a, line });
  };

  lines.forEach((text, at) => {
    const line = at + 1;
    if (!fenced && text.startsWith('@@')) {
      flush();
      head = { line, text: text.slice(2).trim() };
      body = [];
      return;
    }
    if (isFence(text)) fenced = !fenced;
    if (head) body.push({ line, text });
    else if (text.trim() && !/^<!--.*-->$/.test(text.trim()))
      issues.push({ line, message: 'текст вне карточки: карточка начинается со строки «@@ id=… type=… src=…»' });
  });
  flush();
  return result;
}
