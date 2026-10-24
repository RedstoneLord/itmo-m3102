import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localStore, storageKey } from '../../lib/storage';

interface MeStore {
  /** GitHub-логин студента группы, которым человек назвался («Найти себя»); null — не выбрано. Только в этом браузере */
  login: string | null;
  setMe: (login: string | null) => void;
}

/** «Кто я»: без аккаунтов — человек сам выбирает себя из списка группы, сайт запоминает и подсвечивает его записи в очередях */
export const useMeStore = create<MeStore>()(
  persist(
    (set) => ({
      login: null,
      setMe: (login) => set({ login }),
    }),
    { name: storageKey('me'), storage: localStore, version: 1 },
  ),
);
