import { useEffect, useState, type CSSProperties } from 'react';
import { Cherry, Lightbulb, RotateCcw, Shuffle, Sprout } from 'lucide-react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { ensureSprite } from '../../../../js/slots-art.js';
import { SPRING_SNAPPY, usePrefersReducedMotion } from '../../lib/motion';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { LEVELS, isFree, pairs, rewardFor, symbolKind, type Tile } from './engine';
import { useMahjongStore } from './mahjongStore';
import styles from './MahjongPage.module.css';

const SYMBOLS = ['berry', 'apple', 'mush', 'git', 'orange', 'itmo', 'cpp', 'rust', 'pi', 'hog', 'seven'];
const NAMES = ['Ягода', 'Яблоко', 'Гриб', 'Git', 'Апельсин', 'ИТМО', 'C++', 'Rust', 'Пи', 'Ёжик', 'Семёрка'];

function Art({ kind, className }: { kind: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <use href={`#sl-${SYMBOLS[symbolKind(kind)]}`} />
    </svg>
  );
}

function GameTile({
  tile: t,
  free,
  selected,
  hinted,
  onSelect,
}: {
  tile: Tile;
  free: boolean;
  selected: boolean;
  hinted: boolean;
  onSelect: (id: number) => void;
}) {
  const present = useIsPresent();
  const reduced = usePrefersReducedMotion();
  const kind = symbolKind(t.kind);
  return (
    <motion.button
      type="button"
      className={styles.tile}
      layout={reduced ? false : 'position'}
      initial={reduced ? false : { opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: selected ? 1.04 : 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: -18 }}
      transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
      style={{ '--x': t.x, '--y': t.y, '--z': t.z, zIndex: t.z * 200 + t.id, pointerEvents: present ? undefined : 'none' } as CSSProperties}
      data-kind={kind}
      data-free={free}
      data-selected={selected}
      data-hint={hinted}
      data-tile={present ? t.id : undefined}
      disabled={!free || !present}
      aria-hidden={!present}
      aria-pressed={selected}
      aria-label={`${NAMES[kind]}, кость ${t.id + 1}${free ? ', свободна' : ', закрыта'}`}
      onClick={() => onSelect(t.id)}
    >
      <span className={styles.corner} aria-hidden>
        {kind + 1}
      </span>
      <Art key={kind} kind={kind} />
      <span className={styles.tileLabel} aria-hidden>
        {NAMES[kind]}
      </span>
    </motion.button>
  );
}

export default function MahjongPage() {
  const { game, start, match, assist, undo, shuffle, wins, total } = useMahjongStore();
  useEffect(() => {
    ensureSprite();
  }, []);
  const [zoom, setZoom] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!game?.combo || !game.tiles.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [game?.combo, game?.tiles.length]);
  const [level, setLevel] = useState(game?.level ?? 1);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [message, setMessage] = useState('Найдите две одинаковые свободные кости.');
  const [confirm, setConfirm] = useState(false);
  const available = game ? pairs(game.tiles) : [];
  const won = !!game && game.tiles.length === 0;
  const fullCount = game ? LEVELS[game.level]!.layers.reduce((n, [w, h]) => n + w * h, 0) : 0;
  const completed = game ? Math.round((1 - game.tiles.length / fullCount) * 100) : 0;
  const streak = game && now - game.lastMatch <= 12_000 ? game.combo : 0;
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
        setNow(Date.now());
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
            <div className={styles.progress}>
              <span>Сад собран на {completed}%</span>
              <span>{streak > 1 ? `Серия ×${streak}` : 'В своём темпе'}</span>
              <progress aria-label="Прогресс сада" max={fullCount} value={fullCount - game.tiles.length} />
            </div>
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
                <div className={styles.celebration}>
                  <Art kind={9} />
                  {Array.from({ length: 7 }, (_, i) => (
                    <Art key={i} kind={0} className={styles.prize} />
                  ))}
                </div>
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
                <div className={styles.boardHeading}>
                  <span>Открытый край → одинаковая пара</span>
                  <button type="button" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>
                    {zoom ? 'Всё поле' : 'Крупнее'}
                  </button>
                </div>
                <div className={styles.table} data-zoom={zoom}>
                  <div
                    className={styles.board}
                    style={{ '--rows': game.rows ?? 8, '--offset': game.offset ?? 0 } as CSSProperties}
                    role="group"
                    aria-label={`Игровое поле: ${LEVELS[game.level]!.name}`}
                  >
                    <AnimatePresence>
                      {game.tiles.map((t) => (
                        <GameTile
                          key={`${game.id}:${t.id}`}
                          tile={t}
                          free={isFree(t, game.tiles)}
                          selected={selected === t.id}
                          hinted={hint.includes(t.id)}
                          onSelect={select}
                        />
                      ))}
                    </AnimatePresence>
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
            <Art kind={9} />
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
