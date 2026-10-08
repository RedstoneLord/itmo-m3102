import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Swap, useDirection } from '../../components/ui/Swap';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { PageHeader } from '../../components/ui/PageHeader';
import { addDays, addMonths, formatMonthLabel, formatWeekRange, getWeekDates, startOfWeek } from '../../lib/dates';
import { getStudyWeek, WEEK_PARITY_LABELS } from '../../lib/studyWeek';
import { useClock } from '../../lib/useClock';
import type { ISODate } from '../../types/models';
import { EventDialog } from '../calendar/EventDialog';
import { useEventDialog } from '../calendar/useEventDialog';
import { TaskDialog } from '../tasks/TaskDialog';
import { useTaskDialog } from '../tasks/useTaskDialog';
import { CalendarSyncButton } from './CalendarSyncDialog';
import { ClassDialog } from './ClassDialog';
import { DayView } from './DayView';
import { ExceptionDialog } from './ExceptionDialog';
import { getOccurrencesForDate, type DaySchedule } from './occurrences';
import { SCHEDULE_VIEWS, ScheduleToolbar, type ScheduleView } from './ScheduleToolbar';
import { ScheduleMonth } from './ScheduleMonth';
import { useEditMode } from '../settings/EditModeContext';
import { useScheduleData } from './scheduleStore';
import { useScheduleDialogs } from './useScheduleDialogs';
import { WeekView } from './WeekView';

/** На телефоне удобнее начинать с одного дня */
function getDefaultView(): ScheduleView {
  return window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week';
}

/**
 * Расписание: день, неделя и месяц. Месяц — бывший «Календарь»: к парам добавлены личные задачи и события, дедлайны группы и ДЗ.
 * Режим — в адресе (?view=day|week|month), поэтому ссылка и «Назад» возвращают на тот же вид, а /calendar открывает месяц.
 */
export function SchedulePage() {
  const { isEditMode } = useEditMode();
  const { today, time } = useClock();
  const scheduleData = useScheduleData();
  const dialogs = useScheduleDialogs();
  const taskDialog = useTaskDialog();
  const eventDialog = useEventDialog();

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const view: ScheduleView = SCHEDULE_VIEWS.find((item) => item === requestedView) ?? getDefaultView();

  function changeView(next: ScheduleView) {
    // replace: переключение вида не должно множить записи в истории; ?date= и прочее остаётся
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        updated.set('view', next);
        return updated;
      },
      { replace: true },
    );
  }

  // Выбранный день. На экране — неделя или месяц, в которые он попадает. ?date=2026-09-24 — открыть нужный день (ссылка из ДЗ)
  const [selectedDate, setSelectedDate] = useState<ISODate>(() => {
    const requested = searchParams.get('date') ?? '';
    return /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  });

  const weekStart = startOfWeek(selectedDate);
  const week = getStudyWeek(weekStart, scheduleData.semesterStart, scheduleData.weekOneStart);
  const period = view === 'month' ? selectedDate.slice(0, 7) : weekStart;
  // Следующий период приезжает справа, предыдущий — слева
  const direction = useDirection(Date.parse(view === 'month' ? `${period}-01` : period));

  const days: DaySchedule[] = getWeekDates(weekStart).map((date) => ({ date, occurrences: getOccurrencesForDate(date, scheduleData) }));

  function move(count: number) {
    setSelectedDate(view === 'month' ? addMonths(selectedDate, count) : addDays(selectedDate, 7 * count));
  }

  function openDay(date: ISODate) {
    setSelectedDate(date);
    changeView('day');
  }

  const subtitle =
    view === 'month'
      ? formatMonthLabel(selectedDate)
      : week.number >= 1
        ? `${WEEK_PARITY_LABELS[week.weekInCycle]} · ${formatWeekRange(weekStart)}`
        : `${formatWeekRange(weekStart)} · До начала семестра`;

  return (
    <>
      <PageHeader
        title="Расписание"
        subtitle={subtitle}
        actions={
          <>
            <CalendarSyncButton />
            {isEditMode && (
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => (view === 'month' ? eventDialog.openCreate(selectedDate) : dialogs.openNewClass(selectedDate))}
              >
                {view === 'month' ? 'Добавить событие' : 'Добавить пару'}
              </Button>
            )}
          </>
        }
      />

      <ScheduleToolbar
        weekInCycle={week.weekInCycle}
        view={view}
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
        onToday={() => setSelectedDate(today)}
        onViewChange={changeView}
      />

      <Swap id={`${view}-${period}`} direction={direction}>
        {view === 'month' ? (
          <ScheduleMonth
            anchor={selectedDate}
            today={today}
            schedule={scheduleData}
            onOpenDay={openDay}
            onEditTask={taskDialog.openEdit}
            onEditEvent={eventDialog.openEdit}
            onAddEvent={eventDialog.openCreate}
          />
        ) : view === 'week' ? (
          <WeekView days={days} today={today} time={time} onAddDate={dialogs.openNewClass} onAction={dialogs.handleAction} />
        ) : (
          <DayView days={days} selectedDate={selectedDate} today={today} time={time} onSelectDate={setSelectedDate} onAction={dialogs.handleAction} />
        )}
      </Swap>

      <ClassDialog target={dialogs.classTarget} onClose={dialogs.closeClassDialog} />
      <ExceptionDialog target={dialogs.exceptionTarget} onClose={dialogs.closeExceptionDialog} />
      <TaskDialog target={taskDialog.target} onClose={taskDialog.close} />
      <EventDialog target={eventDialog.target} onClose={eventDialog.close} />
      <ConfirmDeleteModal
        open={dialogs.isDeleteConfirmOpen}
        title={dialogs.deleteConfirmTitle}
        onCancel={dialogs.cancelDelete}
        onConfirm={dialogs.confirmDelete}
      />
    </>
  );
}
