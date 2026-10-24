import { motion } from 'framer-motion';
import { BookOpen, ChevronDown, ClipboardList, ExternalLink, FolderOpen, Globe, Link2, Search, Table2, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { buttonClass } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { GithubMark } from '../../components/ui/GithubMark';
import { Input } from '../../components/ui/Input';
import { LinesSkeleton } from '../../components/ui/LinesSkeleton';
import { PageHeader } from '../../components/ui/PageHeader';
import { TelegramMark } from '../../components/ui/TelegramMark';
import { resolveSubjectFolder } from '../../data/m3102';
import { cn } from '../../lib/cn';
import { SPRING_SMOOTH, usePrefersReducedMotion } from '../../lib/motion';
import { pluralize } from '../../lib/pluralize';
import { repoEditUrl } from '../../services/github';
import { useSyncReady } from '../../services/syncStore';
import { useEditMode } from '../settings/EditModeContext';
import { useSubjectsStore } from '../subjects/subjectsStore';
import { useGroupStore, type GroupLink } from './groupStore';
import styles from './LinksPage.module.css';

const lucide =
  (Icon: LucideIcon) =>
  ({ size }: { size: number }) => <Icon size={size} strokeWidth={1.75} aria-hidden />;

type KindIcon = (props: { size: number }) => ReactNode;

const KINDS: [RegExp, string, KindIcon][] = [
  [/forms\.gle|docs\.google\.com\/forms/, 'Форма', lucide(ClipboardList)],
  [/docs\.google\.com\/spreadsheets/, 'Таблица', lucide(Table2)],
  [/disk\.yandex|yadi\.sk|drive\.google/, 'Диск', lucide(FolderOpen)],
  [/yonote/, 'Yonote', lucide(BookOpen)],
  [/t\.me/, 'Telegram', ({ size }) => <TelegramMark size={size} />],
  [/github\.io/, 'Сайт', lucide(Globe)],
  [/github\.com/, 'GitHub', ({ size }) => <GithubMark size={size} />],
];

/** Тип ссылки — явный kind из links.json или по адресу, как на сайте группы; значок — по типу */
export function linkKind(link: { url: string; kind?: string }): { label: string; Icon: KindIcon } {
  const byUrl = KINDS.find(([pattern]) => pattern.test(link.url));
  const byLabel = link.kind ? KINDS.find(([, label]) => label.toLowerCase() === link.kind?.toLowerCase()) : undefined;
  const hit = byLabel ?? byUrl;
  return { label: link.kind || hit?.[1] || 'Ссылка', Icon: hit?.[2] ?? lucide(Link2) };
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const LINK_FORMS: [string, string, string] = ['ссылка', 'ссылки', 'ссылок'];

/** Полезные ссылки группы (data/links.json): формы сдачи, чужие конспекты и курсы — папками по предметам. */
export function LinksPage({ embedded = false }: { embedded?: boolean }) {
  const links = useGroupStore((state) => state.links);
  const subjects = useSubjectsStore((state) => state.subjects);
  const ready = useSyncReady();
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const { isEditMode } = useEditMode();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = links.filter((link) =>
    `${link.title} ${link.description} ${link.subject} ${linkKind(link).label} ${host(link.url)}`.toLowerCase().includes(q),
  );
  // Папки — по предметам в их порядке; ссылка без предмета (или с неизвестным) — в «Общее» в конце
  const folders = new Map<string, GroupLink[]>();
  for (const link of visible) {
    const id = resolveSubjectFolder(link.subject);
    const key = subjects.some((subject) => subject.id === id) ? id! : '';
    folders.set(key, [...(folders.get(key) ?? []), link]);
  }
  const ordered = [...subjects.map((subject) => [subject.id, subject.name] as const), ['', 'Общее'] as const].filter(([id]) => folders.has(id));
  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const addButton = isEditMode && (
    <a className={buttonClass('primary', 'md')} href={repoEditUrl('data/links.json')} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
      Добавить ссылку
    </a>
  );

  return (
    <>
      {!embedded && (
        <PageHeader title="Полезные ссылки" subtitle="Формы сдачи, чужие конспекты и курсы — всё, что обычно теряется в чатах." actions={addButton} />
      )}
      <div className={styles.toolbar}>
        <Input
          icon={Search}
          type="search"
          placeholder="Поиск по ссылкам"
          aria-label="Поиск по ссылкам"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {embedded && addButton}
      </div>

      {!ready ? (
        <LinesSkeleton label="Загружаем ссылки" />
      ) : links.length === 0 ? (
        <EmptyState title="Ссылок пока нет" description="Они появятся после синхронизации с GitHub." />
      ) : ordered.length === 0 ? (
        <EmptyState icon={Search} title="Ничего не найдено" description="Попробуйте другое слово." />
      ) : (
        ordered.map(([id, name]) => {
          const items = folders.get(id)!;
          // Идёт поиск — показываем найденное, сворачивание не мешает
          const open = q !== '' || !closed.has(id);
          return (
            <section key={id} className={styles.group}>
              <button type="button" className={styles.folderToggle} aria-expanded={open} onClick={() => toggle(id)}>
                <ChevronDown size={14} strokeWidth={2} className={cn(styles.chevron, !open && styles.chevronClosed)} aria-hidden />
                <h2>{name}</h2>
                <span>{pluralize(items.length, LINK_FORMS)}</span>
              </button>
              {open && <LinkCards links={items} />}
            </section>
          );
        })
      )}
    </>
  );
}

/** Карточки ссылок — на странице «Ссылки» и у предмета: тип и сайт внизу (предмет — это папка, в которой карточка лежит) */
export function LinkCards({ links }: { links: GroupLink[] }) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <div className={styles.grid}>
      {links.map((link, index) => {
        const { Icon, label } = linkKind(link);
        const delay = Math.min(index, 12) * 0.035;
        return (
          <motion.a
            key={link.url + link.title}
            className={styles.card}
            data-spot
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { ...SPRING_SMOOTH, delay },
            }}
          >
            <span className={styles.badge} aria-hidden>
              <Icon size={18} />
            </span>
            <span className={styles.body}>
              <strong>{link.title}</strong>
              {link.description && <small>{link.description}</small>}
              <span className={styles.meta}>
                <span className={styles.kind}>{label}</span>
                <span className={styles.host}>{host(link.url)}</span>
              </span>
            </span>
          </motion.a>
        );
      })}
    </div>
  );
}
