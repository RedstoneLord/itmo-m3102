import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/motion';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { HOG_R as R, HOG_W, OBSTACLES, startWalker, stepWalker, type Pose, type Walker } from './hogWalker';
import styles from './GameHogLane.module.css';

type GameArt = Pick<typeof import('../../features/game/hedgehogGame.js'), 'drawHog' | 'drawObstacle' | 'drawPickup'>;

/** Высота холста: ёжик + запас над ним на прыжок и сальто */
const CANVAS_H = 110;
/** Вещи игры нарисованы под ёжика радиусом 26 — у нас 20 */
const THING_SCALE = R / 26;
const IDLE_MS = 60_000;
const PHRASES = ['Фыр!', 'Сальто!', 'Почитай конспекты.', 'Тестик на пять минут?', 'Доо, доо.'];
const STILL: Pose = { lift: 0, turn: 0, curl: 0, roll: 0, run: 0, leg: 0, sx: 1, sy: 1, face: 1 };
/** Рельеф дорожки для drawObstacle игры: ровная земля по нижнему краю холста */
const FLAT = { y: () => 0, angle: () => 0 };
const DAY = { night: 0 };

/**
 * Ёжик на главной — тот же, что в игре «Ёжик-кувырок» (как на главной классической версии): его и вещи на дорожке рисует сам
 * код игры (drawHog, drawObstacle, drawPickup). Модуль игры грузится лениво, после отрисовки страницы (страница игры и так
 * докачивается в простое). Поведение — hogWalker.ts: идёт сразу и почти не стоит, темп меняется плавно, через камни, брёвна и
 * улитку перепрыгивает, яблоки, ягоды и грибы ест, цветы нюхает, у края разворачивается. Минуту ничего не трогают — ложится
 * спать до первого клика, клавиши или прокрутки. Нажатие — сальто с репликой. Пауза вне экрана и в скрытой вкладке;
 * «Анимации: Спокойные» и меньше — стоит на месте.
 */
export function GameHogLane() {
  const calm = useSettingsStore((state) => state.motion === 'calm');
  const still = usePrefersReducedMotion() || calm;
  const laneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [art, setArt] = useState<GameArt | null>(null);
  const [phrase, setPhrase] = useState('');

  useEffect(() => {
    let alive = true;
    void import('../../features/game/hedgehogGame.js').then((module) => alive && setArt(module));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const lane = laneRef.current;
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    const context = canvas?.getContext('2d');
    if (!art || !lane || !canvas || !button || !context) return undefined;

    let width = lane.clientWidth;
    let frame = 0;
    let last = 0;
    let visible = true;
    let clock = 0;
    const walker: Walker = startWalker(width);
    let blinkIn = 2 + Math.random() * 3;
    let blink = 0;
    let idleSince = performance.now();
    let sleepy = false;
    let asleep = false;
    let flip = 0;

    const resize = () => {
      width = lane.clientWidth;
      const scale = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(CANVAS_H * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      walker.x = Math.min(walker.x, Math.max(0, width - HOG_W));
    };
    resize();

    const drawThings = () => {
      for (const thing of walker.things) {
        if (thing.grow <= 0) continue;
        // Появляется «пружинкой» из земли, исчезает — сжимаясь
        const pop = thing.grow < 1 ? Math.sin(thing.grow * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1;
        context.save();
        context.translate(thing.x, CANVAS_H - 2);
        context.scale(THING_SCALE * pop, THING_SCALE * pop);
        context.globalAlpha = Math.min(1, thing.grow * 1.5);
        if (OBSTACLES.includes(thing.kind)) {
          art.drawObstacle(context, { kind: thing.kind as 'rock' | 'log' | 'snail', x: 0, ph: thing.id }, FLAT, DAY, clock);
        } else {
          // Угощения в игре висят в воздухе — у нас лежат на земле
          art.drawPickup(context, { kind: thing.kind as 'apple' | 'berry' | 'mush' | 'flower', x: 0, y: -14, ph: thing.id }, clock * 0.4);
        }
        context.restore();
      }
    };

    const draw = (pose: Pose) => {
      context.clearRect(0, 0, width, CANVAS_H);
      drawThings();
      context.save();
      // Опора — лапы на нижнем краю холста: сжатие и растяжение — от земли, а не от середины
      context.translate(walker.x + HOG_W / 2, CANVAS_H - 2 - pose.lift);
      context.scale(walker.dir * pose.face * pose.sx, pose.sy);
      context.translate(0, -R * 1.45);
      if (pose.turn) {
        // Наклон и сальто — вокруг середины тела
        context.translate(0, -R * 0.6);
        context.rotate(pose.turn);
        context.translate(0, R * 0.6);
      }
      art.drawHog(context, R, { curl: pose.curl, roll: pose.roll, run: pose.run, leg: pose.leg, blink, sleepy: asleep ? 1 : 0 });
      context.restore();
      if (asleep) {
        // «z» над спящим
        context.fillStyle = getComputedStyle(lane).color;
        context.font = '600 12px var(--font-sans, sans-serif)';
        const k = (performance.now() / 1000) % 2;
        context.globalAlpha = 0.6;
        context.fillText('z', walker.x + HOG_W * 0.6 + k * 6, CANVAS_H - R * 3.2 - k * 10);
        context.fillText('z', walker.x + HOG_W * 0.75 + k * 4, CANVAS_H - R * 3.8 - k * 8);
        context.globalAlpha = 1;
      }
      button.style.transform = `translate(${walker.x}px, ${CANVAS_H - R * 3 - pose.lift}px)`;
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      clock += dt;
      if (!sleepy && now - idleSince > IDLE_MS) sleepy = true;

      // Моргание раз в 2–5 секунд
      blinkIn -= dt;
      if (blinkIn <= 0) {
        blink = 1;
        if (blinkIn < -0.12) {
          blink = 0;
          blinkIn = 2 + Math.random() * 3;
        }
      }

      let pose = STILL;
      if (!asleep) {
        pose = stepWalker(walker, dt, width);
        // Хочет спать — ляжет, когда закончит прыжок или еду
        if (sleepy && walker.mode === 'walk') asleep = true;
      }
      // Сальто по нажатию — поверх любого действия
      if (flip > 0) {
        flip = Math.max(0, flip - dt / 0.6);
        const f = 1 - flip;
        const air = Math.sin(Math.PI * f);
        pose = {
          ...pose,
          lift: pose.lift + air * 32,
          turn: -Math.PI * 2 * f,
          curl: Math.max(pose.curl, air),
          sx: 1 - 0.05 * air,
          sy: 1 + 0.08 * air,
        };
      }
      draw(pose);
      if (visible && !document.hidden) frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (still) {
        draw(STILL);
        return;
      }
      if (!frame && visible && !document.hidden) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };

    const wake = (event: Event) => {
      idleSince = performance.now();
      if (event.target instanceof Element && event.target.closest('[data-hog]')) return;
      sleepy = false;
      asleep = false;
    };
    const later = () => (idleSince = performance.now());
    const onPoke = () => {
      idleSince = performance.now();
      if (asleep) {
        asleep = false;
        sleepy = false;
        setPhrase('Фыр! Я не спал.');
      } else setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]!);
      // Спокойный режим — только реплика, без прыжков
      flip = still ? 0 : 1;
    };
    button.addEventListener('click', onPoke);

    const observer = new ResizeObserver(() => {
      resize();
      if (still || !frame) start();
    });
    observer.observe(lane);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      start();
    });
    seen.observe(lane);
    const onVisibility = () => start();
    document.addEventListener('visibilitychange', onVisibility);
    const rousing = ['pointerdown', 'keydown', 'wheel', 'scroll'] as const;
    addEventListener('pointermove', later, { passive: true });
    for (const name of rousing) addEventListener(name, wake, { passive: true, capture: true });
    start();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      button.removeEventListener('click', onPoke);
      removeEventListener('pointermove', later);
      for (const name of rousing) removeEventListener(name, wake, { capture: true });
    };
  }, [art, still]);

  // Реплика держится две секунды
  useEffect(() => {
    if (!phrase) return undefined;
    const timer = window.setTimeout(() => setPhrase(''), 2000);
    return () => clearTimeout(timer);
  }, [phrase]);

  return (
    <div ref={laneRef} className={styles.lane}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height: CANVAS_H }} aria-hidden />
      <button ref={buttonRef} type="button" className={styles.hog} data-hog style={{ width: HOG_W, height: R * 3 }} aria-label="Ёжик: сальто">
        {phrase && (
          <span className={styles.phrase} role="status">
            {phrase}
          </span>
        )}
      </button>
    </div>
  );
}
