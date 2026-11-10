import { useState, type CSSProperties } from 'react';
import {
  BookOpen,
  Cherry,
  Clover,
  Code2,
  Coffee,
  Feather,
  Flower2,
  GraduationCap,
  Leaf,
  Lightbulb,
  RotateCcw,
  Shuffle,
  Sparkles,
  Sprout,
  Trophy,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { LEVELS, isFree, pairs, rewardFor } from './engine';
import { useMahjongStore } from './mahjongStore';
import styles from './MahjongPage.module.css';

const SYMBOLS = [
  { icon: Cherry, name: 'Ягода' },
  { icon: Leaf, name: 'Лист' },
  { icon: Clover, name: 'Клевер' },
  { icon: Flower2, name: 'Цветок' },
  { icon: Sprout, name: 'Росток' },
  { icon: Feather, name: 'Перо' },
  { icon: BookOpen, name: 'Конспект' },
  { icon: Code2, name: 'Код' },
  { icon: Coffee, name: 'Кофе' },
  { icon: GraduationCap, name: 'Зачёт' },
  { icon: Sparkles, name: 'Искра' },
  { icon: Lightbulb, name: 'Идея' },
];

export default function MahjongPage() {
  const { game, start, match, assist, undo, shuffle, wins, total } = useMahjongStore();
  const [level, setLevel] = useState(game?.level ?? 1);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [message, setMessage] = useState('Найдите две одинаковые свободные кости.');
  const [confirm, setConfirm] = useState(false);
  const available = game ? pairs(game.tiles) : [];
  const won = !!game && game.tiles.length === 0;
  const begin = () => {
    start(level);
    setSelected(null);
    setHint([]);
    setConfirm(false);
    setMessage('Сад ждёт. Начните с открытых краёв.');
  };
  const select = (id: number) => {
    if (!game) return;
    setHint([]);
    if (selected === id) {
      setSelected(null);
      return;
    }
    if (selected !== null) {
      if (match(selected, id)) {
        setSelected(null);
        const combo = useMahjongStore.getState().game!.combo;
        setMessage(combo > 1 ? `Серия ×${combo}! Ещё одна пара за 12 секунд?` : 'Пара найдена! Следующая за 12 секунд продолжит серию.');
        return;
      }
      setMessage('Символы разные. Выбрана новая кость.');
    } else setMessage('Теперь найдите такую же свободную кость.');
    setSelected(id);
  };
  return (
    <>
      <PageHeader title="Маджонг" subtitle="Ягодный сад · маленькая пауза между большими делами" />
      <div className={styles.page}>
        <section className={`${styles.intro} ${game ? styles.playing : ''}`} aria-label="Ягодный сад">
          <div>
            <span className={styles.eyebrow}>Собирайте пары. Освобождайте сад.</span>
            <h2>Каждая пара — ближе к урожаю</h2>
            <p>Без ставок и спешки. Разберите все ярусы, а ёжик пополнит ваш запас ягод.</p>
          </div>
          <div className={styles.record}>
            <Cherry size={26} aria-hidden />
            <strong>{total}</strong>
            <span>ягод собрано · побед: {wins}</span>
          </div>
        </section>
        <div className={styles.setup}>
          <label>
            Раскладка
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {LEVELS.map((l, i) => (
                <option key={l.name} value={i}>
                  {l.name} · {l.description}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" icon={Sprout} onClick={() => (game && !won ? setConfirm(true) : begin())}>
            {game ? 'Новая партия' : 'Начать игру'}
          </Button>
        </div>
        {confirm && (
          <div className={styles.notice} role="alert">
            <span>Завершить текущую партию без награды?</span>
            <Button onClick={begin}>Начать новую</Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Продолжить текущую
            </Button>
          </div>
        )}
        {game ? (
          <>
            <div className={styles.stats}>
              <div>
                <span>Осталось пар</span>
                <strong>{game.tiles.length / 2}</strong>
              </div>
              <div>
                <span>Доступно пар</span>
                <strong>{available.length}</strong>
              </div>
              <div>
                <span>Лучшая серия</span>
                <strong>×{game.best}</strong>
              </div>
              <div>
                <span>{won ? 'Ваш урожай' : 'Награда сейчас'}</span>
                <strong>
                  {won ? game.earned : rewardFor(game.level, game.best, game.assists)} <Cherry size={16} aria-label="ягод" />
                </strong>
              </div>
            </div>
            {won ? (
              <section className={styles.victory} aria-label="Победа">
                <Trophy size={40} aria-hidden />
                <h2>Сад собран!</h2>
                <p>
                  <strong>+{game.earned} ягод</strong> уже в общем балансе. Их можно потратить в коллекции и других играх.
                </p>
                <p>
                  Лучшая серия: {game.best} · использовано помощи: {game.assists}
                </p>
                <Button variant="primary" onClick={begin}>
                  Ещё один сад
                </Button>
              </section>
            ) : (
              <>
                <div className={styles.table}>
                  <div
                    className={styles.board}
                    style={{ '--rows': game.rows ?? 8, '--offset': game.offset ?? 0 } as CSSProperties}
                    role="group"
                    aria-label={`Игровое поле: ${LEVELS[game.level]!.name}`}
                  >
                    {game.tiles.map((t) => {
                      const free = isFree(t, game.tiles);
                      const { icon: Icon, name } = SYMBOLS[t.kind]!;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={styles.tile}
                          style={{ '--x': t.x, '--y': t.y, '--z': t.z, zIndex: t.z * 100 + t.id } as CSSProperties}
                          data-free={free}
                          data-selected={selected === t.id}
                          data-hint={hint.includes(t.id)}
                          data-tile={t.id}
                          disabled={!free}
                          aria-pressed={selected === t.id}
                          aria-label={`${name}, кость ${t.id + 1}${free ? ', свободна' : ', закрыта'}`}
                          onClick={() => select(t.id)}
                        >
                          <span className={styles.corner} aria-hidden>
                            {t.kind + 1}
                          </span>
                          <Icon strokeWidth={1.75} aria-hidden />
                          <span className={styles.tileLabel} aria-hidden>
                            {name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={styles.tools}>
                  <Button
                    icon={Lightbulb}
                    disabled={!available.length}
                    onClick={() => {
                      const p = available[0]!;
                      setHint(p.map((t) => t.id));
                      setSelected(null);
                      assist();
                      setMessage('Подсвечена свободная пара.');
                    }}
                  >
                    Подсказка
                  </Button>
                  <Button
                    icon={RotateCcw}
                    disabled={!game.history.length}
                    onClick={() => {
                      undo();
                      setSelected(null);
                      setHint([]);
                      setMessage('Последняя пара возвращена.');
                    }}
                  >
                    Отменить
                  </Button>
                  <Button
                    icon={Shuffle}
                    onClick={() => {
                      shuffle();
                      setSelected(null);
                      setHint([]);
                      setMessage('Кости перемешаны. У этой раскладки есть решение.');
                    }}
                  >
                    Перемешать
                  </Button>
                </div>
                <p className={styles.status} role="status">
                  {available.length ? message : 'Пары закончились? Отмените ход или перемешайте кости — партия продолжится.'}
                </p>
              </>
            )}
          </>
        ) : (
          <div className={styles.welcome}>
            <Flower2 size={48} strokeWidth={1.25} aria-hidden />
            <h2>Время для маленькой победы</h2>
            <p>
              Выберите раскладку и откройте свой первый сад.
              <br />
              Каждая новая партия имеет решение.
            </p>
          </div>
        )}
        <details className={styles.rules}>
          <summary>Как играть и получать ягоды</summary>
          <p>
            Снимайте по две кости с одинаковыми символами. Кость доступна, когда её не накрывает другая и свободен левый или правый край. Затемнённые
            кости пока закрыты. Можно играть мышью, касанием или клавишами Tab и Enter.
          </p>
          <p>
            Следующая пара за 12 секунд продолжает серию. Время не ограничено: пауза лишь начинает новую серию. Партия сохраняется после каждого хода.
          </p>
          <p>
            За полный сад: 20 / 40 / 65 ягод по сложности. Бонус — 2 ягоды за каждый шаг лучшей серии (до 20). Подсказка, отмена и перемешивание
            уменьшают только бонус на 3 ягоды; базовая награда остаётся. При перемешивании кости при необходимости перестраиваются. Награда
            начисляется один раз за партию.
          </p>
        </details>
      </div>
    </>
  );
}
