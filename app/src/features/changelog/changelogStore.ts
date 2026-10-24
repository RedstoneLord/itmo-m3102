import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localStore, storageKey } from '../../lib/storage';
import { useSettingsStore } from '../settings/settingsStore';
import { LATEST_CHANGE } from './latestChange';

interface ChangelogStore {
  /** Последний выпуск, который человек видел («Настройки → Что нового»); null — ещё не заглядывал */
  seen: string | null;
  markSeen: () => void;
}

export const useChangelogStore = create<ChangelogStore>()(
  persist(
    (set) => ({
      seen: null,
      markSeen: () => set({ seen: LATEST_CHANGE }),
    }),
    { name: storageKey('changelog-seen'), storage: localStore, version: 1 },
  ),
);

/**
 * Есть выпуск, который человек не видел. Новому посетителю точку не показываем, пока он не прошёл первый вход
 * (окно «Настройте сайт под себя» само отмечает всё как увиденное — ему нечего «догонять»).
 */
export function useChangelogUnseen(): boolean {
  const seen = useChangelogStore((state) => state.seen);
  const onboarded = useSettingsStore((state) => state.onboarded);
  return onboarded && seen !== LATEST_CHANGE;
}
