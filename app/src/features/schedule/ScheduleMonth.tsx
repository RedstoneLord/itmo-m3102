import type { Event, ISODate, Task } from '../../types/models';
import type { CalendarData } from '../calendar/calendarEntries';
import { CalendarMonthView } from '../calendar/CalendarMonthView';
import { useEventsStore } from '../calendar/eventsStore';
import { useGroupStore } from '../group/groupStore';
import { useHomeworkStore } from '../homework/homeworkStore';
import { useTasksStore } from '../tasks/tasksStore';
import type { ScheduleData } from './occurrences';

interface ScheduleMonthProps {
  /** Любая дата внутри показанного месяца */
  anchor: ISODate;
  today: ISODate;
  schedule: ScheduleData;
  onOpenDay: (date: ISODate) => void;
  onEditTask: (task: Task) => void;
  onEditEvent: (event: Event) => void;
  onAddEvent: (date: ISODate) => void;
}

/**
 * Месяц расписания: пары, личные задачи и события, дедлайны группы и ДЗ — на одной сетке. Данные берутся здесь, а не на странице,
 * чтобы дни и недели не перерисовывались при каждой правке задач и ДЗ.
 */
export function ScheduleMonth({ anchor, today, schedule, onOpenDay, onEditTask, onEditEvent, onAddEvent }: ScheduleMonthProps) {
  const tasks = useTasksStore((state) => state.tasks);
  const events = useEventsStore((state) => state.events);
  const groupDeadlines = useGroupStore((state) => state.deadlines);
  const deadlinesDone = useGroupStore((state) => state.deadlinesDone);
  const homework = useHomeworkStore((state) => state.items);
  const homeworkDone = useHomeworkStore((state) => state.done);

  const data: CalendarData = { schedule, tasks, events, groupDeadlines, deadlinesDone, homework, homeworkDone };

  return (
    <CalendarMonthView
      anchor={anchor}
      today={today}
      data={data}
      onOpenDay={onOpenDay}
      onEditTask={onEditTask}
      onEditEvent={onEditEvent}
      onAddEvent={onAddEvent}
    />
  );
}
