import { ChevronDown, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Checkbox } from '../../components/ui/Checkbox';
import { cn } from '../../lib/cn';
import { useGroupStore, type GroupDeadline } from '../group/groupStore';
import { useMeStore } from '../group/meStore';
import { DeadlineDetails, formatFull, type DeadlineViewProps } from './DeadlineCard';
import { deadlineInfo, splitDeadlineName } from './deadlineInfo';
import { queuePlace, type QueueEntry } from './queueStore';
import styles from './DeadlinesPage.module.css';

interface DeadlineListProps {
  upcoming: GroupDeadline[];
  overdue: GroupDeadline[];
  finished: GroupDeadline[];
  doneMap: Record<string, boolean>;
  queues: Record<string, QueueEntry[]>;
  queueKnown: boolean;
  onJoined: () => void;
}

/**
 * Сроки одной строкой: название, срок, бейдж, сколько в очереди и мой номер. Нажатие раскрывает то же, что в карточке
 * (запись в очередь, «выполнено», очередь). Три группы со счётчиком: впереди и просроченные открыты сразу (долги не прячем),
 * выполненные свёрнуты.
 */
export function DeadlineList({ upcoming, overdue, finished, doneMap, queues, queueKnown, onJoined }: DeadlineListProps) {
  const rowProps = (item: GroupDeadline) => ({
    item,
    done: Boolean(doneMap[item.id]),
    queue: queues[item.id] ?? [],
    queueKnown,
    onJoined,
  });
  const renderRow = (item: GroupDeadline) => <DeadlineRow key={item.id} {...rowProps(item)} />;
  return (
    <div className={styles.listWrap}>
      <Group title="Впереди" items={upcoming} render={renderRow} />
      <Group title="Просрочено" items={overdue} render={renderRow} tone="danger" />
      <Group title="Выполнено" items={finished} render={renderRow} collapsedByDefault />
    </div>
  );
}

interface GroupProps {
  title: string;
  items: GroupDeadline[];
  render: (item: GroupDeadline) => React.ReactNode;
  tone?: 'danger';
  collapsedByDefault?: boolean;
}

function Group({ title, items, render, tone, collapsedByDefault }: GroupProps) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (items.length === 0) return null;
  return (
    <section className={styles.group}>
      <button
        type="button"
        className={cn(styles.groupHead, tone === 'danger' && styles.groupDanger)}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={14} strokeWidth={2} className={cn(styles.chevron, !open && styles.chevronClosed)} aria-hidden />
        {title}
        <span className={styles.groupCount}>{items.length}</span>
      </button>
      {open && <ul className={styles.list}>{items.map(render)}</ul>}
    </section>
  );
}

function DeadlineRow(props: DeadlineViewProps) {
  const { item, done, queue, queueKnown } = props;
  const toggleDone = useGroupStore((state) => state.toggleDeadlineDone);
  const me = useMeStore((state) => state.login);
  const [open, setOpen] = useState(false);
  const badge = deadlineInfo(item.deadline);
  const myPlace = queuePlace(queue, me);
  const { tag, title } = splitDeadlineName(item.name);

  return (
    <li className={cn(styles.row, done && styles.done)}>
      <div className={styles.rowHead}>
        <Checkbox
          celebrate
          aria-label={`Выполнено для меня: ${item.name}`}
          checked={done}
          onChange={(event) => toggleDone(item.id, event.target.checked)}
        />
        <button type="button" className={styles.rowMain} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className={styles.rowTitle}>
            {tag && <span className={styles.tag}>{tag}</span>}
            {title}
          </span>
          <span className={styles.rowNote}>
            до {formatFull(item.deadline)}
            {item.note && ` · ${item.note}`}
          </span>
        </button>
        <span className={styles.rowMeta}>
          {myPlace && <span className={styles.myPlace}>Вы №{myPlace}</span>}
          <span className={styles.rowQueue}>
            <Users size={14} strokeWidth={1.75} aria-hidden />
            {queueKnown ? `${queue.length} в очереди` : '—'}
          </span>
          {!done && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className={cn(styles.rowChevron, open && styles.chevronOpen)} aria-hidden />
      </div>
      {open && (
        <div className={styles.rowBody}>
          <DeadlineDetails {...props} />
        </div>
      )}
    </li>
  );
}
