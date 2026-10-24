import { ChevronDown, ExternalLink, LayoutGrid, List, ListFilter, RefreshCw, UserSearch } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, buttonClass } from '../../components/ui/Button';
import { Dropdown } from '../../components/ui/Dropdown';
import { EmptyState } from '../../components/ui/EmptyState';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { LinesSkeleton } from '../../components/ui/LinesSkeleton';
import { PageHeader } from '../../components/ui/PageHeader';
import { useConfettiWhenCleared } from '../../lib/celebrate';
import { cn } from '../../lib/cn';
import { repoEditUrl } from '../../services/github';
import { useSyncReady, useSyncStamp } from '../../services/syncStore';
import { useGroupStore, type GroupDeadline } from '../group/groupStore';
import { useMeChoice } from '../group/studentOptions';
import { HomeworkPage } from '../homework/HomeworkPage';
import { useSubjectsStore } from '../subjects/subjectsStore';
import { orderDeadlines } from './deadlineInfo';
import { useEditMode } from '../settings/EditModeContext';
import { useSettingsStore, type DeadlinesView } from '../settings/settingsStore';
import { useProfileStore } from '../group/profileStore';
import { DeadlineCard } from './DeadlineCard';
import {
  ALL_SUBJECTS,
  DEFAULT_DEADLINE_FILTERS,
  deadlineSubjects,
  filterDeadlines,
  groupDeadlines,
  NO_SUBJECT,
  type DeadlineScope,
} from './deadlineFilters';
import { DeadlineList } from './DeadlineList';
import { DeadlinesTabs, useDeadlinesTab } from './DeadlinesTabs';
import { queuePlace, useQueueStore } from './queueStore';
import styles from './DeadlinesPage.module.css';

/** Дедлайны и домашние задания группы М3102 — две вкладки одной страницы (?tab=homework). */
export function DeadlinesPage() {
  const tab = useDeadlinesTab();
  const tabs = <DeadlinesTabs tab={tab} />;
  return tab === 'homework' ? <HomeworkPage tabs={tabs} /> : <DeadlinesList tabs={tabs} />;
}

const VIEW_OPTIONS: { value: DeadlinesView; label: string; icon: typeof List }[] = [
  { value: 'list', label: 'Список', icon: List },
  { value: 'cards', label: 'Карточки', icon: LayoutGrid },
];

const SCOPE_OPTIONS: { value: DeadlineScope; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Невыполненные' },
];

/** Дедлайны группы М3102: сроки из репозитория, общая очередь сдачи и личные отметки выполнения. */
function DeadlinesList({ tabs }: { tabs: ReactNode }) {
  const { isEditMode } = useEditMode();
  const deadlines = useGroupStore((state) => state.deadlines);
  const doneMap = useGroupStore((state) => state.deadlinesDone);
  const ready = useSyncReady();
  const stamp = useSyncStamp();
  useConfettiWhenCleared(deadlines.filter((item) => !doneMap[item.id]).length);
  const { queues, at: queueAt, error: queueError, loading, refresh, refreshIfStale } = useQueueStore();
  const queueKnown = queueAt > 0;
  const [doneOpen, setDoneOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_DEADLINE_FILTERS);
  const view = useSettingsStore((state) => state.deadlinesView);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const choice = useMeChoice();
  const me = choice.login;
  const subjectNames = useSubjectsStore((state) => state.subjects);

  useEffect(() => {
    // Открыли страницу или вернулись во вкладку — сами обновляем не чаще раза в 2 минуты (лимит GitHub API);
    // кнопка «Обновить» — всегда
    refreshIfStale();
    // Имена в очереди открывают профиль — окно готовим заранее, чтобы первое открытие не ждало загрузки
    useProfileStore.getState().prepare();
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => document.removeEventListener('visibilitychange', refreshIfStale);
  }, [refreshIfStale]);

  const ordered = orderDeadlines(deadlines, doneMap);
  const shownItems = filterDeadlines(ordered, doneMap, filters);
  const { upcoming, overdue, finished } = groupDeadlines(shownItems, doneMap);
  const active = [...upcoming, ...overdue];
  const subjectOptions = [
    { value: ALL_SUBJECTS, label: 'Все предметы' },
    ...deadlineSubjects(deadlines).map((id) => ({
      value: id,
      label: id === NO_SUBJECT ? 'Без предмета' : (subjectNames.find((subject) => subject.id === id)?.name ?? id),
    })),
  ];
  const myQueues = me ? deadlines.filter((item) => !doneMap[item.id] && queuePlace(queues[item.id] ?? [], me) !== null).length : 0;
  const onJoined = () => setTimeout(() => void refresh(), 8000);

  const renderCard = (item: GroupDeadline) => (
    <DeadlineCard
      key={item.id}
      item={item}
      done={Boolean(doneMap[item.id])}
      queue={queues[item.id] ?? []}
      queueKnown={queueKnown}
      onJoined={onJoined}
    />
  );

  return (
    <>
      <PageHeader
        title="Дедлайны"
        subtitle={['Сроки сдачи и очередь группы М3102. Отметки выполнения видны только вам.', stamp].filter(Boolean).join(' ')}
        actions={
          <>
            <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={14} strokeWidth={2} className={cn(loading && styles.spinning)} aria-hidden />
              Обновить
            </Button>
            {isEditMode && (
              <a className={buttonClass('secondary', 'md')} href={repoEditUrl('Дедлайны/deadlines.json')} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                Изменить сроки
              </a>
            )}
          </>
        }
      />
      {tabs}

      {ready && deadlines.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.toolbarStart}>
            <SegmentedControl
              label="Вид дедлайнов"
              options={VIEW_OPTIONS}
              value={view}
              onChange={(value) => setAppearance({ deadlinesView: value })}
            />
            <SegmentedControl
              label="Что показывать"
              options={SCOPE_OPTIONS}
              value={filters.scope}
              onChange={(scope) => setFilters({ ...filters, scope })}
            />
          </div>
          <div className={styles.toolbarEnd}>
            <div className={styles.filter}>
              <Dropdown
                variant="ghost"
                icon={ListFilter}
                aria-label="Предмет"
                options={subjectOptions}
                value={filters.subject}
                onChange={(subject) => setFilters({ ...filters, subject })}
              />
            </div>
            <div className={styles.filter}>
              <Dropdown
                variant="ghost"
                icon={UserSearch}
                aria-label="Найти себя в очередях"
                placeholder="Найти себя"
                searchPlaceholder="Фамилия или ник на GitHub"
                searchable
                menuWidth={320}
                options={choice.options}
                value={choice.value}
                onChange={choice.onChange}
              />
            </div>
          </div>
        </div>
      )}

      {!ready ? (
        <LinesSkeleton label="Загружаем дедлайны" />
      ) : deadlines.length === 0 ? (
        <EmptyState title="Дедлайнов пока нет" description="Они появятся после синхронизации с репозиторием группы." />
      ) : (
        <>
          {me && queueKnown && <p className={styles.meNote}>Вы стоите в очередях: {myQueues}</p>}
          {!me && !choice.guest && (
            <p className={styles.meNote}>
              Кто вы? Выберите себя в списке «Найти себя» — подсветим ваши записи в очередях. Не из группы — выберите «Я гость».
            </p>
          )}
          {view === 'list' ? (
            <DeadlineList
              upcoming={upcoming}
              overdue={overdue}
              finished={finished}
              doneMap={doneMap}
              queues={queues}
              queueKnown={queueKnown}
              onJoined={onJoined}
            />
          ) : active.length > 0 ? (
            <div className={`${styles.grid} stagger`}>{active.map(renderCard)}</div>
          ) : (
            <p className={styles.allDone}>{shownItems.length === 0 ? 'По этому фильтру сроков нет.' : 'Всё выполнено — в работе ничего нет.'}</p>
          )}

          {/* Сделанное не мешает текущему: свёрнуто, раскрывается по кнопке */}
          {view === 'cards' && finished.length > 0 && (
            <section className={styles.finished}>
              <button type="button" className={styles.sectionToggle} aria-expanded={doneOpen} onClick={() => setDoneOpen(!doneOpen)}>
                <ChevronDown size={14} strokeWidth={2} className={cn(styles.chevron, doneOpen && styles.chevronOpen)} aria-hidden />
                Выполнено <span>{finished.length}</span>
              </button>
              {doneOpen && <div className={`${styles.grid} stagger`}>{finished.map(renderCard)}</div>}
            </section>
          )}

          {queueError && (
            <p className={styles.staleNote}>
              {queueKnown ? `Очередь от ${formatClock(queueAt)}: обновить не вышло — ${queueError}.` : `Очередь не загрузилась: ${queueError}.`}
            </p>
          )}
        </>
      )}
    </>
  );
}

/** «14:32», а если не сегодня — «5 окт., 14:32» */
function formatClock(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}
