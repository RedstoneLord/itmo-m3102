import { useState } from 'react';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { cn } from '../../lib/cn';
import { useSettingsStore } from '../settings/settingsStore';
import { HomeCustomizeDialog } from './HomeCustomizeDialog';
import { arrangeBlocks, groupBlocks, type HomeBlockId } from './homeLayout';
import { Reveal } from '../../components/ui/Reveal';
import { getStudyWeek } from '../../lib/studyWeek';
import { useClock } from '../../lib/useClock';
import { ClassDialog } from '../schedule/ClassDialog';
import { ExceptionDialog } from '../schedule/ExceptionDialog';
import { getOccurrencesForDate } from '../schedule/occurrences';
import { useScheduleData } from '../schedule/scheduleStore';
import { useScheduleDialogs } from '../schedule/useScheduleDialogs';
import { getClassStatus } from './classStatus';
import { BookmarksPanel, DeadlinesPanel, HomeworkPanel, MaterialsPanel, RecentNotesPanel, StudyPlanPanel } from './HomePanels';
import { NextClassBlock } from './NextClassBlock';
import { ReviewBanner, SubjectsPanel } from './SubjectsPanel';
import { TodayHeader } from './TodayHeader';
import { TodaySchedule } from './TodaySchedule';
import styles from './TodayPage.module.css';

/** «Сейчас» и дедлайны стоят рядом (8 + 4 колонки из 12), если идут подряд; остальные крупные блоки — во всю ширину */
function featureSpan(ids: HomeBlockId[], at: number) {
  if (ids[at] === 'next' && ids[at + 1] === 'deadlines') return styles.span8;
  if (ids[at] === 'deadlines' && ids[at - 1] === 'next') return styles.span4;
  return styles.span12;
}

/**
 * Главная группы М3102: учебный день, дедлайны, ДЗ, материалы, личный план, недавние конспекты. Порядок и видимость
 * блоков настраиваются («Настроить главную», homeLayout.ts) и хранятся в этом браузере.
 */
export function TodayPage() {
  const homeOrder = useSettingsStore((state) => state.homeOrder);
  const homeHidden = useSettingsStore((state) => state.homeHidden);
  const [customizing, setCustomizing] = useState(false);
  const { today, time } = useClock();
  const scheduleData = useScheduleData();
  const scheduleDialogs = useScheduleDialogs();

  const week = getStudyWeek(today, scheduleData.semesterStart, scheduleData.weekOneStart);
  const todayOccurrences = getOccurrencesForDate(today, scheduleData);
  const classStatus = getClassStatus(scheduleData, today, time);
  // Полоска дня в «Сейчас» — того дня, чья пара показана: когда сегодня всё закончилось, это день следующей пары
  const railDate = classStatus.kind === 'finished' && classStatus.next ? classStatus.next.occurrence.date : today;
  const railOccurrences = railDate === today ? todayOccurrences : getOccurrencesForDate(railDate, scheduleData);

  const visible = arrangeBlocks(homeOrder).filter((id) => !homeHidden.includes(id));

  const renderBlock = (id: HomeBlockId) => {
    switch (id) {
      case 'next':
        return <NextClassBlock status={classStatus} occurrences={railOccurrences} date={railDate} today={today} time={time} />;
      case 'review':
        return <ReviewBanner today={today} />;
      case 'schedule':
        return <TodaySchedule occurrences={todayOccurrences} today={today} time={time} onAction={scheduleDialogs.handleAction} />;
      case 'deadlines':
        return <DeadlinesPanel />;
      case 'homework':
        return <HomeworkPanel today={today} />;
      case 'materials':
        return <MaterialsPanel />;
      case 'plan':
        return <StudyPlanPanel today={today} />;
      case 'notes':
        return <RecentNotesPanel />;
      case 'subjects':
        return <SubjectsPanel today={today} time={time} />;
      case 'bookmarks':
        return <BookmarksPanel />;
    }
  };

  return (
    <>
      <TodayHeader date={today} week={week} onCustomize={() => setCustomizing(true)} />

      <div className={styles.groups}>
        {groupBlocks(visible).map((group) => (
          <div key={group.ids[0]} className={group.feature ? styles.features : styles.tiles}>
            {group.ids.map((id, at) => (
              // Каскад только у первых блоков: дальше всё появляется разом, длинная страница не «ползёт»
              <Reveal key={id} index={Math.min(visible.indexOf(id), 3)} className={cn(styles.item, group.feature && featureSpan(group.ids, at))}>
                {renderBlock(id)}
              </Reveal>
            ))}
          </div>
        ))}
      </div>

      <HomeCustomizeDialog open={customizing} onClose={() => setCustomizing(false)} />

      <ClassDialog target={scheduleDialogs.classTarget} onClose={scheduleDialogs.closeClassDialog} />
      <ExceptionDialog target={scheduleDialogs.exceptionTarget} onClose={scheduleDialogs.closeExceptionDialog} />
      <ConfirmDeleteModal
        open={scheduleDialogs.isDeleteConfirmOpen}
        title={scheduleDialogs.deleteConfirmTitle}
        onCancel={scheduleDialogs.cancelDelete}
        onConfirm={scheduleDialogs.confirmDelete}
      />
    </>
  );
}
