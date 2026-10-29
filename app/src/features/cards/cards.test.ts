import { describe, expect, it } from 'vitest';
import { checkCardFile, noteHeadings, normalizeHeading, pageRange } from './check';
import { parseCards } from './parse';

const NOTE = `# Мастер-теорема

Введение.

## Дерево рекурсии

Текст.

## Случаи

### Случай $q = 1$

\`\`\`text
# не заголовок
\`\`\`

### Случай $q < 1$

#### Смысл

## Итог
`;

const A = 'Ответ достаточной длины, чтобы пройти проверку на пустую карточку.';
const card = (id: string, src: string, type = 'concept') => `@@ id=${id} type=${type} src="${src}"\nQ: Вопрос по разделу «${src}»?\nA:\n${A}\n`;
const withoutLine = (unit: string) => unit.replace(/ \(строка \d+\)/, '');

describe('parseCards', () => {
  it('читает карточки, многострочные Q и A и пропуски', () => {
    const parsed = parseCards(
      `<!-- комментарий -->\n@@ id=one type=term src="Дерево рекурсии"\nQ: Первая строка вопроса\nвторая строка\nA:\nОтвет\n\n\`\`\`text\nA: внутри кода не маркер\n@@ тоже не карточка\n\`\`\`\n\n@@skip src="Итог" reason="только вывод"\n`,
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]).toMatchObject({ id: 'one', type: 'term', src: 'Дерево рекурсии', q: 'Первая строка вопроса\nвторая строка' });
    expect(parsed.cards[0]!.a).toContain('A: внутри кода не маркер');
    expect(parsed.skips).toEqual([{ src: 'Итог', reason: 'только вывод', line: 13 }]);
  });

  it('собирает все ошибки сразу, с номерами строк', () => {
    const { issues, cards } = parseCards(
      'текст вне карточки\n@@ id=Bad_Id type=nope\nQ: вопрос\nA:\nответ\n@@ id=ok type=term src=x\nQ: без ответа\n@@skip src="x"\n',
    );
    expect(cards).toEqual([]);
    const text = issues.map((issue) => `${issue.line}: ${issue.message}`).join('\n');
    expect(text).toContain('1: текст вне карточки');
    expect(text).toContain('id «Bad_Id»');
    expect(text).toContain('type «nope»');
    expect(text).toContain('нет src');
    expect(text).toContain('нет строки «A:»');
    expect(text).toContain('@@skip без причины');
  });
});

describe('заголовки и покрытие', () => {
  it('нормализация не зависит от оформления, регистра и ё, но различает знаки сравнения', () => {
    expect(normalizeHeading('Случай $q = 1$')).toBe(normalizeHeading('случай q=1'));
    expect(normalizeHeading('**Ёлка** [ссылка](x)')).toBe('елка ссылка');
    expect(normalizeHeading('Случай $q < 1$')).not.toBe(normalizeHeading('Случай $q > 1$'));
  });

  it('заголовки — без блоков кода', () => {
    expect(noteHeadings(NOTE).map((heading) => heading.text)).toEqual([
      'Мастер-теорема',
      'Дерево рекурсии',
      'Случаи',
      'Случай $q = 1$',
      'Случай $q < 1$',
      'Смысл',
      'Итог',
    ]);
  });

  it('единицы покрытия: подразделы, а раздел без подразделов — он сам; титул не раздел', () => {
    const result = checkCardFile('', { kind: 'md', text: NOTE });
    expect(result.units.map(withoutLine)).toEqual(['Дерево рекурсии', 'Случай $q = 1$', 'Случай $q < 1$', 'Итог']);
  });

  it('карточка по глубокому заголовку закрывает подраздел, не указанный напрямую', () => {
    const file = [card('a', 'Дерево рекурсии'), card('b', 'Случай q=1'), card('c', 'Смысл'), card('d', 'Итог')].join('\n');
    const result = checkCardFile(file, { kind: 'md', text: NOTE });
    expect(result.errors).toEqual([]);
    expect(result.uncovered).toEqual([]);
  });

  it('непокрытое и несуществующее', () => {
    const result = checkCardFile([card('a', 'Дерево рекурсии'), card('b', 'Нет такого')].join('\n'), { kind: 'md', text: NOTE });
    expect(result.errors).toEqual(['карточка «b» (строка 6): src «Нет такого» — такого заголовка в конспекте нет']);
    expect(result.uncovered.map(withoutLine)).toEqual(['Случай $q = 1$', 'Случай $q < 1$', 'Итог']);
  });

  it('повторяющиеся заголовки: каждая карточка закрывает следующую единицу, «Родитель :: Заголовок» — конкретную', () => {
    const note = '## Один\n\n### Пример\n\n## Два\n\n### Пример\n';
    const twice = checkCardFile([card('a', 'Пример'), card('b', 'Пример')].join('\n'), { kind: 'md', text: note });
    expect(twice.uncovered).toEqual([]);
    const second = checkCardFile(card('a', 'Два :: Пример'), { kind: 'md', text: note });
    expect(second.uncovered).toEqual(['Пример (строка 3)']);
  });

  it('@@skip закрывает раздел, но с причиной', () => {
    const result = checkCardFile(`${card('a', 'Дерево рекурсии')}\n@@skip src="Итог" reason="выводы без нового материала"\n`, {
      kind: 'md',
      text: NOTE,
    });
    expect(result.uncovered.map(withoutLine)).toEqual(['Случай $q = 1$', 'Случай $q < 1$']);
  });

  it('@@skip src="*" закрывает весь конспект (дубль другого), но тоже с причиной', () => {
    const whole = checkCardFile('@@skip src="*" reason="дубль соседнего конспекта"\n', { kind: 'md', text: NOTE });
    expect(whole.uncovered).toEqual([]);
    expect(checkCardFile('@@skip src="*"\n', { kind: 'md', text: NOTE }).errors.join('\n')).toContain('без причины');
  });

  it('длины, id, незакрытый код и организационное', () => {
    const long = `@@ id=long type=term src="Итог"\nQ: ${'x'.repeat(701)}\nA:\n${A}\n@@ id=short type=term src="Итог"\nQ: Сколько баллов за экзамен у преподавателя?\nA:\nда\n@@ id=open type=term src="Итог"\nQ: Вопрос с кодом\nA:\n\`\`\`text\nне закрыто\n`;
    const result = checkCardFile(long, { kind: 'md', text: NOTE });
    expect(result.errors.join('\n')).toContain('вопрос длиннее 700');
    expect(result.errors.join('\n')).toContain('ответ короче 30');
    expect(result.errors.join('\n')).toContain('не закрыт блок кода');
    expect(result.warnings.join('\n')).toContain('организационное');
  });

  it('схемы в ответах проверяются переданным разбором', () => {
    const file = `@@ id=g type=algo src="Итог"\nQ: Нарисуй граф\nA:\nГраф:\n\n\`\`\`graph\nA ->\n\`\`\`\n`;
    const result = checkCardFile(
      file,
      { kind: 'md', text: NOTE },
      {
        parseDiagram: (lang) => {
          throw new Error(`плохая схема ${lang}`);
        },
      },
    );
    expect(result.errors.join('\n')).toContain('схема `graph` не строится — плохая схема graph');
  });

  it('PDF: страницы и диапазоны, пустые страницы карточек не требуют', () => {
    const pages = [
      { heading: 'Стр. 1', text: 'Титул' },
      { heading: 'Стр. 2', text: 'x'.repeat(300) },
      { heading: 'Стр. 3', text: 'x'.repeat(300) },
      { heading: 'Стр. 4', text: 'x'.repeat(300) },
    ];
    const ok = checkCardFile([card('a', 'Стр. 2–3')].join('\n'), { kind: 'pdf', pages });
    expect(ok.units).toEqual(['Стр. 2', 'Стр. 3', 'Стр. 4']);
    expect(ok.uncovered).toEqual(['Стр. 4']);
    const bad = checkCardFile(card('b', 'Стр. 9'), { kind: 'pdf', pages });
    expect(bad.errors[0]).toContain('это не страницы PDF');
    expect(pageRange('стр. 5-7')).toEqual([5, 6, 7]);
    expect(pageRange('Раздел 5')).toBeNull();
  });

  it('файл без конспекта — ошибка', () => {
    expect(checkCardFile(card('a', 'x'), undefined).errors).toContain('для файла нет конспекта с таким путём');
  });
});
