/**
 * Награды за вдумчивое чтение (js/rewards.js группы) считают блоки конспекта по `body.children`. У нас текст лежит в обёртках
 * `display: contents` (разделы и абзацы Markdown), у которых нет своей рамки на экране, — отдаём модулю плоский список настоящих
 * блоков. Тест, схемы и кадры для PDF в чтение не входят: у них свои правила.
 */
export function readingBlocks(container: Element): Element[] {
  const blocks: Element[] = [];
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      if (child.hasAttribute('data-lazy-layout') || child.hasAttribute('data-markdown')) walk(child);
      else if (!child.matches('[data-pdf-hide], [data-export-frame]')) blocks.push(child);
    }
  };
  walk(container);
  return blocks;
}

/** То, что модуль принимает за «тело конспекта»: плоские блоки и признак, что страница ещё открыта */
export function readingTarget(container: HTMLElement): HTMLElement {
  return {
    get children() {
      return readingBlocks(container);
    },
    get isConnected() {
      return container.isConnected;
    },
  } as unknown as HTMLElement;
}
