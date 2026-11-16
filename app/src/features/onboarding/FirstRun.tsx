import { useId } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { STEPS } from './steps';
import styles from './FirstRun.module.css';

/**
 * Необязательные настройки, открываемые пользователем. Любой выбор можно пропустить.
 */
export function FirstRun({ open, onClose }: { open: boolean; onClose: () => void }) {
  const base = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Настройте сайт под себя"
      description="Всё применяется сразу и хранится в этом браузере. Любую настройку можно пропустить."
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
