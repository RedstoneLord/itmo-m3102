import { expect, it } from 'vitest';
import type { LectureNote } from '../../types/models';
import { noteTopics, plainHeading } from './noteTopics';

const note = (content: string, contentType: LectureNote['contentType'] = 'markdown') => ({ content, contentType }) as LectureNote;

it('темы — заголовки ## без номеров, общих слов и повторов; у PDF тем нет', () => {
  const notes = [
    note('# Лекция 2\n## Содержание\n## 1. Поле $\\mathbb{C}$\n### мелкое\n## 2. **Модуль** и аргумент\n```\n## не заголовок?\n```'),
    note('## 1. Поле $\\mathbb{C}$\n## Формула Муавра\n## Корни'),
    note('## Из PDF', 'pdf'),
  ];
  expect(noteTopics(notes)).toEqual(['Поле C', 'Модуль и аргумент', 'Формула Муавра']);
  expect(noteTopics([note('## Лекция 3'), note('## Практика')])).toEqual([]);
  const generic = ['Литература', 'Определение', 'Организационная информация', 'Итоговый тест', 'Определение матрицы'];
  expect(noteTopics([note(generic.map((heading) => `## ${heading}`).join('\n'))])).toEqual(['Определение матрицы']);
});

it('заголовок с формулой читается обычным текстом', () => {
  expect(plainHeading('Предел $\\lim_{n \\to \\infty} a_n$')).toBe('Предел lim n → ∞ an');
});
