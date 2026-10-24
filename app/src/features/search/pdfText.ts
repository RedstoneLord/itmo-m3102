/** Содержимое data/search-index.json группы: { files: [путь], sections: [[номер файла, заголовок, текст]] } */
export type SearchIndexFile = { files?: string[]; sections?: [number, string, string][] };

/** Кусок длинного текста для поиска: раздел конспекта, страница PDF («Стр. 5») или весь текст сразу (heading пуст) */
export interface TextSection {
  heading: string;
  text: string;
}

/** Складывает в `into` страницы PDF по пути файла; остальные файлы индекса пропускает */
export function collectPdfPages(raw: SearchIndexFile | null, into: Map<string, TextSection[]>): void {
  if (!raw?.files || !Array.isArray(raw.sections)) return;
  for (const [file, heading, text] of raw.sections) {
    const path = raw.files[file];
    if (!path?.toLowerCase().endsWith('.pdf')) continue;
    const pages = into.get(path) ?? [];
    pages.push({ heading, text });
    into.set(path, pages);
  }
}

/** Разделы одним куском текста (для «Для ИИ»): заголовок и текст каждого через пробел */
export const joinSections = (sections: TextSection[]) => sections.map(({ heading, text }) => ` ${heading} ${text}`).join('');

/** Складывает в `into` текст PDF по пути файла (разделы одного файла склеиваются) */
export function collectPdfText(raw: SearchIndexFile | null, into: Map<string, string>): void {
  const pages = new Map<string, TextSection[]>();
  collectPdfPages(raw, pages);
  for (const [path, sections] of pages) into.set(path, joinSections(sections));
}
