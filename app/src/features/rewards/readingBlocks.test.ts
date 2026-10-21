// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readingBlocks, readingTarget } from './readingBlocks';

function fixture() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-lazy-layout style="display: contents">
      <div data-markdown><h2>Раздел</h2><p>Абзац один</p><pre>код</pre></div>
      <div data-markdown><p>Абзац два</p><div data-pdf-hide>тест</div><div data-export-frame>кадр</div></div>
    </div>
    <div data-pdf-hide>свой тест в конце</div>`;
  return root;
}

describe('блоки конспекта для наград за чтение', () => {
  it('раскрывает обёртки и пропускает тесты и кадры для PDF', () => {
    expect(readingBlocks(fixture()).map((el) => el.tagName + ':' + el.textContent?.trim())).toEqual([
      'H2:Раздел',
      'P:Абзац один',
      'PRE:код',
      'P:Абзац два',
    ]);
  });

  it('цель живёт вместе со страницей: список читается заново, isConnected — как у контейнера', () => {
    const root = fixture();
    document.body.append(root);
    const target = readingTarget(root);
    expect(target.isConnected).toBe(true);
    expect([...target.children]).toHaveLength(4);
    root.remove();
    expect(target.isConnected).toBe(false);
  });
});
