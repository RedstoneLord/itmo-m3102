import { create } from 'zustand';
import { storageKey } from '../lib/storage';
import { autoSyncGithubContent, readLastSync, syncGithubContent, type SyncSummary } from './githubContent';

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

const OFFLINE = 'Нет интернета — показаны сохранённые данные. Синхронизируемся, когда сеть вернётся.';

interface SyncStore {
  status: SyncStatus;
  /** Итог последней синхронизации или текст ошибки */
  summary: SyncSummary | null;
  error: string;
  /** Когда последний раз синхронизация удалась (мс) — null, пока ни разу; данные на экране тогда не из GitHub */
  lastSync: number | null;
  /** Синхронизировать с репозиториями сейчас (кнопка). Повторный вызов во время синхронизации ничего не делает. */
  run: () => Promise<void>;
  /** При открытии сайта — не чаще раза в 10 минут */
  runAuto: () => Promise<void>;
}

/** Общее состояние синхронизации — его видят кнопка в шапке, «Настройки» и вкладка «Конспекты» */
export const useSyncStore = create<SyncStore>()((set, get) => {
  async function track(task: () => Promise<SyncSummary | void>) {
    // Статус ставится до первого await — второй вызов (StrictMode, кнопка + автосинхронизация) ничего не делает
    if (get().status === 'syncing') return;
    if (!navigator.onLine) {
      set({ status: 'error', error: OFFLINE });
      return;
    }
    set({ status: 'syncing', error: '' });
    try {
      const summary = await task();
      set((state) => ({ status: 'done', summary: summary ?? state.summary, lastSync: readLastSync() }));
      // Новые и изменённые файлы группы — сразу на устройство, если человек включил работу без интернета
      // Модуль — отдельным куском (в нём загрузка читалки PDF и mermaid), грузится, только если что-то уже скачано
      try {
        if (summary && localStorage.getItem(storageKey('offline'))?.includes('"saved":{"'))
          void import('./offline').then((module) => module.updateOfflineIfEnabled());
      } catch {
        // Хранилище запрещено — «Работу без интернета» не включали, обновлять нечего
      }
    } catch (error) {
      // fetch без сети бросает TypeError «Failed to fetch» — человеку это ничего не говорит
      const message =
        error instanceof TypeError || !navigator.onLine
          ? OFFLINE
          : error instanceof DOMException && error.name === 'TimeoutError'
            ? 'GitHub не отвечает — показаны сохранённые данные. Попробуйте позже.'
            : error instanceof Error
              ? error.message
              : 'Не удалось синхронизироваться с GitHub.';
      // Метка могла поставиться и при сбое другой части синхронизации — читаем заново
      set({ status: 'error', error: message, lastSync: readLastSync() });
    }
  }

  return {
    status: 'idle',
    summary: null,
    error: '',
    lastSync: readLastSync(),
    run: () => track(syncGithubContent),
    runAuto: () => track(autoSyncGithubContent),
  };
});

/**
 * Данным можно верить: они остались от прошлой удачной синхронизации или первая уже закончилась (удачно или нет).
 * Пока false, пустой список и ноль — не «пусто», а «ещё не загрузилось»: показываем скелетон или прочерк.
 */
export function useSyncReady(): boolean {
  return useSyncStore((state) => state.lastSync !== null || state.status === 'done' || state.status === 'error');
}

/** «Обновлено 1 окт., 12:00» — подпись к показанным данным; null, если удачной синхронизации ещё не было */
export function useSyncStamp(): string | null {
  const lastSync = useSyncStore((state) => state.lastSync);
  const status = useSyncStore((state) => state.status);
  if (lastSync === null) return null;
  const when = new Date(lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (status === 'done') return `Обновлено ${when}`;
  return `Данные от ${when} · ${status === 'error' ? 'обновить не вышло' : 'обновляем…'}`;
}
