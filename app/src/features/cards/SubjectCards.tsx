import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { buttonClass } from '../../components/ui/Button';
import { pluralize } from '../../lib/pluralize';
import { useClock } from '../../lib/useClock';
import { cardFilesOfSubject, cardId, loadCardFile, type LoadedFile } from './cardsData';
import { useCardStore } from './cardStore';
import { MasteryBar } from './MasteryBar';
import { masteryOf } from './schedule';
import styles from './Cards.module.css';

/** Вкладка «Карточки» на странице предмета: общий прогресс, кнопки «повторить сегодня» и «всё подряд», карточки по занятиям — каждое открывает свой набор */
export function SubjectCards({ subjectId }: { subjectId: string }) {
  const files = useMemo(() => cardFilesOfSubject(subjectId), [subjectId]);
  const [loaded, setLoaded] = useState<LoadedFile[] | null>(null);
  const states = useCardStore((state) => state.states);
  const { today } = useClock();

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    void Promise.all(files.map(loadCardFile)).then((result) => alive && setLoaded(result));
    return () => {
      alive = false;
    };
  }, [files]);

  if (!loaded) return <p className={styles.loading}>Загружаем карточки…</p>;
  const all = loaded.flatMap(({ file, cards }) => cards.map((card) => cardId(file, card)));
  const total = masteryOf(all, states, today);
  const search = `subject=${encodeURIComponent(subjectId)}`;

  return (
    <section className={styles.subject} aria-label="Карточки предмета">
      <div className={styles.subjectTop}>
        <div>
          <h2 className={styles.blockTitle}>
            {pluralize(total.total, ['карточка', 'карточки', 'карточек'])} по {pluralize(loaded.length, ['конспекту', 'конспектам', 'конспектам'])}
          </h2>
          <MasteryBar mastery={total} />
        </div>
        <div className={styles.actions}>
          <Link to={`/cards?${search}`} className={buttonClass('primary')}>
            {total.fresh === total.total ? 'Начать' : total.due > 0 ? `Повторить сегодня (${total.due})` : 'Повторить'}
          </Link>
          <Link to={`/cards?${search}&mode=all`} className={buttonClass('secondary')}>
            Пройти всё подряд
          </Link>
        </div>
      </div>
      <ul className={styles.lectures}>
        {loaded.map(({ file, cards }) => {
          const ids = cards.map((card) => cardId(file, card));
          return (
            <li key={file.key}>
              <Link to={`/cards?note=${encodeURIComponent(file.key)}`} className={styles.lecture}>
                <span className={styles.lectureText}>
                  <strong>{file.title}</strong>
                  <small>
                    {file.group && `${file.group} · `}
                    {pluralize(cards.length, ['карточка', 'карточки', 'карточек'])}
                  </small>
                </span>
                <MasteryBar mastery={masteryOf(ids, states, today)} compact />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
