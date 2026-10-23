/** Содержимое data/search-index.json группы: { files: [путь], sections: [[номер файла, заголовок, текст]] } */
export type SearchIndexFile = { files?: string[]; sections?: [number, string, string][] };

/** Складывает в `into` текст PDF по пути файла (разделы одного файла склеиваются); остальные файлы индекса пропускает */
export function collectPdfText(raw: SearchIndexFile | null, into: Map<string, string>): void {
  if (!raw?.files || !Array.isArray(raw.sections)) return;
  for (const [file, heading, text] of raw.sections) {
    const path = raw.files[file];
    if (!path?.toLowerCase().endsWith('.pdf')) continue;
    into.set(path, `${into.get(path) ?? ''} ${heading} ${text}`);
  }
}
