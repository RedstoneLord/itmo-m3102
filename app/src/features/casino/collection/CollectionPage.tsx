import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import '../../../../../css/casino.css';
import '../../../../../css/casino-themes.css';
import '../casino.css';
import { AnimatedNumber } from '../../../components/ui/AnimatedNumber';
import { buttonClass } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import { applyItem, perksOf } from '../../../../../js/casino-common.js';
import { THEMES } from '../../../../../js/casino-themes.js';
import { ensureSprite } from '../../../../../js/slots-art.js';
import { cryptoRng, openCapsule } from '../../../../../js/slots-math.js';
import { applySiteTheme } from '../siteTheme';
import { AlbumTab } from './AlbumTab';
import { CapsuleDialog, type CapsuleResult } from './CapsuleDialog';
import { DailyTab } from './DailyTab';
import { StatsTab } from './StatsTab';
import { useCollection } from './useCollection';
import styles from './CollectionPage.module.css';

type Tab = 'album' | 'daily' | 'stats';

const TABS: TabItem<Tab>[] = [
  { value: 'album', label: 'Альбом и шляпы' },
  { value: 'daily', label: 'Ежедневно и колесо' },
  { value: 'stats', label: 'Достижения и статистика' },
];

const isTab = (value: string | undefined): value is Tab => TABS.some((tab) => tab.value === value);

// Тема «Сайт» нужна и здесь: миниатюры столов берут её переменные, а значки капсул — спрайт игр
applySiteTheme(THEMES);
ensureSprite();

/**
 * Коллекция казино: шляпы с примеркой, оформление столов, капсулы, ежедневные спины, колесо дня и достижения. Состояние — те же модули группы,
 * что у игр (общее сохранение с «Ёжиком» и слотами), поэтому надетое здесь сразу видно в играх, а страница не требует перезапуска.
 */
export default function CollectionPage() {
  const sub = useParams()['*']?.split('/')[0];
  const tab: Tab = isTab(sub) ? sub : 'album';
  const navigate = useNavigate();
  const c = useCollection();
  const [capsule, setCapsule] = useState<CapsuleResult | null>(null);
  const { S, H } = c;

  const openOne = () => {
    if (S.capsules < 1 || capsule) return;
    S.capsules--;
    const result = openCapsule(cryptoRng(), S, perksOf(H, S));
    applyItem(H, result.item);
    if (result.berries) H.berries += result.berries;
    c.save();
    setCapsule(result);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Коллекция"
        subtitle="Шляпы и оформление столов надеваются сразу — перезаходить в игру не нужно."
        actions={
          <Link to="/casino" className={buttonClass('ghost', 'sm')}>
            <ArrowLeft size={14} strokeWidth={2} aria-hidden /> Казино
          </Link>
        }
      />
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span>Ягоды</span>
          <b>
            <AnimatedNumber value={Math.max(0, Math.floor(H.berries))} />
          </b>
        </div>
        <div className={styles.stat}>
          <span>Бесплатные спины</span>
          <b>{(S.free | 0) + (H.bonusSpins | 0)}</b>
        </div>
        <div className={styles.stat}>
          <span>Капсулы</span>
          <b>{S.capsules | 0}</b>
        </div>
      </div>
      <Tabs
        items={TABS}
        value={tab}
        label="Разделы коллекции"
        onChange={(value) => navigate(`/collection/${value}`, { replace: true })}
        className={styles.tabs}
      />
      {tab === 'album' && <AlbumTab c={c} busy={capsule !== null} onOpenCapsule={openOne} />}
      {tab === 'daily' && <DailyTab c={c} />}
      {tab === 'stats' && <StatsTab c={c} />}
      {capsule && <CapsuleDialog c={c} result={capsule} onClose={() => setCapsule(null)} />}
    </div>
  );
}
