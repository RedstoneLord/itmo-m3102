import { useEffect, useRef } from 'react';
import { drawHog } from '../../game/hedgehogGame.js';

interface HedgehogPreviewProps {
  /** id шляпы из игры; 'none' — без шляпы */
  hat: string;
  /** Ширина в px; высота — 0,8 от неё */
  width?: number;
  className?: string;
  /** Тёмный силуэт — шляпа ещё не найдена */
  silhouette?: boolean;
}

const RATIO = 0.82;

/** Ёжик в шляпе — тем же кодом рисования, что и в игре (drawHog), поэтому примерка точная */
export function HedgehogPreview({ hat, width = 112, className, silhouette = false }: HedgehogPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const height = Math.round(width * RATIO);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width * 0.44, height * 0.6);
    drawHog(context, width * 0.31, { curl: 0, run: 0, hat, blink: 0, leg: 0.4 });
    context.restore();
  }, [hat, width]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width, height: Math.round(width * RATIO), filter: silhouette ? 'brightness(0.2) contrast(0.8) opacity(0.5)' : undefined }}
      aria-hidden="true"
    />
  );
}
