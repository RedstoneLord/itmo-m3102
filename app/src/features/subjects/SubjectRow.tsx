import { Link } from 'react-router';
import { ListItem } from '../../components/ui/List';
import { formatShortDate } from '../../lib/dates';
import { pluralize } from '../../lib/pluralize';
import { useClock } from '../../lib/useClock';
import { useSyncReady } from '../../services/syncStore';
import type { Subject } from '../../types/models';
import { useGroupStore } from '../group/groupStore';
import { useLectureNotesStore } from '../materials/lectureNotesStore';
import { useMaterialsStore } from '../materials/materialsStore';
import { useTasksStore } from '../tasks/tasksStore';
import { getNextDeadline, getOpenTasks, getOverdueCount } from './subjectStats';
import styles from './SubjectRow.module.css';

interface SubjectRowProps {
  subject: Subject;
}

/** Строка предмета: буква-монограмма, название (ссылка на страницу предмета), преподаватель, счётчики, ближайший дедлайн. */
export function SubjectRow({ subject }: SubjectRowProps) {
  const { today } = useClock();
  const ready = useSyncReady();
  const tasks = useTasksStore((state) => state.tasks);
  const materials = useMaterialsStore((state) => state.materials);
  const lectureNotes = useLectureNotesStore((state) => state.lectureNotes);
  const deadlines = useGroupStore((state) => state.deadlines);
  const done = useGroupStore((state) => state.deadlinesDone);

  const openTaskCount = getOpenTasks(tasks, subject.id).length;
  // Как вкладка «Материалы» предмета: файлы без ссылок + конспекты
  const materialCount =
    materials.filter((material) => material.subjectId === subject.id && material.type !== 'link').length +
    lectureNotes.filter((note) => note.subjectId === subject.id && !note.archived).length;
  const nextDeadline = getNextDeadline(tasks, subject.id, today, { deadlines, done });
  const overdue = getOverdueCount(tasks, subject.id, today, { deadlines, done });

  return (
    <ListItem
      className={styles.row}
      leading={
        <span className={styles.monogram} aria-hidden>
          {subject.name.charAt(0)}
        </span>
      }
      title={
        <Link to={`/subjects/${subject.id}`} className={styles.titleLink} data-morph data-row-action>
          {subject.name}
        </Link>
      }
      meta={subject.teacherPrimary ?? 'Преподаватель не указан'}
      trailing={
        <>
          <span className={styles.stat}>{pluralize(openTaskCount, ['задача', 'задачи', 'задач'])}</span>
          <span className={styles.stat}>{ready ? pluralize(materialCount, ['материал', 'материала', 'материалов']) : '—'}</span>
          <span className={styles.deadline}>
            {overdue > 0 ? `Просрочено: ${overdue}` : nextDeadline ? `Срок ${formatShortDate(nextDeadline)}` : ready ? 'Нет дедлайнов' : '—'}
          </span>
        </>
      }
    />
  );
}
