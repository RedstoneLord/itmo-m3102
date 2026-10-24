import { STORAGE_PREFIX, storageKey } from '../../lib/storage';

export const BACKUP_APP_ID = 'm3102';
/** Версия формата файла. Старые копии без версии — это 1 */
export const BACKUP_VERSION = 1;

/**
 * В копию не входят настройки интерфейса (тема, стиль — это браузер, не данные) и всё, что сайт скачает заново:
 * кеш конспектов и описаний курсов, очередь, метки синхронизации, приветствия.
 */
const EXCLUDED = [
  'settings',
  'last-sync',
  'last-backup',
  'appearance-sync',
  'classic-marks-seen',
  'offline',
  'queue',
  'lecture-notes',
  'subject-info',
  'greetings',
  'greeting-packs',
  'contributors',
  'dynamic-accent',
  'chunk-reload',
].map(storageKey);

export const isBackupKey = (key: string) => key.startsWith(`${STORAGE_PREFIX}:`) && !EXCLUDED.includes(key);

/** Что лежит в ключе — человеческим словом, для окна подтверждения */
const LABELS: Record<string, string> = {
  tasks: 'учебный план',
  notes: 'заметки',
  marks: 'закладки и пометки в конспектах',
  quizzes: 'результаты тестов',
  events: 'свои события',
  group: 'отметки дедлайнов',
  homework: 'отметки ДЗ',
  schedule: 'правки расписания',
  subjects: 'предметы',
  materials: 'материалы',
  semester: 'семестр',
  me: 'кто вы в очередях',
  radio: 'станция радио',
  'diagram-draft': 'черновик схемы',
  'pdf-pages': 'место в PDF',
};

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, string>;
}

/** Личные данные этого браузера в один объект: ключ localStorage → строка как есть */
export function collectBackup(storage: Storage = localStorage, now = new Date()): BackupFile {
  const data: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    const value = key ? storage.getItem(key) : null;
    if (key && value !== null && isBackupKey(key)) data[key] = value;
  }
  return { app: BACKUP_APP_ID, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

/** Разбор файла с проверкой: чужой или битый файл — понятная ошибка, ничего не записано */
export function parseBackup(text: string): BackupFile {
  let raw: { app?: unknown; version?: unknown; exportedAt?: unknown; data?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён: это не корректный JSON.');
  }
  if (raw?.app !== BACKUP_APP_ID || typeof raw.data !== 'object' || raw.data === null) {
    throw new Error('Это не файл резервной копии М3102.');
  }
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > BACKUP_VERSION) throw new Error('Копия сделана более новой версией сайта — обновите страницу и попробуйте снова.');

  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.data)) {
    if (!isBackupKey(key)) continue;
    if (typeof value !== 'string') throw new Error(`Запись «${key}» повреждена.`);
    // Каждый ключ — сохранённое хранилище: JSON-объект, а не число, строка или null
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('форма');
    } catch {
      throw new Error(`Запись «${key}» повреждена.`);
    }
    data[key] = value;
  }
  if (Object.keys(data).length === 0) throw new Error('В копии нет данных для восстановления.');
  return { app: BACKUP_APP_ID, version, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', data };
}

/**
 * Заменяет личные данные содержимым копии (настройки и кеш не трогает); возвращает, сколько ключей было и записано.
 * Сначала пишем новое поверх, лишнее убираем в конце; не поместилось — возвращаем прежнее и бросаем ошибку, ничего не потеряв.
 */
export function applyBackup(file: BackupFile, storage: Storage = localStorage): { removed: number; written: number } {
  const old = new Map<string, string>();
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    const value = key ? storage.getItem(key) : null;
    if (key && value !== null && isBackupKey(key)) old.set(key, value);
  }
  try {
    for (const [key, value] of Object.entries(file.data)) storage.setItem(key, value);
    for (const key of old.keys()) if (!(key in file.data)) storage.removeItem(key);
  } catch {
    for (const [key, value] of old) storage.setItem(key, value);
    for (const key of Object.keys(file.data)) if (!old.has(key)) storage.removeItem(key);
    throw new Error('Не удалось записать копию: не хватает места в браузере. Текущие данные не изменены.');
  }
  return { removed: old.size, written: Object.keys(file.data).length };
}

/** «учебный план, заметки, закладки…» — что есть в копии */
export function describeBackup(file: BackupFile): string {
  const names = Object.keys(file.data).map((key) => LABELS[key.slice(STORAGE_PREFIX.length + 1)]);
  return [...new Set(names.filter(Boolean))].join(', ');
}

const LAST_BACKUP_KEY = storageKey('last-backup');
/** Через сколько дней без копии начинаем напоминать */
export const BACKUP_STALE_DAYS = 30;

export function readLastBackup(storage: Storage = localStorage): number | null {
  try {
    const value = Number(storage.getItem(LAST_BACKUP_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function markBackupNow(now = Date.now(), storage: Storage = localStorage) {
  try {
    storage.setItem(LAST_BACKUP_KEY, String(now));
  } catch {
    // без хранилища просто не запомним дату — напоминание останется
  }
}

/** Копии не было или она старше BACKUP_STALE_DAYS */
export const isBackupStale = (last: number | null, now = Date.now()) => last === null || now - last > BACKUP_STALE_DAYS * 86_400_000;
