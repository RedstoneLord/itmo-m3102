import { ChevronDown, CircleAlert, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { cn } from '../../lib/cn';
import { GROUP_REPO } from '../../services/github';
import { resolveSubjectFolder } from '../../data/m3102';
import { filePath, useGroupStore, type GroupDeadline } from '../group/groupStore';
import { useMeStore } from '../group/meStore';
import { useProfileStore } from '../group/profileStore';
import { deadlineSubjectId } from '../subjects/subjectStats';
import { useSubjectsStore } from '../subjects/subjectsStore';
import { deadlineInfo, splitDeadlineName } from './deadlineInfo';
import { queuePlace, type QueueEntry } from './queueStore';
import styles from './DeadlinesPage.module.css';

/**
 * Метку queue-signup ставит workflow label-deadline-signups.yml в репозитории группы: через ?labels=
 * GitHub разрешает ставить метки только участникам репозитория, у остальных запись терялась.
 * Без имени заголовок — просто «[id]»: человека назовёт его GitHub-аккаунт.
 */
export function joinQueueUrl(deadlineId: string, name: string): string {
  const { owner, repo } = GROUP_REPO;
  const title = name ? `[${deadlineId}] ${name}` : `[${deadlineId}]`;
  return `https://github.com/${owner}/${repo}/issues/new?title=${encodeURIComponent(title)}`;
}

/** Сколько человек видно в очереди без раскрытия: у длинных очередей кнопка записи иначе уезжала за экран */
const QUEUE_PREVIEW = 3;

export const formatFull = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Связи дедлайна: предмет «АИСД - Лаба» → страница предмета, его конспекты и папка лабораторных группы */
function DeadlineLinks({ name }: { name: string }) {
  const subjectId = deadlineSubjectId(name);
  const subjectName = useSubjectsStore((state) => state.subjects.find((subject) => subject.id === subjectId)?.name);
  const labsFolder = useGroupStore((state) => {
    const file = state.files.find(
      (item) => item.path.startsWith('Лабораторные/') && resolveSubjectFolder(item.path.split('/')[1] ?? '') === subjectId,
    );
    return file && file.path.split('/').slice(0, 2).join('/');
  });
  if (!subjectId || !subjectName) return null;
  return (
    <p className={styles.links}>
      <Link to={`/subjects/${subjectId}`}>{subjectName}</Link>
      <Link to={`/materials?s=${subjectId}`}>Конспекты</Link>
      {labsFolder && <Link to={filePath(labsFolder)}>Лабораторные</Link>}
    </p>
  );
}

export interface DeadlineViewProps {
  item: GroupDeadline;
  done: boolean;
  queue: QueueEntry[];
  /** Очередь хоть раз загружалась (показываем сохранённую, даже если обновить сейчас не вышло) */
  queueKnown: boolean;
  onJoined: () => void;
}

/** Всё, что делают со сроком: связи, запись в очередь, «выполнено», сама очередь. Общее для карточки и раскрытой строки списка */
export function DeadlineDetails({ item, done, queue, queueKnown, onJoined }: DeadlineViewProps) {
  const toggleDone = useGroupStore((state) => state.toggleDeadlineDone);
  const openProfile = useProfileStore((state) => state.open);
  const me = useMeStore((state) => state.login);
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const myPlace = queuePlace(queue, me);
  const shown = expanded ? queue : queue.slice(0, QUEUE_PREVIEW);
  // Моя запись глубоко в очереди: без раскрытия она не видна — показываем её отдельно, с настоящим номером
  const pinMine = !expanded && myPlace !== null && myPlace > QUEUE_PREVIEW;

  function join() {
    window.open(joinQueueUrl(item.id, name.trim()), '_blank', 'noopener');
    onJoined();
  }

  return (
    <>
      <DeadlineLinks name={item.name} />

      {/* Действия — над очередью: у длинной очереди кнопка записи иначе уезжала за границу экрана */}
      <form
        className={styles.join}
        onSubmit={(event) => {
          event.preventDefault();
          join();
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Имя (необязательно)"
          aria-label={`Имя для очереди «${item.name}»: можно оставить пустым`}
        />
        <Button type="submit" variant="primary">
          В очередь ↗
        </Button>
      </form>
      <Checkbox celebrate label="Выполнено для меня" checked={done} onChange={(event) => toggleDone(item.id, event.target.checked)} />

      <div className={styles.queueHead}>
        Очередь <span>{queueKnown ? (myPlace ? `Вы №${myPlace} из ${queue.length}` : `${queue.length} чел.`) : 'не загрузилась'}</span>
      </div>
      <ol className={styles.queue}>
        {queue.length === 0 ? (
          <li className={styles.queueEmpty}>{queueKnown ? 'Очередь пока пуста' : 'Появится, когда GitHub ответит'}</li>
        ) : (
          <>
            {shown.map((entry, index) => (
              <QueueRow key={entry.url} entry={entry} place={index + 1} mine={myPlace === index + 1} onOpenProfile={openProfile} />
            ))}
            {pinMine && (
              <>
                <li className={styles.queueGap} aria-hidden>
                  …
                </li>
                <QueueRow entry={queue[myPlace - 1]!} place={myPlace} mine onOpenProfile={openProfile} />
              </>
            )}
          </>
        )}
      </ol>
      {queue.length > QUEUE_PREVIEW && (
        <button type="button" className={styles.queueToggle} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <ChevronDown size={14} strokeWidth={2} className={cn(styles.chevron, expanded && styles.chevronOpen)} aria-hidden />
          {expanded ? 'Свернуть' : `Показать всех · ещё ${queue.length - QUEUE_PREVIEW}`}
        </button>
      )}
    </>
  );
}

export function DeadlineCard(props: DeadlineViewProps) {
  const { item, done } = props;
  const badge = deadlineInfo(item.deadline);
  const { tag, title } = splitDeadlineName(item.name);
  return (
    <article className={cn(styles.card, done && styles.done)} data-spot>
      <div className={styles.cardTop}>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <h3 className={styles.title}>
        {tag && <span className={styles.tag}>{tag}</span>}
        {title}
      </h3>
      <p className={styles.note}>
        до {formatFull(item.deadline)}
        {item.note && ` · ${item.note}`}
      </p>
      <DeadlineDetails {...props} />
    </article>
  );
}

interface QueueRowProps {
  entry: QueueEntry;
  /** Номер в очереди с единицы */
  place: number;
  /** Это я («Найти себя») — строка подсвечена */
  mine: boolean;
  onOpenProfile: (login: string) => void;
}

function QueueRow({ entry, place, mine, onOpenProfile }: QueueRowProps) {
  return (
    <li className={cn(styles.queueRow, mine && styles.mine)}>
      <span className={styles.place}>{place}</span>
      {/* Студент группы — чип с фото: видно, что это человек и его можно открыть; чужой — запись на GitHub */}
      {entry.login ? (
        <button
          type="button"
          className={styles.queuePerson}
          onClick={() => onOpenProfile(entry.login!)}
          aria-label={`${entry.name} — открыть профиль`}
        >
          <img src={`https://github.com/${encodeURIComponent(entry.login)}.png?size=40`} alt="" loading="lazy" />
          {entry.name}
        </button>
      ) : (
        <a href={entry.url} target="_blank" rel="noopener noreferrer">
          {entry.name}
        </a>
      )}
      {entry.outside && (
        <span className={styles.outside} role="img" aria-label="GitHub-аккаунт не из списка группы" title="GitHub-аккаунт не из списка группы">
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden />
        </span>
      )}
      {entry.note && <span className={styles.queueNote}>{entry.note}</span>}
      {/* Заявка студента группы — ссылка на её issue (у чужого запись и есть ссылка с именем) */}
      {entry.login && (
        <a
          className={styles.requestLink}
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Заявка на GitHub"
          aria-label={`Заявка: ${entry.name}, на GitHub`}
        >
          <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
        </a>
      )}
    </li>
  );
}
