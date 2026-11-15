import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { storageKey } from '../../lib/storage';
import styles from './AudioPlayer.module.css';

const POSITIONS = storageKey('audio-positions');
const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];

/** Где остановились в записи — по пути файла. Хранилище бывает запрещено: тогда просто без памяти */
function readPositions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(POSITIONS) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function savePosition(path: string, seconds: number) {
  try {
    const all = readPositions();
    all[path] = Math.floor(seconds);
    localStorage.setItem(POSITIONS, JSON.stringify(all));
  } catch {
    // без памяти позиции
  }
}

/** 3725 → «1:02:05», 65 → «1:05» */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * Запись лекции прямо на сайте: скорость, ±15 секунд, продолжение с того места, где остановились (как у классической версии).
 * Свои кнопки, а не <audio controls>: у браузерного плеера в каждой теме и браузере свой вид. Файл — с raw.githubusercontent
 * (отдаёт кусками по Range, перемотка не качает всё).
 */
export function AudioPlayer({ src, path }: { src: string; path: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);
  const resumeAt = useRef(readPositions()[path] ?? 0);

  useEffect(() => {
    const audio = audioRef.current;
    // Уходим со страницы — запоминаем место
    return () => {
      if (audio && audio.currentTime > 0) savePosition(path, audio.currentTime);
    };
  }, [path]);

  const audio = () => audioRef.current;
  const seek = (to: number) => {
    const element = audio();
    if (!element) return;
    element.currentTime = Math.max(0, Math.min(duration || element.duration || 0, to));
    setTime(element.currentTime);
  };
  const toggle = () => {
    const element = audio();
    if (!element) return;
    if (element.paused) void element.play().catch(() => setError(true));
    else element.pause();
  };
  const nextSpeed = () => {
    const value = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    setSpeed(value);
    if (audio()) audio()!.playbackRate = value;
  };

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          // Почти дослушали — начинаем сначала, а не с последних секунд
          if (resumeAt.current > 5 && resumeAt.current < event.currentTarget.duration - 10) {
            event.currentTarget.currentTime = resumeAt.current;
            setTime(resumeAt.current);
          }
        }}
        onTimeUpdate={(event) => {
          const now = event.currentTarget.currentTime;
          setTime(now);
          if (Math.floor(now) % 5 === 0) savePosition(path, now);
        }}
        onPlay={() => setPlaying(true)}
        onPause={(event) => {
          setPlaying(false);
          savePosition(path, event.currentTarget.currentTime);
        }}
        onError={() => setError(true)}
      />

      <div className={styles.controls}>
        <IconButton icon={RotateCcw} label="Назад на 15 секунд" onClick={() => seek(time - 15)} />
        <Button variant="primary" icon={playing ? Pause : Play} onClick={toggle} aria-label={playing ? 'Пауза' : 'Слушать'}>
          {playing ? 'Пауза' : time > 0 ? 'Продолжить' : 'Слушать'}
        </Button>
        <IconButton icon={RotateCw} label="Вперёд на 15 секунд" onClick={() => seek(time + 15)} />
        <Button variant="ghost" size="sm" onClick={nextSpeed} aria-label={`Скорость ${speed}×, нажмите, чтобы сменить`}>
          {speed}×
        </Button>
      </div>

      <div className={styles.timeline}>
        <span className={styles.time}>{formatTime(time)}</span>
        <input
          type="range"
          className={styles.range}
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(time, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Перемотка"
          aria-valuetext={`${formatTime(time)} из ${formatTime(duration)}`}
          style={{ '--progress': `${duration ? (time / duration) * 100 : 0}%` } as React.CSSProperties}
        />
        <span className={styles.time}>{formatTime(duration)}</span>
      </div>

      {error && <p className={styles.error}>Запись не загрузилась — проверьте интернет или скачайте файл.</p>}
    </div>
  );
}
