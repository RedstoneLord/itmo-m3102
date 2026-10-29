import { Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LazyMarkdown } from '../../components/markdown/LazyMarkdown';
import { Button } from '../../components/ui/Button';
import { Kbd } from '../../components/ui/Kbd';
import { cn } from '../../lib/cn';
import { CardTypeChip, typeStyle } from './CardTypeChip';
import type { CardFile } from './cardsData';
import type { Card } from './parse';
import { intervalDays, RATINGS, type CardState, type Rating } from './schedule';
import styles from './Cards.module.css';

/** Подпись под кнопкой оценки: когда карточка вернётся */
export function dayLabel(days: number): string {
  if (days === 0) return 'сейчас';
  if (days === 1) return 'завтра';
  return `${days} дн.`;
}

interface StudyCardProps {
  card: Card;
  file: CardFile;
  state: CardState | undefined;
  position: { at: number; of: number };
  writeFirst: boolean;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: Rating) => void;
}

/** Не мешаем вводу: Пробел и цифры в поле ответа остаются обычными символами */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Одна карточка занятия: тип, вопрос, (по желанию — поле «сначала напиши по памяти»), ответ по кнопке и четыре оценки с подписью,
 * через сколько дней карточка вернётся. Ответ открывается под вопросом, а не переворотом: у ответа бывают формулы, код и схемы — он длинный.
 */
export function StudyCard({ card, file, state, position, writeFirst, revealed, onReveal, onRate }: StudyCardProps) {
  const [written, setWritten] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        onReveal();
      } else if (revealed && /^[1-4]$/.test(event.key)) onRate(RATINGS[Number(event.key) - 1]!.value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, onReveal, onRate]);

  return (
    <article className={styles.study} style={typeStyle(card.type)} aria-live="polite">
      <header className={styles.studyHead}>
        <CardTypeChip type={card.type} />
        <span className={styles.studyCount}>
          {position.at} из {position.of}
        </span>
      </header>

      <div className={styles.question}>
        <LazyMarkdown content={card.q} />
      </div>
      <p className={styles.source}>
        {file.title}
        {file.group && ` · ${file.group}`} · {card.src}
      </p>

      {!revealed && writeFirst && (
        <label className={styles.write}>
          <span>Напишите ответ по памяти, потом откройте и сравните</span>
          <textarea value={written} onChange={(event) => setWritten(event.target.value)} rows={3} placeholder="Своими словами, формула, шаги…" />
        </label>
      )}

      {!revealed ? (
        <div className={styles.reveal}>
          <Button variant="primary" icon={Eye} onClick={onReveal}>
            Показать ответ
          </Button>
          <span className={styles.hint}>
            <Kbd>Пробел</Kbd>
          </span>
        </div>
      ) : (
        <>
          <div className={cn(styles.answer, styles.appear)}>
            {written.trim() && (
              <div className={styles.mine}>
                <span>Ваш ответ</span>
                <p>{written}</p>
              </div>
            )}
            <span className={styles.answerLabel}>Ответ</span>
            <LazyMarkdown content={card.a} />
          </div>
          <div className={styles.rates} role="group" aria-label="Как вспомнилось">
            {RATINGS.map(({ value, label }, at) => (
              <button key={value} type="button" className={styles.rate} data-rating={value} onClick={() => onRate(value)}>
                <b>{label}</b>
                <small>{dayLabel(intervalDays(state, value))}</small>
                <Kbd>{at + 1}</Kbd>
              </button>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
