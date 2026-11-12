import { useId } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useMeStore } from '../group/meStore';
import { STEPS } from './steps';
import styles from './FirstRun.module.css';

/**
 * Окно «Настройте сайт под себя»: стиль, тема, палитра и «Кто вы?», выбор применяется сразу. Открывается само, пока
 * не выбрано «Кто вы?» (студент или «Я гость»), и тогда его не закрыть мимо выбора: без крестика, Esc и клика по фону,
 * «Готово» — после выбора. Иначе — по кнопке «Быстрая настройка» в «Оформлении», тогда закрывается как обычное окно.
 */
export function FirstRun({ open, onClose }: { open: boolean; onClose: () => void }) {
  const base = useId();
  const chosen = useMeStore((state) => state.login !== null || state.guest);
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={chosen}
      title="Настройте сайт под себя"
      description={
        chosen ? 'Всё применяется сразу и хранится в этом браузере.' : 'Выберите себя в «Кто вы?» — или «Я гость». Остальное можно оставить как есть.'
      }
      footer={
        <Button variant="primary" onClick={onClose} disabled={!chosen}>
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
