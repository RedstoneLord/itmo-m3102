import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localStore, storageKey } from '../../lib/storage';
import type { ISODate } from '../../types/models';
import { rate, type CardState, type Rating } from './schedule';

interface CardStore {
  /** Ступень и срок повтора по id карточки (`<ключ файла>#<id>`); у ни разу не оценённых записи нет */
  states: Record<string, CardState>;
  /** Сначала написать ответ по памяти, потом открывать: так запоминается лучше, чем просто перевернуть */
  writeFirst: boolean;
  rate: (id: string, rating: Rating, today: ISODate) => void;
  setWriteFirst: (value: boolean) => void;
  /** Забыть прогресс карточек с этим началом id (одна лекция) или все */
  reset: (prefix?: string) => void;
}

/** Личный прогресс по карточкам — только в браузере; попадает в резервную копию вместе с остальными ключами `m3102:*` */
export const useCardStore = create<CardStore>()(
  persist(
    (set) => ({
      states: {},
      writeFirst: false,
      rate: (id, rating, today) => set((state) => ({ states: { ...state.states, [id]: rate(state.states[id], rating, today) } })),
      setWriteFirst: (writeFirst) => set({ writeFirst }),
      reset: (prefix) =>
        set((state) => ({
          states: prefix === undefined ? {} : Object.fromEntries(Object.entries(state.states).filter(([id]) => !id.startsWith(prefix))),
        })),
    }),
    { name: storageKey('cards'), storage: localStore },
  ),
);
