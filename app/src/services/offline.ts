import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useGroupStore, type RepoFile } from '../features/group/groupStore';
import { localStore, storageKey } from '../lib/storage';
import { rawUrl } from './githubContent';

/**
 * «Работа без интернета» целиком, как на сайте группы: PDF и картинки из папок материалов — в отдельный кеш
 * браузера, который не трогает обновление сайта (sw.js отдаёт оттуда по адресу raw.githubusercontent и GitHub Pages).
 * Тексты конспектов, расписание и ДЗ и так лежат в localStorage. Аудио, docx и djvu не сохраняются — тяжёлые
 * и в браузере всё равно не открываются. Версии файлов — sha из дерева репозитория: «Обновить» качает только
 * новое и изменённое и удаляет пропавшее.
 */
export const OFFLINE_CACHE = 'm3102-offline';
const FOLDERS = ['Конспекты/', 'Материалы/', 'Лабораторные/'];
const SAVED = /\.(pdf|png|jpe?g|gif|webp|svg)$/i;
/** Параллельных загрузок: больше — GitHub начинает отвечать медленнее, меньше — дольше ждать */
const PARALLEL = 4;
/** Один файл (даже учебник на сотню мегабайт) должен скачаться за это время, иначе считаем запрос зависшим */
const FETCH_TIMEOUT = 5 * 60_000;
/** Номер текущей загрузки и способ её оборвать: «Очистить» и повторный запуск делают прежнюю недействительной */
let operation = 0;
let stop = () => {};

export const offlineFiles = (files: RepoFile[]) =>
  files.filter((file) => FOLDERS.some((folder) => file.path.startsWith(folder)) && SAVED.test(file.path));

/** Что скачать и что удалить: сохранённые версии против текущего дерева */
export function offlinePlan(files: RepoFile[], saved: Record<string, string>) {
  const wanted = offlineFiles(files);
  const paths = new Set(wanted.map((file) => file.path));
  return {
    wanted,
    missing: wanted.filter((file) => !saved[file.path] || (file.sha !== undefined && saved[file.path] !== file.sha)),
    stale: Object.keys(saved).filter((path) => !paths.has(path)),
  };
}

interface OfflineStore {
  /** Путь → sha сохранённой версии */
  saved: Record<string, string>;
  auto: boolean;
  status: 'idle' | 'running' | 'error';
  progress: { files: number; totalFiles: number; bytes: number; totalBytes: number } | null;
  error: string;
  setAuto: (auto: boolean) => void;
  download: () => Promise<void>;
  clear: () => Promise<void>;
}

/** Код читалки PDF и схем грузится только при первом использовании — без сети его тоже нужно иметь заранее */
async function warmUpCode() {
  const [{ PDF_WORKER_URL }] = await Promise.all([
    import('../features/materials/PdfViewer'),
    import('../components/diagrams/DiagramBlock'),
    import('mermaid'),
  ]);
  await fetch(PDF_WORKER_URL);
}

export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set, get) => ({
      saved: {},
      auto: true,
      status: 'idle',
      progress: null,
      error: '',
      setAuto: (auto) => set({ auto }),

      download: async () => {
        if (get().status === 'running') return;
        const id = ++operation;
        const abort = new AbortController();
        stop = () => abort.abort();
        // «Очистить» и новая загрузка меняют номер операции — запоздавшие ответы старой больше ничего не пишут
        const current = () => id === operation;
        const { missing, stale } = offlinePlan(useGroupStore.getState().files, get().saved);
        set({
          status: 'running',
          error: '',
          progress: { files: 0, totalFiles: missing.length, bytes: 0, totalBytes: missing.reduce((sum, file) => sum + file.size, 0) },
        });
        try {
          // Без этого браузер может стереть кеш при нехватке места
          await navigator.storage?.persist?.();
          const cache = await caches.open(OFFLINE_CACHE);
          await Promise.all(stale.map((path) => cache.delete(rawUrl('group', path))));
          set((state) => ({ saved: Object.fromEntries(Object.entries(state.saved).filter(([path]) => !stale.includes(path))) }));
          await warmUpCode();

          const queue = [...missing];
          let failure: unknown;
          const worker = async () => {
            try {
              for (let file = queue.shift(); file && current(); file = queue.shift()) {
                const url = rawUrl('group', file.path);
                // Зависший запрос не держит загрузку вечно; первая ошибка отменяет остальные запросы
                const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(FETCH_TIMEOUT)]);
                const response = await fetch(url, { cache: 'no-store', signal });
                if (!response.ok) throw new Error(`Не удалось скачать ${file.path} (${response.status})`);
                if (!current()) return;
                await cache.put(url, response);
                if (!current()) return;
                const { path, size, sha } = file;
                set((state) => ({
                  saved: { ...state.saved, [path]: sha ?? '' },
                  progress: state.progress && { ...state.progress, files: state.progress.files + 1, bytes: state.progress.bytes + size },
                }));
              }
            } catch (error) {
              failure ??= error;
              abort.abort();
            }
          };
          // Ждём всех: пока хоть один запрос жив, кнопки «Скачать» и «Очистить» остаются занятыми
          await Promise.all(Array.from({ length: PARALLEL }, worker));
          if (!current()) return;
          if (failure) throw failure;
          set({ status: 'idle', progress: null });
        } catch (error) {
          if (!current()) return;
          const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
          set({
            status: 'error',
            progress: null,
            error: quota
              ? 'Не хватает места на устройстве — скачанное сохранено, остальное докачается, когда место появится.'
              : !navigator.onLine
                ? 'Нет интернета — скачанное сохранено, остальное докачается позже.'
                : error instanceof Error
                  ? error.message
                  : 'Не удалось скачать файлы.',
          });
        }
      },

      clear: async () => {
        operation++;
        stop();
        await caches.delete(OFFLINE_CACHE);
        set({ saved: {}, status: 'idle', progress: null, error: '' });
      },
    }),
    {
      name: storageKey('offline'),
      storage: localStore,
      partialize: ({ saved, auto }) => ({ saved, auto }),
    },
  ),
);

/** После синхронизации: если раньше уже скачивали и включено «Обновлять автоматически» — докачать новое */
export function updateOfflineIfEnabled() {
  const { auto, saved, download } = useOfflineStore.getState();
  if (!auto || Object.keys(saved).length === 0) return;
  const { missing, stale } = offlinePlan(useGroupStore.getState().files, saved);
  if (missing.length || stale.length) void download();
}
