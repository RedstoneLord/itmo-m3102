import { motion } from 'framer-motion';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ShortcutsDialog, useShortcutsKey } from '../../features/help/ShortcutsDialog';
import { useProfileStore } from '../../features/group/profileStore';
import { SearchDialog } from '../../features/search/SearchDialog';
import { HomeworkDialog } from '../../features/homework/HomeworkDialog';
import { useSearchShortcut } from '../../features/search/useSearchShortcut';
import { useApplyAppearance } from '../../features/settings/appearance';
import { FIRST_RUN_EVENT, useSettingsStore } from '../../features/settings/settingsStore';
import { useChangelogStore } from '../../features/changelog/changelogStore';
import { useApplyTheme } from '../../features/settings/theme';
import { useMorphLinks } from '../../lib/morph';
import { usePrefersReducedMotion } from '../../lib/motion';
import { useScrollMemory } from '../../lib/useScrollMemory';
import { smooth } from '../../lib/smoothScroll';
import { CelebrateHedgehog } from '../hedgehog/CelebrateHedgehog';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { PageSkeleton } from '../ui/PageSkeleton';
import { MobileNav } from './MobileNav';
import { Sidebar, useSidebarAttribute, useSidebarShortcut } from './Sidebar';
import { TopBar } from './TopBar';
import styles from './AppShell.module.css';

// Профиль студента — отдельным куском: грузится при первом открытии и дальше остаётся (для анимации закрытия)
const StudentProfile = lazy(() => import('../../features/group/StudentProfile').then((module) => ({ default: module.StudentProfile })));
// Плавное колесо и «Наверх» — отдельным куском: для первой отрисовки не нужны, а запас первой загрузки выбран
const ScrollExtras = lazy(() => import('./ScrollExtras').then((module) => ({ default: module.ScrollExtras })));
// Окно «первого входа» — тоже отдельным куском: нужно новому посетителю и по кнопке в настройках, остальным код не качается
const FirstRun = lazy(() => import('../../features/onboarding/FirstRun').then((module) => ({ default: module.FirstRun })));

/**
 * Каркас приложения: боковое меню + верхняя панель + область страницы.
 * На телефоне боковое меню скрывается, внизу появляется панель вкладок.
 * <Outlet /> — место, куда React Router подставляет текущую страницу.
 */
export function AppShell() {
  const [isSearchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const location = useLocation();
  const reduceMotion = usePrefersReducedMotion();
  const reading = location.pathname.startsWith('/materials/notes/');
  // В читалке конспекта — родная прокрутка: там при прокрутке дорисовываются разделы с формулами, и Lenis (главный поток) спотыкается
  const smoothWheel = useSettingsStore((state) => state.smoothScroll) && !reduceMotion && !reading;

  useApplyTheme();
  useApplyAppearance();
  useScrollMemory();
  useSearchShortcut(openSearch);
  useMorphLinks();
  useShortcutsKey();
  useSidebarShortcut();
  useSidebarAttribute();

  return (
    <div className={styles.shell}>
      {/* Кнопка, а не ссылка #main: адрес после # занят роутером */}
      <button type="button" className="skip-link" onClick={() => document.getElementById('main')?.focus()}>
        Перейти к содержимому
      </button>
      {/* Слой сияния за страницей (styles/aurora.css), выключается в настройках оформления */}
      <div className="aurora" aria-hidden>
        <i />
        <i />
        <i />
        <b />
      </div>
      <Sidebar />

      <div className={styles.column}>
        <TopBar onOpenSearch={openSearch} />
        <main id="main" tabIndex={-1} className={styles.content}>
          {/*
           * Нарочно без AnimatePresence/exit-анимации ухода: <Outlet/> — общий на всё
           * приложение компонент, подписанный на роутер-контекст. Если "замороженную"
           * уходящую копию держит в DOM AnimatePresence, её Outlet всё равно перерисуется
           * на НОВЫЙ маршрут при смене контекста (контекст пробивает любые bailout'ы React) —
           * так старая и новая страница на деле превращались в две копии одного и того же
           * нового контента, что и читалось как "мигание"/задержавшаяся предыдущая страница.
           * Поэтому уходящая страница просто убирается сразу — только новая мягко появляется.
           */}
          <motion.div
            key={location.pathname}
            // Страница видна почти сразу (с 0.3, а не из полной прозрачности) и мягко поднимается на 8px — ~250 мс expo-out
            initial={reduceMotion ? false : { opacity: 0.3, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }}
          >
            {/* Сломалась страница — только она: меню и шапка работают, переход на другую — с чистого листа (key) */}
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>

      <MobileNav />
      <Suspense fallback={null}>
        <ScrollExtras smoothWheel={smoothWheel} endOnly={reading} smooth={smooth} />
      </Suspense>
      <SearchDialog open={isSearchOpen} onClose={() => setSearchOpen(false)} />
      <HomeworkDialog />
      <LazyStudentProfile />
      <LazyFirstRun />
      <ShortcutsDialog />
      <CelebrateHedgehog />
    </div>
  );
}

/**
 * Окно «Настройте сайт под себя» — только по кнопке в настройках (событие FIRST_RUN_EVENT). Новому посетителю оно само не
 * открывается: сразу как «Пропустить» — значения по умолчанию и все выпуски «Что нового» увиденными (ему нечего догонять).
 * Загруженное окно остаётся в дереве: ему нужно доиграть анимацию закрытия
 */
function LazyFirstRun() {
  const fresh = useSettingsStore((state) => !state.onboarded);
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);

  useEffect(() => {
    if (!fresh) return;
    useSettingsStore.getState().setAppearance({ onboarded: true });
    useChangelogStore.getState().markSeen();
  }, [fresh]);

  useEffect(() => {
    const show = () => {
      setUsed(true);
      setOpen(true);
    };
    addEventListener(FIRST_RUN_EVENT, show);
    return () => removeEventListener(FIRST_RUN_EVENT, show);
  }, []);

  return used ? (
    <Suspense fallback={null}>
      <FirstRun open={open} onClose={() => setOpen(false)} />
    </Suspense>
  ) : null;
}

/** Подписка — здесь, а не в AppShell: иначе первое открытие профиля перерисовало бы всё приложение */
function LazyStudentProfile() {
  const used = useProfileStore((state) => state.login !== null || state.used);
  return used ? (
    <Suspense fallback={null}>
      <StudentProfile />
    </Suspense>
  ) : null;
}
