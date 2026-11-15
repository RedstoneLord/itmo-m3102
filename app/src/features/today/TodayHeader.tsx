import { motion } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { RunawayHedgehog } from '../../components/hedgehog/RunawayHedgehog';
import { IconButton } from '../../components/ui/IconButton';
import { pickGreeting, RUNAWAY_GREETING, splitAccentPeriod } from '../../data/greetings';
import { formatFullDate, getWeekdayName } from '../../lib/dates';
import { SPRING_SMOOTH, usePrefersReducedMotion } from '../../lib/motion';
import { WEEK_PARITY_LABELS, type StudyWeek } from '../../lib/studyWeek';
import { useSyncStamp } from '../../services/syncStore';
import type { ISODate } from '../../types/models';
import { isVacation } from '../schedule/occurrences';
import styles from './TodayHeader.module.css';

// Ёжик из игры — отдельным куском: ему всё равно ждать модуль игры, а главный кусок без запаса
const GameHogLane = lazy(() => import('../../components/hedgehog/GameHogLane').then((module) => ({ default: module.GameHogLane })));

interface TodayHeaderProps {
  date: ISODate;
  week: StudyWeek;
  /** Открыть «Настроить главную» — кнопка стоит в шапке, чтобы её было видно без прокрутки */
  onCustomize: () => void;
}

/** Шапка главной, как на сайте группы: случайное приветствие, дата, чётность недели — и ёжик. */
export function TodayHeader({ date, week, onCustomize }: TodayHeaderProps) {
  const [greeting] = useState(pickGreeting);
  const [text, period] = splitAccentPeriod(greeting);
  const reduceMotion = usePrefersReducedMotion();
  const runaway = greeting === RUNAWAY_GREETING;
  const stamp = useSyncStamp();

  return (
    <header className={`${styles.header} ${runaway ? styles.free : ''} hero`}>
      <div className={styles.copy}>
        <motion.h1
          key={greeting}
          className={`${styles.title} hero-title`}
          initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: SPRING_SMOOTH }}
        >
          {text}
          {period && <span className={styles.period}>{period}</span>}
        </motion.h1>
        <p className={styles.sub}>{['Всё важное для группы М3102 — в одном месте.', stamp].filter(Boolean).join(' ')}</p>
        <div className={styles.date}>
          <strong>
            {getWeekdayName(date)}, {formatFullDate(date)}
          </strong>
          {/* «12-я неделя · нечётная»; до начала семестра номера нет — только чётность */}
          <span className={styles.chip}>
            {isVacation(date)
              ? 'Каникулы'
              : week.number >= 1
                ? `${week.number}-я неделя · ${WEEK_PARITY_LABELS[week.weekInCycle].split(' ')[0]!.toLowerCase()}`
                : WEEK_PARITY_LABELS[week.weekInCycle]}
          </span>
          <IconButton className={styles.customize} icon={SlidersHorizontal} label="Настроить главную" size="sm" onClick={onCustomize} />
        </div>
      </div>
      {/* Ёжик бегает по низу шапки, как на сайте группы; «вырвался на свободу» — бегает по всему экрану */}
      {!runaway && (
        <Suspense fallback={null}>
          <GameHogLane />
        </Suspense>
      )}
      {runaway && <RunawayHedgehog />}
    </header>
  );
}
