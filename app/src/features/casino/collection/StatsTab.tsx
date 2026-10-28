import { Lock, Trophy } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { ACH, fmt } from '../../../../../js/casino-common.js';
import type { Collection } from './useCollection';
import styles from './CollectionPage.module.css';

type Row = [label: string, value: string];

/** Достижения (за каждое — капсула) и счётчики по играм */
export function StatsTab({ c }: { c: Collection }) {
  const stats = c.S.stats;
  const n = (key: string) => fmt(stats[key] ?? 0);
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Слоты',
      rows: [
        ['Спинов', n('spins')],
        ['Поставлено', `${n('wagered')} ягод`],
        ['Выиграно', `${n('won')} ягод`],
        ['Лучший куш', `${n('biggest')} ягод`],
        ['Фриспинов', n('fs')],
        ['Полян', n('picks')],
        ['Джекпотов', n('jackpots')],
        ['«Удвоить»', `${stats.gambleWins ?? 0}/${stats.gambles ?? 0}`],
      ],
    },
    {
      title: 'Блэкджек',
      rows: [
        ['Побед', n('bjWins')],
        ['Выиграно', `${n('bjWon')} ягод`],
        ['Блэкджеков', n('bjBlackjacks')],
        ['Чарли (5 карт)', n('bjCharlies')],
        ['Ничьих', n('bjPushes')],
        ['Лучший стрик', n('bjStreak')],
      ],
    },
    {
      title: 'Рулетка',
      rows: [
        ['Вращений', n('rouletteSpins')],
        ['Поставлено', `${n('rouletteWagered')} ягод`],
        ['Выиграно', `${n('rouletteWon')} ягод`],
        ['Счастливый Hot', n('rouletteHotHits')],
        ['Выпадений Зеро', n('rouletteZeros')],
      ],
    },
  ];
  const done = Object.keys(c.S.ach).length;

  return (
    <div className={styles.daily}>
      <section className={styles.panel} aria-labelledby="ach-title">
        <header className={styles.panelHead}>
          <h3 id="ach-title">Достижения</h3>
          <span>
            {done} из {ACH.length}
          </span>
        </header>
        <ul className={styles.achList}>
          {ACH.map((achievement) => {
            const got = Boolean(c.S.ach[achievement.id]);
            return (
              <li key={achievement.id} className={cn(got && styles.achDone)}>
                {got ? <Trophy size={18} strokeWidth={1.75} aria-hidden /> : <Lock size={18} strokeWidth={1.75} aria-hidden />}
                <div>
                  <strong>{achievement.name}</strong>
                  <small>{achievement.desc.replace(/\s*🍓/gu, ' ягод')}</small>
                </div>
              </li>
            );
          })}
        </ul>
        <p className={styles.panelHint}>За каждое достижение — капсула.</p>
      </section>

      <section className={styles.panel} aria-labelledby="stats-title">
        <header className={styles.panelHead}>
          <h3 id="stats-title">Статистика</h3>
        </header>
        {groups.map((group) => (
          <div key={group.title} className={styles.statGroup}>
            <h4>{group.title}</h4>
            <dl className={styles.statList}>
              {group.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}
