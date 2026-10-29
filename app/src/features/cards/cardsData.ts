import { resolveSubjectFolder } from '../../data/m3102';
import { cardPathInfo, cardsKey } from './key';
import { parseCards, type Card } from './parse';

export { cardsKey };

/**
 * Карточки к конспектам: файлы `src/data/cards/<путь конспекта в репозитории группы>.md` (формат — parse.ts и README рядом с данными).
 * В репозиторий группы они не попадают. Каждый файл грузится отдельно, только когда нужен: список файлов известен сразу (это ключи glob),
 * а их текст — по требованию. README лежит там же, но карточек в нём нет.
 */
const FILES = import.meta.glob<string>(['../../data/cards/**/*.md', '!../../data/cards/README.md'], { query: '?raw', import: 'default' });

export interface CardFile {
  /** Ключ (cardsKey): по нему файл находят и от него считается id карточки */
  key: string;
  /** Путь файла относительно data/cards, как он лежит */
  path: string;
  /** Предмет (id из data/m3102) по первой папке пути */
  subjectId: string | undefined;
  /** «Лекция 3», «Практика 2», пусто — если конспект лежит в корне папки предмета */
  group: string;
  /** Название конспекта по имени файла */
  title: string;
  isPdf: boolean;
  load: () => Promise<string>;
}

function fileInfo(file: string, load: () => Promise<string>): CardFile {
  const path = file.replace(/^.*?data\/cards\//, '').replace(/^Конспекты\//, '');
  const { folder, group, title, isPdf } = cardPathInfo(path);
  return { key: cardsKey(path), path, subjectId: resolveSubjectFolder(folder), group, title, isPdf, load };
}

const natural = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/** Все файлы карточек: по предмету, затем по занятию (Лекция 2 раньше Лекции 10), затем по названию */
export const CARD_FILES: CardFile[] = Object.entries(FILES)
  .map(([file, load]) => fileInfo(file, load))
  .sort((a, b) => natural.compare(a.path, b.path));

const BY_KEY = new Map(CARD_FILES.map((file) => [file.key, file]));

export const cardFileByKey = (key: string | null | undefined) => (key ? BY_KEY.get(key) : undefined);

/** Файл карточек к конспекту с путём sourceRef (`Конспекты/…`), если он есть */
export const cardFileFor = (sourceRef: string | undefined) => (sourceRef ? BY_KEY.get(cardsKey(sourceRef)) : undefined);

export const cardFilesOfSubject = (subjectId: string) => CARD_FILES.filter((file) => file.subjectId === subjectId);

export interface LoadedFile {
  file: CardFile;
  cards: Card[];
}

const LOADED = new Map<string, Promise<LoadedFile>>();

/** Файл разобранным; повторные вызовы берут уже загруженное */
export function loadCardFile(file: CardFile): Promise<LoadedFile> {
  let loaded = LOADED.get(file.key);
  if (!loaded) {
    loaded = file.load().then((text) => ({ file, cards: parseCards(text).cards }));
    LOADED.set(file.key, loaded);
  }
  return loaded;
}

/** id карточки в хранилище прогресса: ключ файла и id внутри него */
export const cardId = (file: CardFile, card: Card) => `${file.key}#${card.id}`;
