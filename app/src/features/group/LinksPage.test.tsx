import { expect, it } from 'vitest';
import { linkKind } from './LinksPage';

it('тип ссылки — по адресу, явный kind из links.json главнее подписи', () => {
  expect(linkKind({ url: 'https://forms.gle/abc' }).label).toBe('Форма');
  expect(linkKind({ url: 'https://docs.google.com/spreadsheets/d/1/edit' }).label).toBe('Таблица');
  expect(linkKind({ url: 'https://docs.google.com/forms/d/1' }).label).toBe('Форма');
  expect(linkKind({ url: 'https://disk.yandex.ru/d/x' }).label).toBe('Диск');
  expect(linkKind({ url: 'https://drive.google.com/drive/folders/x' }).label).toBe('Диск');
  expect(linkKind({ url: 'https://is-itmo-c-26.github.io/lectures' }).label).toBe('Сайт');
  expect(linkKind({ url: 'https://github.com/Lipen/discrete-math' }).label).toBe('GitHub');
  expect(linkKind({ url: 'https://example.com' }).label).toBe('Ссылка');
  expect(linkKind({ url: 'https://example.com', kind: 'Видео' }).label).toBe('Видео');
});
