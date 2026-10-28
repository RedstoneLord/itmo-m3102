import { useEffect, useReducer, useRef } from 'react';
import {
  clearToasts,
  getAudio,
  itemName,
  loadAll,
  makeAwards,
  makeFx,
  saveAll,
  toast,
  type SharedSave,
  type SlotsAudio,
} from '../../../../../js/casino-common.js';
import { equipItem, grantSets, type SlotsState } from '../../../../../js/slots-math.js';

export interface Collection {
  S: SlotsState;
  H: SharedSave;
  audio: SlotsAudio;
  fx: ReturnType<typeof makeFx>;
  award: (id: string) => void;
  /** Выдать награды за собранные наборы и половину/весь альбом, записать и перерисовать */
  settle: () => void;
  /** Записать состояние и перерисовать страницу */
  save: () => void;
  equip: (id: string) => void;
  unequip: (kind: string) => void;
  wearHat: (id: string) => void;
  buyHat: (id: string, cost: number) => boolean;
}

/**
 * Состояние коллекции: слоты (m3102-slots-v1) и общее сохранение с игрой «Ёжик» (hh_save_v1) читаются и пишутся модулями группы
 * (loadAll / saveAll — с подписью и снимком), здесь только React-обёртка. Объекты S и H живут в ref и меняются на месте, как в его странице;
 * после каждого изменения save() пишет их и перерисовывает страницу.
 */
export function useCollection(): Collection {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const ref = useRef<Collection | null>(null);

  if (!ref.current) {
    const { S, H, notes } = loadAll();
    const audio = getAudio();
    const fx = makeFx();
    const save = () => {
      saveAll(S, H);
      rerender();
    };
    const { award, checkAlbum } = makeAwards({ S, audio, itemName, onChange: save });
    const settle = () => {
      grantSets(S);
      checkAlbum();
      save();
    };
    if (notes.length) toast(notes[0] ?? '');
    ref.current = {
      S,
      H,
      audio,
      fx,
      award,
      settle,
      save,
      equip(id) {
        if (equipItem(S, id)) save();
      },
      unequip(kind) {
        if (kind === 'theme') S.theme = 'forest';
        else if (kind === 'title') S.title = 'title:newbie';
        else if (S.equip) delete S.equip[kind];
        save();
      },
      wearHat(id) {
        if (!H.owned.includes(id)) return;
        H.hat = id;
        save();
      },
      buyHat(id, cost) {
        if (H.owned.includes(id) || H.berries < cost) return false;
        H.berries -= cost;
        H.owned.push(id);
        H.hat = id;
        settle();
        return true;
      },
    };
  }

  useEffect(() => {
    const current = ref.current;
    current?.settle();
    return () => {
      if (!current) return;
      current.audio.destroy();
      current.fx.destroy();
      clearToasts();
      saveAll(current.S, current.H);
    };
  }, []);

  return ref.current;
}
