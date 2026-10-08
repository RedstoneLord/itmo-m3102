import { useSearchParams } from 'react-router';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { useGroupStore } from '../group/groupStore';
import { useHomeworkStore } from '../homework/homeworkStore';
import styles from './DeadlinesTabs.module.css';

export type DeadlinesTab = 'deadlines' | 'homework';

/** Вкладка — в адресе (?tab=homework): «Назад» возвращает на прошлую вкладку, а старый адрес /homework открывает ДЗ */
export function useDeadlinesTab(): DeadlinesTab {
  const [params] = useSearchParams();
  return params.get('tab') === 'homework' ? 'homework' : 'deadlines';
}

/** Вкладки «Дедлайны | Домашние задания» с числом несделанного — видно, что осталось, не переключаясь */
export function DeadlinesTabs({ tab }: { tab: DeadlinesTab }) {
  const [, setParams] = useSearchParams();
  const deadlines = useGroupStore((state) => state.deadlines);
  const deadlinesDone = useGroupStore((state) => state.deadlinesDone);
  const homework = useHomeworkStore((state) => state.items);
  const homeworkDone = useHomeworkStore((state) => state.done);

  const items: TabItem<DeadlinesTab>[] = [
    { value: 'deadlines', label: 'Дедлайны', count: deadlines.filter((item) => !deadlinesDone[item.id]).length },
    { value: 'homework', label: 'Домашние задания', count: homework.filter((item) => !homeworkDone[item.id]).length },
  ];

  return (
    <Tabs
      label="Дедлайны и домашние задания"
      items={items}
      value={tab}
      onChange={(value) => setParams(value === 'deadlines' ? {} : { tab: value })}
      className={styles.tabs}
    />
  );
}
