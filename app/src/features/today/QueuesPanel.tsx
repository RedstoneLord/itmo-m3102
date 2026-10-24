import { useEffect } from 'react';
import { Link } from 'react-router';
import { SECTIONS } from '../../app/navigation';
import { Dropdown } from '../../components/ui/Dropdown';
import { LinesSkeleton } from '../../components/ui/LinesSkeleton';
import { Section } from '../../components/ui/Section';
import { pluralize } from '../../lib/pluralize';
import { useSyncReady } from '../../services/syncStore';
import { orderDeadlines, splitDeadlineName } from '../deadlines/deadlineInfo';
import { queuePlace, useQueueStore, type QueueEntry } from '../deadlines/queueStore';
import { useGroupStore, type GroupDeadline } from '../group/groupStore';
import { useMeChoice } from '../group/studentOptions';
import { SectionLink } from './HomePanels';
import styles from './HomePanels.module.css';

/** Сколько очередей видно на главной; остальные — на странице «Дедлайны» */
const SHOWN = 4;

export interface MyQueue {
  item: GroupDeadline;
  place: number;
  total: number;
}

/** Очереди невыполненных сроков, в которых стоит этот студент, — ближайшие впереди, просроченные после них */
export function myQueues(deadlines: GroupDeadline[], done: Record<string, boolean>, queues: Record<string, QueueEntry[]>, login: string): MyQueue[] {
  return orderDeadlines(deadlines, done).flatMap((item) => {
    const queue = queues[item.id] ?? [];
    const place = done[item.id] ? null : queuePlace(queue, login);
    return place === null ? [] : [{ item, place, total: queue.length }];
  });
}

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/**
 * «Мои очереди»: где человек стоит на сдачу и под каким номером. Кто он — по выбору «Кто вы?» (без аккаунтов); пока не выбрано,
 * блок сам предлагает выбрать себя или «Я гость»; у гостя блока нет (TodayPage его не рисует).
 */
export function QueuesPanel() {
  const choice = useMeChoice();
  const deadlines = useGroupStore((state) => state.deadlines);
  const done = useGroupStore((state) => state.deadlinesDone);
  const { queues, at, error, refreshIfStale } = useQueueStore();
  const ready = useSyncReady();
  const login = choice.login;

  // Очередь тянем, только когда она нужна: человек выбран
  useEffect(() => {
    if (login) refreshIfStale();
  }, [login, refreshIfStale]);

  const action = <SectionLink to={SECTIONS.deadlines.path}>Дедлайны</SectionLink>;

  if (!login) {
    return (
      <Section title="Мои очереди" action={action}>
        <p className={styles.empty}>Выберите себя — покажем, где вы стоите в очередях на сдачу.</p>
        <Dropdown
          aria-label="Кто вы"
          placeholder="Кто вы?"
          searchPlaceholder="Фамилия или ник на GitHub"
          searchable
          menuWidth={320}
          options={choice.options}
          value={choice.value}
          onChange={choice.onChange}
        />
      </Section>
    );
  }

  const mine = myQueues(deadlines, done, queues, login);
  return (
    <Section title="Мои очереди" meta={mine.length > 0 ? mine.length : undefined} action={action}>
      {!ready || (at === 0 && !error) ? (
        <LinesSkeleton label="Загружаем очереди" />
      ) : at === 0 ? (
        <p className={styles.empty}>Очередь не загрузилась: {error}.</p>
      ) : mine.length === 0 ? (
        <p className={styles.empty}>Вы пока ни в одной очереди. Записаться можно на странице «Дедлайны».</p>
      ) : (
        <>
          {mine.slice(0, SHOWN).map(({ item, place, total }) => {
            const { tag, title } = splitDeadlineName(item.name);
            return (
              <div key={item.id} className={styles.linkRow}>
                <Link to={SECTIONS.deadlines.path} className={styles.rowLink}>
                  <span className={styles.detail}>
                    <strong>{title}</strong>
                    <small>
                      {tag && `${tag} · `}до {dayMonth(item.deadline)}
                    </small>
                  </span>
                  <span className={styles.when}>
                    <strong>№{place}</strong>
                    <small>из {total}</small>
                  </span>
                </Link>
              </div>
            );
          })}
          {mine.length > SHOWN && (
            <p className={styles.empty}>И ещё {pluralize(mine.length - SHOWN, ['очередь', 'очереди', 'очередей'])} — на странице «Дедлайны».</p>
          )}
        </>
      )}
    </Section>
  );
}
