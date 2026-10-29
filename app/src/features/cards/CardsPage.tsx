import { ArrowLeft, Layers, RotateCcw, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { SECTIONS } from '../../app/navigation';
import { Button, buttonClass } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/PageSkeleton';
import { M3102_SUBJECTS } from '../../data/m3102';
import { formatShortDate } from '../../lib/dates';
import { pluralize } from '../../lib/pluralize';
import { useClock } from '../../lib/useClock';
import { useLectureNotesStore } from '../materials/lectureNotesStore';
import { CARD_FILES, cardFileByKey, cardFilesOfSubject, cardId, cardsKey, loadCardFile, type CardFile, type LoadedFile } from './cardsData';
import { useCardStore } from './cardStore';
import { MasteryBar } from './MasteryBar';
import type { Card } from './parse';
import { buildQueue, masteryOf, type Rating } from './schedule';
import { StudyCard } from './StudyCard';
import styles from './Cards.module.css';

/** Новых карточек за одно занятие: больше за раз не запомнить, остальные подойдут в следующие дни */
const NEW_PER_SESSION = 20;

interface Item {
  id: string;
  file: CardFile;
  card: Card;
}

function useLoaded(files: CardFile[]): LoadedFile[] | null {
  const [data, setData] = useState<LoadedFile[] | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    void Promise.all(files.map(loadCardFile)).then((loaded) => alive && setData(loaded));
    return () => {
      alive = false;
    };
  }, [files]);
  return data;
}

/** Страница-режим повторения: `?note=<ключ>` — карточки одного конспекта, `?subject=<id>` — предмета, без параметров — все; `&mode=all` — всё подряд, а не только срочное */
export default function CardsPage() {
  const [params] = useSearchParams();
  const noteKey = params.get('note');
  const subjectId = params.get('subject');
  const [all, setAll] = useState(params.get('mode') === 'all');
  const [round, setRound] = useState(0);
  const files = useMemo(() => {
    if (noteKey) return [cardFileByKey(noteKey)].filter((file): file is CardFile => Boolean(file));
    return subjectId ? cardFilesOfSubject(subjectId) : CARD_FILES;
  }, [noteKey, subjectId]);
  const loaded = useLoaded(files);
  const lectureNotes = useLectureNotesStore((state) => state.lectureNotes);

  const items = useMemo<Item[]>(
    () => (loaded ?? []).flatMap(({ file, cards }) => cards.map((card) => ({ id: cardId(file, card), file, card }))),
    [loaded],
  );

  const subject = subjectId ? M3102_SUBJECTS.find((item) => item.id === subjectId) : undefined;
  const scope = noteKey ? files[0]?.title : subject?.name;
  const note = noteKey ? lectureNotes.find((item) => item.sourceRef && cardsKey(item.sourceRef) === noteKey) : undefined;
  const back = note ? `/materials/notes/${note.id}` : subjectId ? `${SECTIONS.subjects.path}/${subjectId}?tab=cards` : SECTIONS.review.path;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Карточки"
        subtitle={scope ?? 'Все предметы'}
        actions={
          <Link to={back} className={buttonClass('ghost', 'sm')}>
            <ArrowLeft size={14} strokeWidth={2} aria-hidden /> Назад
          </Link>
        }
      />
      {loaded === null ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Layers} title="Карточек здесь пока нет" description="Они появляются по мере того, как их составляют к конспектам." />
      ) : (
        // key: другой набор или новый круг — занятие с нуля
        <Session
          key={`${noteKey}|${subjectId}|${all}|${round}`}
          items={items}
          all={all}
          lectureNotes={lectureNotes}
          onRestart={() => {
            setAll(true);
            setRound((previous) => previous + 1);
          }}
        />
      )}
    </div>
  );
}

interface SessionProps {
  items: Item[];
  all: boolean;
  lectureNotes: { id: string; sourceRef?: string }[];
  onRestart: () => void;
}

function Session({ items, all, lectureNotes, onRestart }: SessionProps) {
  const { today } = useClock();
  const states = useCardStore((state) => state.states);
  const rateCard = useCardStore((state) => state.rate);
  const writeFirst = useCardStore((state) => state.writeFirst);
  const setWriteFirst = useCardStore((state) => state.setWriteFirst);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const ids = useMemo(() => items.map((item) => item.id), [items]);

  // Очередь собирается один раз при входе: дальше состояния меняются от оценок, а очередь не должна перестраиваться под ногами
  const [queue, setQueue] = useState(() => (all ? ids : buildQueue(ids, states, today, NEW_PER_SESSION)));
  const [startMastery] = useState(() => masteryOf(ids, states, today));
  const [at, setAt] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [weak, setWeak] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0, easy: 0 });

  const currentId = queue[at];
  const current = currentId ? byId.get(currentId) : undefined;

  const reveal = useCallback(() => setRevealed(true), []);
  const rate = useCallback(
    (rating: Rating) => {
      if (!currentId || !current) return;
      rateCard(currentId, rating, today);
      setCounts((previous) => ({ ...previous, [rating]: previous[rating] + 1 }));
      // «Не помню» возвращается в конец этого же занятия
      if (rating === 'again') setQueue((previous) => [...previous, currentId]);
      if (rating === 'again' || rating === 'hard')
        setWeak((previous) => (previous.some((item) => item.id === currentId) ? previous : [...previous, current]));
      setAt((previous) => previous + 1);
      setRevealed(false);
    },
    [currentId, current, rateCard, today],
  );

  const mastery = masteryOf(ids, states, today);

  if (queue.length === 0) {
    const nextDue = ids
      .map((id) => states[id]?.due)
      .filter((due): due is string => typeof due === 'string' && due > today)
      .sort()[0];
    return (
      <section className={styles.done}>
        <Trophy size={28} strokeWidth={1.5} aria-hidden />
        <h2>На сегодня всё</h2>
        <p>
          {nextDue ? `Следующие карточки подойдут ${formatShortDate(nextDue, 'long')}.` : 'Все карточки уже пройдены.'} Можно пройти всё подряд —
          оценки тоже запомнятся.
        </p>
        <MasteryBar mastery={mastery} />
        <Button variant="primary" icon={RotateCcw} onClick={onRestart}>
          Пройти всё подряд
        </Button>
      </section>
    );
  }

  if (!current) {
    const reviewed = counts.again + counts.hard + counts.good + counts.easy;
    const gained = mastery.mastered - startMastery.mastered;
    const sections = [...new Map(weak.map((item) => [`${item.file.key}|${item.card.src}`, item])).values()];
    return (
      <section className={styles.done}>
        <Trophy size={28} strokeWidth={1.5} aria-hidden />
        <h2>Занятие закончено</h2>
        <p>
          Просмотрено {pluralize(reviewed, ['карточка', 'карточки', 'карточек'])}
          {gained > 0 && ` · новых освоенных: ${gained}`}.
        </p>
        <div className={styles.tally}>
          <span data-rating="again">Не помню · {counts.again}</span>
          <span data-rating="hard">Трудно · {counts.hard}</span>
          <span data-rating="good">Хорошо · {counts.good}</span>
          <span data-rating="easy">Легко · {counts.easy}</span>
        </div>
        <MasteryBar mastery={mastery} />
        {sections.length > 0 && (
          <div className={styles.weak}>
            <h3>Стоит перечитать</h3>
            <ul>
              {sections.map((item) => {
                const note = lectureNotes.find((entry) => entry.sourceRef && cardsKey(entry.sourceRef) === item.file.key);
                return (
                  <li key={`${item.file.key}|${item.card.src}`}>
                    {note ? <Link to={`/materials/notes/${note.id}`}>{item.card.src}</Link> : <span>{item.card.src}</span>}
                    <small>{item.file.title}</small>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <Button variant="secondary" icon={RotateCcw} onClick={onRestart}>
          Пройти всё подряд
        </Button>
      </section>
    );
  }

  return (
    <>
      <div className={styles.progress} role="progressbar" aria-label="Занятие" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={at}>
        <span style={{ width: `${(at / queue.length) * 100}%` }} />
      </div>
      <StudyCard
        key={currentId}
        card={current.card}
        file={current.file}
        state={states[current.id]}
        position={{ at: at + 1, of: queue.length }}
        writeFirst={writeFirst}
        revealed={revealed}
        onReveal={reveal}
        onRate={rate}
      />
      <footer className={styles.tools}>
        <Checkbox label="Сначала писать ответ по памяти" checked={writeFirst} onChange={(event) => setWriteFirst(event.target.checked)} />
        <MasteryBar mastery={mastery} compact />
      </footer>
    </>
  );
}
