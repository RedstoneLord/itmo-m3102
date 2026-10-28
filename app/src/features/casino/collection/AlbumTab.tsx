import { Clover, Gift, Lock, MessageSquareQuote, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import classicPalettes from 'virtual:classic-palettes';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { useSettingsStore } from '../../settings/settingsStore';
import { EMOTES, fmt, perksOf } from '../../../../../js/casino-common.js';
import { GREETING_PACKS } from '../../../../../js/greetings.js';
import { CATALOG, FREE_ITEMS, ITEM, isEquipped, pityOf, type CatalogItem } from '../../../../../js/slots-math.js';
import { icon } from '../../../../../js/slots-art.js';
import { ItemCard, type CardAction } from './ItemCard';
import { HedgehogPreview } from './HedgehogPreview';
import { TablePreview } from './TablePreview';
import { allHats, type Hat } from './hats';
import type { Collection } from './useCollection';
import styles from './CollectionPage.module.css';

interface KindInfo {
  kind: string;
  label: string;
  note: string;
}

/** Порядок разделов: сначала то, что видно на ёжике и за столом, потом остальное */
const KINDS: KindInfo[] = [
  { kind: 'hat', label: 'Шляпы', note: 'Надеваются на ёжика в игре «Ёжик-кувырок»; у многих есть бонус' },
  { kind: 'theme', label: 'Темы', note: 'Рамка автомата и оформление казино' },
  { kind: 'felt', label: 'Сукно', note: 'Цвет игровых столов в блэкджеке и рулетке' },
  { kind: 'chips', label: 'Фишки', note: 'Фишки за столами; у некоторых есть небольшой бонус' },
  { kind: 'cardback', label: 'Рубашки', note: 'Рубашка карт в блэкджеке' },
  { kind: 'emote', label: 'Эмоции', note: 'Реплики ёжика-крупье за столами' },
  { kind: 'perkcharm', label: 'Талисманы', note: 'Небольшие бонусы в играх' },
  { kind: 'title', label: 'Титулы', note: 'Подпись рядом с вашим именем в слотах' },
  { kind: 'palette', label: 'Палитры', note: 'Цвета всего сайта, применяются сразу' },
  { kind: 'greeting', label: 'Шутки', note: 'Новые шутки в приветствии на главной' },
  { kind: 'boost', label: 'Бонусы', note: 'Расходуются в начале забега ёжика' },
];

/** Вид, где предмет можно снять: талисманы, сукно и т. д. Тему и титул только меняют на другие. */
const REMOVABLE = new Set(['felt', 'chips', 'cardback', 'emote', 'perkcharm']);

const EMOJI_PREFIX = /^\p{Extended_Pictographic}️?\s*/u;

function ownedCount(c: Collection, id: string): number {
  return (c.S.album[id] ?? 0) || (FREE_ITEMS.includes(id) ? 1 : 0);
}

/** Реплики эмоций у него начинаются с эмодзи — на сайте их нет */
const emoteText = (id: string) => (EMOTES[id] ?? '').replace(EMOJI_PREFIX, '');

function HatCard({ c, hat }: { c: Collection; hat: Hat }) {
  const owned = c.H.owned.includes(hat.id);
  const worn = c.H.hat === hat.id;
  const canBuy = !owned && hat.cost > 0;
  const missing = Math.max(0, hat.cost - c.H.berries);
  let action: CardAction | undefined;
  if (owned) {
    if (hat.id === 'none')
      action = worn ? { label: 'Выбрано', done: true } : { label: 'Снять шляпу', variant: 'ghost', onClick: () => c.wearHat('none') };
    else
      action = worn ? { label: 'Снять', variant: 'ghost', onClick: () => c.wearHat('none') } : { label: 'Надеть', onClick: () => c.wearHat(hat.id) };
  } else if (canBuy) {
    action = {
      label: `Купить за ${hat.cost}`,
      variant: 'primary',
      disabled: missing > 0,
      onClick: () => {
        if (c.buyHat(hat.id, hat.cost)) c.audio.win('small');
      },
    };
  }
  return (
    <ItemCard
      name={owned || canBuy ? hat.name : 'Секретная шляпа'}
      note={owned || canBuy ? hat.perk || 'Просто красиво' : hat.source}
      rarity={hat.rarity}
      locked={!owned && !canBuy}
      active={worn && hat.id !== 'none'}
      preview={<HedgehogPreview hat={hat.id} width={124} silhouette={!owned && !canBuy} />}
      action={action}
      hint={canBuy && missing > 0 ? `Не хватает ${fmt(missing)} ягод` : undefined}
    />
  );
}

/** Картинка предмета по виду: что-то из оформления стола — миниатюра стола с этим предметом, остальное — своя */
function Preview({ c, item }: { c: Collection; item: CatalogItem }) {
  const id = item.id;
  switch (item.kind) {
    case 'theme':
    case 'felt':
    case 'chips':
    case 'cardback':
      return <TablePreview state={c.S} overlay={id} />;
    case 'emote':
      return (
        <div className={styles.bubble}>
          <MessageSquareQuote size={16} strokeWidth={1.75} aria-hidden />
          <span>{emoteText(id)}</span>
        </div>
      );
    case 'perkcharm':
      return (
        <div className={styles.glyph}>
          <Clover size={34} strokeWidth={1.5} aria-hidden />
        </div>
      );
    case 'title':
      return <span className={styles.titlePill}>{item.name.replace(/^Титул:\s*/, '')}</span>;
    case 'palette': {
      const palette = classicPalettes.palettes.find((entry) => entry.id === id.slice(4));
      return palette ? (
        <span className={styles.swatch} style={{ background: `linear-gradient(135deg, ${palette.a}, ${palette.b})` }} />
      ) : (
        <Sparkles size={30} aria-hidden />
      );
    }
    case 'greeting': {
      const quote = GREETING_PACKS[id.slice(6)]?.[0];
      return <p className={styles.quote}>{quote ? `«${quote}»` : 'Новые шутки'}</p>;
    }
    default:
      return (
        <div className={styles.glyph}>
          <Gift size={34} strokeWidth={1.5} aria-hidden />
        </div>
      );
  }
}

function CatalogCard({ c, item }: { c: Collection; item: CatalogItem }) {
  const accent = useSettingsStore((state) => state.accent);
  const accent2 = useSettingsStore((state) => state.accent2);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const count = ownedCount(c, item.id);
  const own = count > 0;
  // Базовая тема в сохранении записана как «forest», а в каталоге это «theme:forest» — у него «Выбрано» для неё не загоралось
  const active = own && (item.kind === 'theme' ? c.S.theme.replace(/^theme:/, '') === item.id.slice(6) : isEquipped(c.S, item.id));
  let action: CardAction | undefined;
  let hint: string | undefined;

  if (own) {
    if (item.kind === 'palette') {
      const palette = classicPalettes.palettes.find((entry) => entry.id === item.id.slice(4));
      if (palette) {
        const on = accent === palette.a && accent2 === palette.b;
        action = on
          ? { label: 'Применена', done: true }
          : { label: 'Применить', onClick: () => setAppearance({ accent: palette.a, accent2: palette.b }) };
      }
    } else if (item.kind === 'boost') {
      hint = `В запасе: ${c.H.boosts[item.id.slice(6)] ?? 0}`;
    } else if (item.kind === 'theme' || item.kind === 'title') {
      action = active ? { label: 'Выбрано', done: true } : { label: 'Выбрать', onClick: () => c.equip(item.id) };
    } else if (REMOVABLE.has(item.kind)) {
      action = active
        ? { label: 'Снять', variant: 'ghost', onClick: () => c.unequip(item.kind) }
        : { label: 'Выбрать', onClick: () => c.equip(item.id) };
    }
  }
  return (
    <ItemCard
      name={own ? item.name : 'Ещё не найдено'}
      note={own ? item.desc : 'Выпадает из капсул'}
      rarity={item.rarity}
      locked={!own}
      active={active && item.kind !== 'palette'}
      count={count}
      preview={
        own ? (
          <Preview c={c} item={item} />
        ) : (
          <div className={styles.glyph}>
            <Lock size={26} strokeWidth={1.5} aria-hidden />
          </div>
        )
      }
      action={action}
      hint={hint}
    />
  );
}

/** Сводка «Сейчас»: ёжик в шляпе и стол с надетым оформлением — всё, что вы выбрали, одним взглядом */
function NowPanel({ c, onOpenCapsule, busy }: { c: Collection; onOpenCapsule: () => void; busy: boolean }) {
  const phone = useMediaQuery('(max-width: 560px)');
  const { S, H } = c;
  const hat = allHats().find((entry) => entry.id === H.hat);
  const name = (id: string | undefined, fallback: string) => (id && ITEM[id] ? ITEM[id].name.replace(/^(Титул|Тема барабанов):\s*/, '') : fallback);
  const rows: [string, string][] = [
    ['Шляпа', hat && hat.id !== 'none' ? hat.name : 'без шляпы'],
    ['Тема', name(S.theme, 'Сайт')],
    ['Сукно', name(S.equip?.felt, 'из темы')],
    ['Фишки', name(S.equip?.chips, 'из темы')],
    ['Рубашка', name(S.equip?.cardback, 'из темы')],
    ['Эмоция', name(S.equip?.emote, 'нет')],
    ['Талисман', name(S.equip?.perkcharm, 'нет')],
    ['Титул', name(S.title, 'Новичок казино')],
  ];
  const pity = pityOf(perksOf(H, S));
  return (
    <section className={styles.now} aria-label="Надето сейчас">
      <div className={styles.nowHog}>
        <HedgehogPreview hat={H.hat} width={phone ? 128 : 176} />
        <TablePreview state={S} large />
      </div>
      <dl className={styles.nowList}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.shelf}>
        <span
          className={styles.caps}
          dangerouslySetInnerHTML={{ __html: ['common', 'rare', 'epic', 'legendary'].map((r) => icon(`cap-${r}`, 36)).join('') }}
        />
        <div className={styles.shelfText}>
          <strong>Капсул: {S.capsules}</strong>
          <small>Эпическая выпадает не позже {pity}-й капсулы. Капсулы дают ежедневные спины, колесо дня и достижения.</small>
        </div>
        <Button variant="primary" disabled={S.capsules < 1 || busy} onClick={onOpenCapsule}>
          Открыть капсулу
        </Button>
      </div>
    </section>
  );
}

interface AlbumTabProps {
  c: Collection;
  busy: boolean;
  onOpenCapsule: () => void;
}

export function AlbumTab({ c, busy, onOpenCapsule }: AlbumTabProps) {
  const [filter, setFilter] = useState('all');
  const hats = useMemo(allHats, []);
  const visible = KINDS.filter((info) => filter === 'all' || filter === info.kind);
  const counts = (kind: string) => {
    if (kind === 'hat') {
      const have = hats.filter((hat) => c.H.owned.includes(hat.id)).length;
      return `${have} из ${hats.length}`;
    }
    const items = CATALOG.filter((item) => item.kind === kind);
    return `${items.filter((item) => ownedCount(c, item.id) > 0).length} из ${items.length}`;
  };

  return (
    <div className={styles.album}>
      <NowPanel c={c} onOpenCapsule={onOpenCapsule} busy={busy} />
      <div className={styles.filters} role="group" aria-label="Что показать" data-fade-x>
        {[{ kind: 'all', label: 'Всё' }, ...KINDS].map((info) => (
          <button
            key={info.kind}
            type="button"
            className={cn(styles.filter, filter === info.kind && styles.filterOn)}
            aria-pressed={filter === info.kind}
            onClick={() => setFilter(info.kind)}
          >
            {info.label}
            {info.kind !== 'all' && <span>{counts(info.kind)}</span>}
          </button>
        ))}
      </div>
      {visible.map((info) => (
        <section key={info.kind} className={styles.kind} aria-labelledby={`kind-${info.kind}`}>
          <header className={styles.kindHead}>
            <h3 id={`kind-${info.kind}`}>{info.label}</h3>
            <span>{counts(info.kind)}</span>
            <p>{info.note}</p>
          </header>
          <div className={styles.grid}>
            {info.kind === 'hat'
              ? hats.map((hat) => <HatCard key={hat.id} c={c} hat={hat} />)
              : CATALOG.filter((item) => item.kind === info.kind).map((item) => <CatalogCard key={item.id} c={c} item={item} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
