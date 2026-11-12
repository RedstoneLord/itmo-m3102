import { MotionConfig, MotionGlobalConfig } from 'framer-motion';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import './styles/tokens.css';
import './styles/global.css';
import './styles/aurora.css';
import './styles/glass.css';
import { App } from './app/App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { startClassicMarksSync } from './features/settings/classicMarksSync';
import { startClassicSync } from './features/settings/classicSync';
import { useSettingsStore } from './features/settings/settingsStore';

// Тема, палитра и скругления общие с классической версией: подхватываем её выбор до первой отрисовки, дальше — в обе стороны
startClassicSync();
// Выполненные ДЗ и дедлайны из классической версии тоже подхватываются сами (только чтение её ключей)
startClassicMarksSync();

/** «Уменьшить движение» в системе или «Анимации: Минимум / Выкл» — framer-motion сам отключает сдвиги и пружины везде */
function AppMotion({ children }: { children: ReactNode }) {
  const reduced = useSettingsStore((state) => state.motion === 'minimal' || state.motion === 'off');
  // «Выкл» — и затухания тоже: reducedMotion оставляет у framer-motion смену прозрачности, а здесь движения не должно быть никакого
  MotionGlobalConfig.instantAnimations = useSettingsStore((state) => state.motion === 'off');
  return <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppMotion>
      {/* Последний рубеж: ошибка вне страниц (шапка, меню) — сообщение вместо белого экрана */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </AppMotion>
  </StrictMode>,
);

// iOS Safari включает :active (эффект нажатия) только если на странице есть обработчик касания
addEventListener('touchstart', () => undefined, { passive: true });

// Офлайн-режим и установка на телефон (public/sw.js). Только в сборке: в разработке кеш мешал бы HMR
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => void navigator.serviceWorker.register('./sw.js'));
}
