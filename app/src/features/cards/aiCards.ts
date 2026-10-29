import { pluralize } from '../../lib/pluralize';
import { CARD_TYPE_LABELS, type Card } from './parse';

/** Один файл карточек (к одному конспекту) со сведениями, нужными выгрузке */
export interface AiCardFile {
  title: string;
  group: string;
  /** Адрес конспекта в репозитории группы, если известен */
  sourceUrl?: string;
  cards: Card[];
}

interface AiCardsInput {
  subjectId: string;
  subjectName: string;
  date: string;
  /** Где лежат выгрузки на опубликованном сайте (с косой чертой в конце) */
  base: string;
  files: AiCardFile[];
}

const pad = (at: number) => String(at + 1).padStart(2, '0');

function lectureFile(input: AiCardsInput, file: AiCardFile): string {
  const label = `${file.title}${file.group ? ` (${file.group})` : ''}`;
  const lines = [
    `# ${input.subjectName} — карточки: ${label}`,
    '',
    `> Карточки для самопроверки по одному конспекту сайта группы М3102 (ИТМО), ${input.date}. Вопрос и ответ; в конспектах и карточках бывают ошибки — сверяйся с лекцией.`,
    ...(file.sourceUrl ? ['', `Конспект: ${file.sourceUrl}`] : []),
    '',
    `Карточек: ${file.cards.length}`,
    '',
  ];
  file.cards.forEach((card, at) => {
    lines.push(`## Карточка ${at + 1} · ${CARD_TYPE_LABELS[card.type]} · ${card.src}`, '', `**Вопрос.** ${card.q}`, '', '**Ответ.**', '', card.a, '');
  });
  return `${lines.join('\n').trim()}\n`;
}

/**
 * Карточки предмета для ИИ по ссылке: оглавление `{id}/cards/index.md` и по файлу на конспект (`{id}/cards/01.md`…). По оглавлению ИИ видит,
 * что есть, и открывает нужный набор: проверить себя, составить тест, объяснить ответ. Нет ни одной карточки — пусто.
 */
export function buildCardFiles(input: AiCardsInput): Record<string, string> {
  if (input.files.length === 0) return {};
  const out: Record<string, string> = {};
  const index = [
    `# ${input.subjectName} — карточки для самопроверки`,
    '',
    `> Собрано с сайта группы М3102 (ИТМО) ${input.date}. Это вопросы и ответы по всем конспектам предмета: открывай нужный набор по ссылке ниже.`,
    '> Как пользоваться: задавай вопросы по одному, не показывая ответ, жди ответа человека, потом сверяй с ответом из карточки и объясняй, чего не хватило.',
    '',
    `## Наборы (${input.files.length})`,
    '',
  ];
  input.files.forEach((file, at) => {
    const name = `${input.subjectId}/cards/${pad(at)}.md`;
    out[name] = lectureFile(input, file);
    const byType = new Map<string, number>();
    for (const card of file.cards) byType.set(card.type, (byType.get(card.type) ?? 0) + 1);
    const kinds = [...byType].map(([type, count]) => `${CARD_TYPE_LABELS[type as keyof typeof CARD_TYPE_LABELS]} ×${count}`).join(', ');
    index.push(
      `${at + 1}. [${file.title}${file.group ? ` — ${file.group}` : ''}](${input.base}${name}) — ${pluralize(file.cards.length, ['карточка', 'карточки', 'карточек'])}: ${kinds}`,
    );
  });
  out[`${input.subjectId}/cards/index.md`] = `${index.join('\n')}\n`;
  return out;
}
