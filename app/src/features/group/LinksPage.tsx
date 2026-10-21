import { motion } from 'framer-motion';
import { BookOpen, ClipboardList, ExternalLink, FolderOpen, Globe, Link2, Search, Table2, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { buttonClass } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { GithubMark } from '../../components/ui/GithubMark';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { TelegramMark } from '../../components/ui/TelegramMark';
import { SPRING_SMOOTH, usePrefersReducedMotion } from '../../lib/motion';
import { repoEditUrl } from '../../services/github';
import { useEditMode } from '../settings/EditModeContext';
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

/** Полезные ссылки группы (data/links.json): формы сдачи, чужие конспекты и курсы. */
export function LinksPage({ embedded = false }: { embedded?: boolean }) {
  const links = useGroupStore((state) => state.links);
  const { isEditMode } = useEditMode();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = links.filter((link) =>
    `${link.title} ${link.description} ${link.subject} ${linkKind(link).label} ${host(link.url)}`.toLowerCase().includes(q),
  );
  const groups = new Map<string, GroupLink[]>();
  for (const link of visible) groups.set(link.group, [...(groups.get(link.group) ?? []), link]);

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

      {links.length === 0 ? (
        <EmptyState title="Ссылок пока нет" description="Они появятся после синхронизации с GitHub." />
      ) : groups.size === 0 ? (
        <EmptyState icon={Search} title="Ничего не найдено" description="Попробуйте другое слово." />
      ) : (
        [...groups].map(([group, items]) => (
          <section key={group} className={styles.group}>
            <div className={styles.groupHead}>
              <h2>{group}</h2>
              <span>{items.length}</span>
            </div>
            <LinkCards links={items} />
          </section>
        ))
      )}
    </>
  );
}

/** Карточки ссылок — на странице «Ссылки» и у предмета */
export function LinkCards({ links }: { links: GroupLink[] }) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <div className={styles.grid}>
      {links.map((link, index) => {
        const { Icon } = linkKind(link);
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
                {link.subject && <span className={styles.subject}>{link.subject}</span>}
                <span className={styles.host}>{host(link.url)}</span>
              </span>
            </span>
          </motion.a>
        );
      })}
    </div>
  );
}
