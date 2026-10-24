/**
 * Ряд, который листается вбок (вкладки, переключатель): выбранный вариант — в видимую часть. Иначе при заходе по ссылке
 * («Записи лекций») выбранная вкладка оставалась за краем экрана, и казалось, что не выбрано ничего.
 */
export function revealInRow(row: HTMLElement | null) {
  const active = row?.querySelector<HTMLElement>('[aria-selected="true"], [aria-checked="true"]');
  if (!row || !active) return;
  const rowBox = row.getBoundingClientRect();
  const box = active.getBoundingClientRect();
  if (box.left >= rowBox.left && box.right <= rowBox.right) return;
  row.scrollLeft += box.left - rowBox.left - (rowBox.width - box.width) / 2;
}
