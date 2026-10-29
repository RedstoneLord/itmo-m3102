/**
 * Ключ файла карточек и конспекта: путь без регистра, пробелов/подчёркиваний и расширения `.md` (автопереименование у группы меняет « » на «_»).
 * У PDF остаётся `.pdf` — у него свой файл карточек (`Имя.pdf.md`). Отдельный файл без Vite: им пользуются и скрипты.
 */
export function cardsKey(path: string): string {
  return path
    .normalize('NFC')
    .replace(/^.*?data\/cards\//, '')
    .replace(/^Конспекты\//, '')
    .replace(/\.md$/i, '')
    .replace(/[\s_]+/g, '_')
    .toLowerCase();
}

/** Из пути файла карточек: папка предмета, занятие («Лекция 3»), название и признак PDF */
export function cardPathInfo(path: string): { folder: string; group: string; title: string; isPdf: boolean } {
  const parts = path
    .replace(/^.*?data\/cards\//, '')
    .replace(/^Конспекты\//, '')
    .split('/');
  const name = parts.at(-1)!.replace(/\.md$/i, '');
  const isPdf = /\.pdf$/i.test(name);
  const pretty = (text: string) => text.replace(/_/g, ' ').trim();
  return {
    folder: parts[0]!,
    group: parts.length > 2 ? pretty(parts[1]!) : '',
    title: pretty(name.replace(/\.pdf$/i, '')) + (isPdf ? ' (PDF)' : ''),
    isPdf,
  };
}
