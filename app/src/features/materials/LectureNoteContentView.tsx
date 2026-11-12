import { ExternalLink } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Markdown } from '../../components/markdown/Markdown';
import { buttonClass } from '../../components/ui/Button';
import { useNoteSmooth } from '../../lib/smoothScroll';
import { splitSections } from '../../lib/splitSections';
import type { LectureNoteContentType } from '../../types/models';
import { LinesSkeleton } from '../../components/ui/LinesSkeleton';
import styles from './LectureNoteContentView.module.css';

// pdf.js тяжёлый — загружаем его только когда действительно открыт конспект с PDF
const PdfViewer = lazy(() => import('./PdfViewer').then((module) => ({ default: module.PdfViewer })));

interface LectureNoteContentViewProps {
  contentType: LectureNoteContentType;
  content: string;
  /** source_ref конспекта/материала — нужен, чтобы резолвить относительные Obsidian-ссылки [[...]] */
  sourceRef?: string;
  /** Папка файла — от неё считаются относительные картинки в markdown */
  baseUrl?: string;
}

/** Режим просмотра конспекта: рендер зависит от contentType — текст, PDF или карточка со ссылкой. */
export function LectureNoteContentView({ contentType, content, sourceRef, baseUrl }: LectureNoteContentViewProps) {
  if (!content.trim()) {
    return <p className={styles.empty}>Содержимое ещё не добавлено.</p>;
  }

  if (contentType === 'pdf') {
    return (
      <Suspense fallback={<LinesSkeleton />}>
        <PdfViewer file={content} />
      </Suspense>
    );
  }

  if (contentType === 'link') {
    return (
      <div className={styles.linkCard}>
        <p className={styles.linkUrl}>{safeDecode(content)}</p>
        <a href={content} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
          <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          Открыть
        </a>
      </div>
    );
  }

  return <ProgressiveMarkdown content={content} sourceRef={sourceRef} baseUrl={baseUrl} />;
}

/**
 * Большой конспект — по разделам (## …): первый сразу, каждый следующий отдельной задачей. Разбор с KaTeX
 * всего конспекта целиком — секунда и больше; так текст на экране почти сразу, а страница не замирает.
 */
function ProgressiveMarkdown({ content, sourceRef, baseUrl }: { content: string; sourceRef?: string; baseUrl?: string }) {
  const sections = useMemo(() => splitSections(content), [content]);
  const [shown, setShown] = useState(1);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown >= sections.length) return undefined;
    const timer = setTimeout(() => setShown((count) => count + 1));
    return () => clearTimeout(timer);
  }, [shown, sections.length]);
  useLazySections(hostRef, shown >= sections.length);

  // data-lazy-layout — разделы, которые раскладываются, только когда видны (здесь — useLazySections, при сворачивании меню — Sidebar.tsx)
  return (
    <div ref={hostRef} data-lazy-layout style={{ display: 'contents' }}>
      {sections.slice(0, shown).map((section, index) => (
        <Markdown key={index} content={section} sourceRef={sourceRef} baseUrl={baseUrl} />
      ))}
    </div>
  );
}

/**
 * Нарисованный конспект: разделы вне экрана браузер не раскладывает и не рисует (content-visibility: auto) — с их точной
 * высотой, поэтому прокрутка и переходы по оглавлению не сдвигаются. Без этого каждый кадр плавной прокрутки проходил всё
 * дерево конспекта с тысячами формул (замер: 33 мс на кадр против 8 у родной прокрутки, на слабом CPU — 240 против 40).
 * Высоты — как в Sidebar.tsx: offsetHeight плюс поле первого ребёнка (с containment оно не «выпадает» из раздела).
 * Поменялась ширина (окно, меню) — высоты пересчитываются, когда ширина перестала меняться. Готово — включается Lenis.
 */
function useLazySections(hostRef: RefObject<HTMLElement | null>, rendered: boolean) {
  useEffect(() => {
    const host = hostRef.current;
    const column = host?.parentElement;
    if (!rendered || !host || !column) return undefined;
    const sections = () => [...host.children] as HTMLElement[];
    const apply = () => {
      const list = sections();
      for (const section of list) section.style.contentVisibility = section.style.containIntrinsicSize = '';
      const heights = list.map(
        (section) => section.offsetHeight + (parseFloat(getComputedStyle(section.firstElementChild ?? section).marginTop) || 0),
      );
      list.forEach((section, index) => {
        section.style.containIntrinsicSize = `auto ${heights[index]}px`;
        section.style.contentVisibility = 'auto';
      });
      // ponytail: один огромный раздел content-visibility не делит — он рисуется целиком; больше ~30 экранов — Lenis не включаем
      useNoteSmooth.setState({ ready: Math.max(0, ...heights) <= innerHeight * 30 });
    };
    apply();
    let width = column.clientWidth;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      if (column.clientWidth === width) return;
      width = column.clientWidth;
      clearTimeout(timer);
      timer = window.setTimeout(apply, 250);
    });
    observer.observe(column);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      useNoteSmooth.setState({ ready: false });
      for (const section of sections()) section.style.contentVisibility = section.style.containIntrinsicSize = '';
    };
  }, [hostRef, rendered]);
}

/** Ссылки на файлы репозитория хранятся с %D0%9A… — показываем читаемый путь */
function safeDecode(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}
