import { useId } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useChangelogStore } from '../changelog/changelogStore';
import { useSettingsStore } from '../settings/settingsStore';
import { STEPS } from './steps';
import styles from './FirstRun.module.css';

/**
 * Окно «первого входа»: стиль, тема, палитра и «Кто вы?», выбор применяется сразу. Показывается, пока `onboarded` = false, —
 * новому посетителю и по кнопке «Показать приветствие ещё раз» в «Настройки → Оформление». «Готово», «Пропустить», крестик,
 * Esc и клик по фону делают одно и то же: выбор уже применён, окно закрывается и больше не появляется.
 */
export function FirstRun() {
  const onboarded = useSettingsStore((state) => state.onboarded);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const base = useId();
  // Новому посетителю «догонять» выпуски не нужно: всё, что было до его первого входа, считается увиденным
  const finish = () => {
    setAppearance({ onboarded: true });
    useChangelogStore.getState().markSeen();
  };

  return (
    <Modal
      open={!onboarded}
      onClose={finish}
      title="Настройте сайт под себя"
      description="Выбор виден сразу и хранится только в этом браузере. Оформление можно поменять в «Настройки → Оформление», себя в очередях — на странице «Дедлайны»."
      footer={
        <>
          <Button variant="ghost" onClick={finish}>
            Пропустить
          </Button>
          <Button variant="primary" onClick={finish}>
            Готово
          </Button>
        </>
      }
    >
      <div className={styles.steps}>
        {STEPS.map(({ id, title, Body }) => (
          <section key={id} className={styles.step} aria-labelledby={`${base}-${id}`}>
            <h3 id={`${base}-${id}`} className={styles.title}>
              {title}
            </h3>
            <Body />
          </section>
        ))}
      </div>
    </Modal>
  );
}
