import { Maximize, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';
import styles from './DiagramViewer.module.css';

export interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.1;
const MAX_K = 8;
const PAD = 24;

/** Масштаб вокруг точки окна (cx, cy): то, что под курсором или пальцами, остаётся на месте */
export function zoomAt(view: View, factor: number, cx: number, cy: number): View {
  const k = Math.min(MAX_K, Math.max(MIN_K, view.k * factor));
  const ratio = k / view.k;
  return { k, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

/** Вписать схему w×h в окно sw×sh с полями; мелкую не растягиваем больше чем вдвое */
export function fitView(w: number, h: number, sw: number, sh: number): View {
  const k = Math.min((sw - PAD * 2) / w, (sh - PAD * 2) / h, 2);
  return { k, x: (sw - w * k) / 2, y: (sh - h * k) / 2 };
}

/** Начальный вид: на телефоне вписанная широкая схема — мелкая россыпь, поэтому начинаем крупнее с левого края (дальше — сдвиг и щипок, «Вписать» вернёт целиком) */
export function startView(w: number, h: number, sw: number, sh: number): View {
  const fitted = fitView(w, h, sw, sh);
  if (sw >= 600 || fitted.k >= 0.5) return fitted;
  return { k: 0.7, x: PAD, y: (sh - h * 0.7) / 2 };
}

interface DiagramViewerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** SVG схемы со вписанными цветами текущей темы (`svgMarkup`) */
  markup: string;
}

/** Схема на весь экран: колесо или щипок — масштаб, перетаскивание — сдвиг. Широкие деревья и графы в конспекте иначе мелкие и уезжают за край. */
export function DiagramViewer({ open, onClose, title, markup }: DiagramViewerProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} description="Колесо или щипок — масштаб, перетаскивание — сдвиг" size="full">
      <Viewer markup={markup} />
    </Modal>
  );
}

function Viewer({ markup }: { markup: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState('');
  const [size, setSize] = useState<{ w: number; h: number }>();
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);

  // Векторная картинка из своего файла: чёткая при любом масштабе, скриптов в ней нет
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [markup]);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (stage && size) setView(fitView(size.w, size.h, stage.clientWidth, stage.clientHeight));
  }, [size]);
  useEffect(() => {
    const stage = stageRef.current;
    if (stage && size) setView(startView(size.w, size.h, stage.clientWidth, stage.clientHeight));
  }, [size]);

  const zoomCenter = useCallback((factor: number) => {
    const stage = stageRef.current;
    if (stage) setView((current) => zoomAt(current, factor, stage.clientWidth / 2, stage.clientHeight / 2));
  }, []);

  // Колесо — масштаб: слушатель не пассивный, иначе страница под окном прокручивалась бы
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = stage!.getBoundingClientRect();
      // Щипок на тачпаде приходит как колесо с ctrlKey и мелким шагом
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setView((current) => zoomAt(current, factor, event.clientX - rect.left, event.clientY - rect.top));
    }
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const step = 60;
      if (event.key === '+' || event.key === '=') zoomCenter(1.25);
      else if (event.key === '-' || event.key === '_') zoomCenter(0.8);
      else if (event.key === '0') fit();
      else if (event.key === 'ArrowLeft') setView((current) => ({ ...current, x: current.x + step }));
      else if (event.key === 'ArrowRight') setView((current) => ({ ...current, x: current.x - step }));
      else if (event.key === 'ArrowUp') setView((current) => ({ ...current, y: current.y + step }));
      else if (event.key === 'ArrowDown') setView((current) => ({ ...current, y: current.y - step }));
      else return;
      event.preventDefault();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [fit, zoomCenter]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch.current = 0;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const points = [...pointers.current.values()];
    const [a, b] = points;
    if (a && b) {
      // Два пальца: масштаб по расстоянию между ними вокруг их середины
      const rect = event.currentTarget.getBoundingClientRect();
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) {
        const factor = distance / pinch.current;
        setView((current) => zoomAt(current, factor, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top));
      }
      pinch.current = distance;
    } else {
      setView((current) => ({ ...current, x: current.x + next.x - previous.x, y: current.y + next.y - previous.y }));
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinch.current = 0;
  }

  return (
    <div className={styles.viewer}>
      <div
        ref={stageRef}
        className={styles.stage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={fit}
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            className={styles.image}
            style={{
              width: size?.w,
              height: size?.h,
              visibility: size ? 'visible' : 'hidden',
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            }}
            onLoad={(event) => setSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
          />
        )}
      </div>
      <div className={styles.controls}>
        <IconButton icon={Minus} label="Меньше" size="sm" onClick={() => zoomCenter(0.8)} />
        <span className={styles.percent} aria-live="polite">
          {Math.round(view.k * 100)}%
        </span>
        <IconButton icon={Plus} label="Больше" size="sm" onClick={() => zoomCenter(1.25)} />
        <IconButton icon={Maximize} label="Вписать в окно" size="sm" onClick={fit} />
      </div>
    </div>
  );
}
