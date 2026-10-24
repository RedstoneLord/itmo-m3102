// @vitest-environment jsdom
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { headingText } from './NoteReader';

describe('текст заголовка для оглавления', () => {
  it('формула KaTeX входит один раз, а не картинкой + MathML + исходником', () => {
    const heading = document.createElement('h2');
    heading.innerHTML = `Оценка ${katex.renderToString('T(n)')} и ${katex.renderToString('\\Omega')}`;
    expect(heading.textContent).toContain('T(n)T(n)');
    expect(headingText(heading)).toBe('Оценка T(n) и Ω');
  });

  it('обычный заголовок не меняется и пробелы по краям срезаются', () => {
    const heading = document.createElement('h3');
    heading.innerHTML = '  Определение <strong>функции</strong> ';
    expect(headingText(heading)).toBe('Определение функции');
  });
});
