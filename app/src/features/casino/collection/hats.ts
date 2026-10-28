import { ITEM, RARITY, type Rarity } from '../../../../../js/slots-math.js';
import { HATS } from '../../game/hedgehogGame.js';

/** Шляпа гардероба: магазин игры «Ёжик» (за ягоды) плюс секретные шляпы из капсул и находок */
export interface Hat {
  id: string;
  name: string;
  /** Что даёт в игре */
  perk: string;
  /** Цена в магазине; 0 — в магазине не продаётся */
  cost: number;
  /** Редкость у шляп из капсул (из каталога группы) */
  rarity?: Rarity;
  /** Как получить, пока шляпы нет */
  source: string;
}

const PERK_PREFIX = /^Игра:\s*/;

/** Все шляпы в порядке: без шляпы, магазин по цене, затем секретные */
export function allHats(): Hat[] {
  return HATS.map((hat): Hat => {
    const catalog = ITEM[`hat:${hat.id}`];
    const perk = hat.perk ?? catalog?.desc.replace(PERK_PREFIX, '') ?? '';
    const source = catalog
      ? `Выпадает из капсул (${RARITY[catalog.rarity].name.toLowerCase()})`
      : hat.cost > 0
        ? `Продаётся в магазине за ${hat.cost}`
        : 'Секретная — её находят в игре';
    return { id: hat.id, name: hat.name, perk, cost: hat.secret ? 0 : hat.cost, rarity: catalog?.rarity, source };
  });
}
