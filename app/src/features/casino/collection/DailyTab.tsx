import { Dices, Gift } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import { pluralize } from '../../../lib/pluralize';
import { perksOf, reduce, toast } from '../../../../../js/casino-common.js';
import {
  DAILY_BET,
  DAILY_SPINS,
  WHEEL,
  addDay,
  cryptoRng,
  dailyClaim,
  dailyPreview,
  dayKey,
  wheelPick,
  wheelReady,
} from '../../../../../js/slots-math.js';
import type { Collection } from './useCollection';
import styles from './CollectionPage.module.css';

const SEGMENT = 360 / WHEEL.length;
const R = 100;
const MID = 110;

function point(angle: number, radius: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [MID + radius * Math.cos(rad), MID + radius * Math.sin(rad)];
}

/** Ячейка колеса: ягоды — два акцента по очереди, капсула — жёлтая, бесплатный спин — зелёная */
function segmentFill(segment: (typeof WHEEL)[number], index: number): string {
  if (segment.k === 'cap') return 'var(--color-warning)';
  if (segment.k === 'spin') return 'var(--color-success)';
  return index % 2 ? 'var(--color-accent-2)' : 'var(--color-accent)';
}

function Wheel({ angle, animated }: { angle: number; animated: boolean }) {
  return (
    <div className={styles.wheelWrap}>
      <svg viewBox="0 0 220 220" className={styles.wheelSvg} role="img" aria-label="Колесо дня">
        <g
          style={{
            transformOrigin: `${MID}px ${MID}px`,
            transform: `rotate(${angle}deg)`,
            transition: animated ? 'transform 4.6s cubic-bezier(.12,.7,.15,1)' : 'none',
          }}
        >
          {WHEEL.map((segment, index) => {
            const [x0, y0] = point(index * SEGMENT - SEGMENT / 2, R);
            const [x1, y1] = point((index + 1) * SEGMENT - SEGMENT / 2, R);
            const [tx, ty] = point(index * SEGMENT, 68);
            return (
              <g key={index}>
                <path
                  d={`M${MID} ${MID}L${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z`}
                  fill={segmentFill(segment, index)}
                  stroke="var(--color-bg-elevated)"
                  strokeWidth="2"
                />
                <g transform={`rotate(${index * SEGMENT} ${tx.toFixed(1)} ${ty.toFixed(1)})`}>
                  {segment.k === 'b' ? (
                    <text x={tx.toFixed(1)} y={(ty + 5).toFixed(1)} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
                      {segment.v}
                    </text>
                  ) : (
                    <text x={tx.toFixed(1)} y={(ty + 4).toFixed(1)} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
                      {segment.k === 'cap' ? 'капсула' : 'спин'}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
          <circle cx={MID} cy={MID} r="14" fill="var(--color-bg-elevated)" stroke="var(--color-border-strong)" strokeWidth="2" />
        </g>
      </svg>
      <span className={styles.pointer} aria-hidden="true" />
    </div>
  );
}

/** Ежедневные спины (серия из 7 дней) и колесо дня, которое заряжают три цели дня в игре «Ёжик» */
export function DailyTab({ c }: { c: Collection }) {
  const { S, H } = c;
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const alive = useRef(true);
  const timers = useRef(new Set<number>());
  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const perks = perksOf(H, S);
  const preview = dailyPreview(S);
  const yesterday = dayKey(addDay(new Date(), -1));
  const chain = S.lastDay === dayKey() || S.lastDay === yesterday ? S.streak : 0;
  const extra = Number(perks.dailyExtra) || 0;

  const claim = () => {
    const result = dailyClaim(S, new Date(), perks);
    if (!result) return;
    c.audio.win('good');
    toast(
      `+${result.spins} ${pluralize(result.spins, ['бесплатный спин', 'бесплатных спина', 'бесплатных спинов'])}${result.capsule ? ' и капсула' : ''}`,
    );
    if (result.streak === 7) {
      c.award('meow');
      toast('Мяу. Семь дней подряд — кот одобряет.');
    }
    c.save();
  };

  const goals = H.daily && H.daily.date === dayKey() ? H.daily.goals.filter((goal) => goal.done).length : 0;
  const ready = wheelReady(S, H);
  const spin = () => {
    if (spinning || !wheelReady(S, H)) return;
    setSpinning(true);
    const index = wheelPick(cryptoRng());
    const segment = WHEEL[index];
    if (!segment) return;
    S.wheelDay = dayKey();
    if (segment.k === 'b') H.berries += segment.v ?? 0;
    else if (segment.k === 'cap') S.capsules++;
    else H.bonusSpins = (H.bonusSpins | 0) + 1;
    c.save();
    const finish = () => {
      if (!alive.current) return;
      const prize = segment.k === 'b' ? `+${segment.v} ягод` : segment.k === 'cap' ? 'капсула' : '+1 бесплатный спин';
      toast(`Колесо: ${prize}`);
      c.audio.win('good');
      c.fx.burst(50);
      setSpinning(false);
    };
    setAngle(360 * 5 + (360 - index * SEGMENT));
    if (reduce()) later(finish, 200);
    else {
      // Щелчки замедляются вместе с колесом
      let at = 0;
      let step = 60;
      while (at < 4300) {
        later(() => c.audio.wheelTick(), at);
        at += step;
        step *= 1.08;
      }
      later(finish, 4800);
    }
  };

  return (
    <div className={styles.daily}>
      <section className={styles.panel} aria-labelledby="daily-title">
        <header className={styles.panelHead}>
          <h3 id="daily-title">Ежедневные спины</h3>
          <span>серия: {chain}</span>
        </header>
        <ol className={styles.days}>
          {DAILY_SPINS.map((spins, index) => (
            <li key={index} className={cn(index < chain && styles.dayDone, preview.can && index + 1 === preview.streak && styles.dayNext)}>
              <span>День {index + 1}</span>
              <b>
                {index === 6 ? <Gift size={14} aria-hidden /> : <Dices size={14} aria-hidden />}
                {spins + extra}
                {perks.crown && index === 6 ? '+1' : ''}
              </b>
            </li>
          ))}
        </ol>
        <Button variant="primary" disabled={!preview.can} onClick={claim}>
          {preview.can ? `Забрать спины (день ${preview.streak})` : 'Сегодня уже забрано'}
        </Button>
        <p className={styles.panelHint}>
          Пропустишь день — серия начнётся заново. На 7-й день — капсула. Бесплатные спины идут на ставке {DAILY_BET} и не копят джекпот.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="wheel-title">
        <header className={styles.panelHead}>
          <h3 id="wheel-title">Колесо дня</h3>
          <span>{ready ? 'заряжено' : `цели: ${goals}/3`}</span>
        </header>
        <Wheel angle={angle} animated={spinning} />
        <Button variant="primary" disabled={!ready || spinning} onClick={spin}>
          {S.wheelDay === dayKey() ? 'Сегодня уже крутили' : 'Крутить колесо'}
        </Button>
        <p className={styles.panelHint}>Выполни все три цели дня в игре «Ёжик-кувырок» — колесо заряжается раз в сутки.</p>
      </section>
    </div>
  );
}
