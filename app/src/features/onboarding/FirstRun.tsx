import { useId } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { STEPS } from './steps';
import styles from './FirstRun.module.css';

/**
 * Окно «Настройте сайт под себя»: стиль, тема, палитра и «Кто вы?», выбор применяется сразу. Само не открывается
 * (владелец: мешало, хотелось сразу пропустить) — только по кнопке в настройках; «Кто вы?» и так спрашивают дедлайны и главная.
 */
export function FirstRun({ open, onClose }: { open: boolean; onClose: () => void }) {
  const base = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Настройте сайт под себя"
      description="Всё применяется сразу и хранится в этом браузере."
      footer={
        <Button variant="primary" onClick={onClose}>
          Готово
        </Button>
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
