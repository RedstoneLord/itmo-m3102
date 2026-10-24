import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localStore, storageKey } from '../../lib/storage';

interface MeStore {
  /** GitHub-логин студента группы, которым человек назвался («Найти себя»); null — не выбрано. Только в этом браузере */
  login: string | null;
  /** «Я гость»: человек не из группы — выбор сделан, подсвечивать и спрашивать больше нечего */
  guest: boolean;
  setMe: (login: string | null) => void;
  setGuest: () => void;
}

/** «Кто я»: без аккаунтов — человек сам выбирает себя из списка группы (или «гость»), сайт запоминает и подсвечивает его записи в очередях */
export const useMeStore = create<MeStore>()(
  persist(
    (set) => ({
      login: null,
      guest: false,
      setMe: (login) => set({ login, guest: false }),
      setGuest: () => set({ login: null, guest: true }),
    }),
    {
      name: storageKey('me'),
      storage: localStore,
      version: 2,
      // v2: появился «гость». Прежний выбор сохраняется как есть
      migrate: (persisted) => ({ login: (persisted as { login?: string | null } | null)?.login ?? null, guest: false }),
    },
  ),
);
