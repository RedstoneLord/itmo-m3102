import { Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { buttonClass } from '../../components/ui/Button';
import { pluralize } from '../../lib/pluralize';
import { useClock } from '../../lib/useClock';
import { cardFileFor, cardId, loadCardFile, type LoadedFile } from './cardsData';
import { useCardStore } from './cardStore';
import { MasteryBar } from './MasteryBar';
import { CARD_TYPE_LABELS } from './parse';
import { masteryOf } from './schedule';
import styles from './Cards.module.css';

/**
 * Блок под конспектом (и под PDF): «Карточки по лекции» — сколько их, сколько освоено и кнопка начать или повторить. Есть только у тех
 * конспектов, к которым карточки уже составлены (см. cardsData.ts), у остальных блока нет.
 */
export function NoteCards({ sourceRef }: { sourceRef: string | undefined }) {
  const file = cardFileFor(sourceRef);
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const states = useCardStore((state) => state.states);
  const { today } = useClock();

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    if (file) void loadCardFile(file).then((result) => alive && setLoaded(result));
    return () => {
      alive = false;
    };
  }, [file]);

  if (!file || !loaded || loaded.cards.length === 0) return null;
  const ids = loaded.cards.map((card) => cardId(file, card));
  const mastery = masteryOf(ids, states, today);
  const byType = new Map<string, number>();
  for (const card of loaded.cards) byType.set(card.type, (byType.get(card.type) ?? 0) + 1);
  const started = mastery.fresh < mastery.total;

  return (
    <section className={styles.block} aria-labelledby="note-cards" data-pdf-hide>
      <header className={styles.blockHead}>
        <span className={styles.blockIcon}>
          <Layers size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 id="note-cards" className={styles.blockTitle}>
            Карточки по {file.isPdf ? 'PDF' : 'конспекту'}
          </h2>
          <p className={styles.blockSub}>
            {pluralize(loaded.cards.length, ['вопрос', 'вопроса', 'вопросов'])} по всему материалу, ответы с формулами и схемами. Когда карточки
            вспоминаются несколько раз подряд с растущими промежутками — материал держится.
          </p>
        </div>
      </header>
      <MasteryBar mastery={mastery} />
      <ul className={styles.types} aria-label="Какие вопросы">
        {[...byType].map(([type, count]) => (
          <li key={type}>
            {CARD_TYPE_LABELS[type as keyof typeof CARD_TYPE_LABELS]} · {count}
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <Link to={`/cards?note=${encodeURIComponent(file.key)}`} className={buttonClass('primary')}>
          {!started ? 'Начать' : mastery.due > 0 ? `Повторить (${mastery.due})` : 'Повторить'}
        </Link>
        {started && (
          <Link to={`/cards?note=${encodeURIComponent(file.key)}&mode=all`} className={buttonClass('secondary')}>
            Пройти всё подряд
          </Link>
        )}
      </div>
    </section>
  );
}
