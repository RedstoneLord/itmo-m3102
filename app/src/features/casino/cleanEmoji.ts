import { ensureSprite, sym } from '../../../../js/slots-art.js';

/** На сайте эмодзи нет: у игр группы в текстах 🍓 вместо слова и 🦔 у реплик крупье — заменяем на странице, не трогая их файлы */
const REPLACEMENTS: [RegExp, string][] = [
  [/\s*🍓/gu, ' ягод'],
  [/🦔\s*/gu, ''],
];

function clean(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    let next = text.data;
    for (const [pattern, to] of REPLACEMENTS) next = next.replace(pattern, to);
    if (next !== text.data) text.data = next;
  } else node.childNodes.forEach(clean);
}

/**
 * Чистит текст страницы игры и следит за новым: игры дописывают баланс, выигрыш и реплики на ходу. Всплывающие сообщения игры (`.cs-toasts`) живут
 * в body, а не на странице, поэтому за ними следим отдельно. Крупье-ёжик в блэкджеке — эмодзи в разметке: вместо него рисунок ёжика группы.
 */
export function cleanEmoji(host: Element): () => void {
  ensureSprite();
  host.querySelectorAll('.bj-dealer-pic').forEach((pic) => {
    pic.innerHTML = sym('hog', 88);
  });
  const watch = (target: Node) => {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach(clean);
        if (record.type === 'characterData') clean(record.target);
      }
    });
    observer.observe(target, { subtree: true, childList: true, characterData: true });
    return observer;
  };
  clean(host);
  const observers = [watch(host)];
  const toasts = document.querySelector('.cs-toasts');
  if (toasts) observers.push(watch(toasts));
  // Контейнер сообщений создаётся при первом сообщении — ловим его появление в body
  const bodyWatcher = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement && node.classList.contains('cs-toasts')) {
          clean(node);
          observers.push(watch(node));
        }
      });
    }
  });
  bodyWatcher.observe(document.body, { childList: true });
  observers.push(bodyWatcher);
  return () => observers.forEach((observer) => observer.disconnect());
}
