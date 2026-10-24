import { Link2 } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { LinesSkeleton } from '../../components/ui/LinesSkeleton';
import { List } from '../../components/ui/List';
import { pluralize } from '../../lib/pluralize';
import { useSyncReady } from '../../services/syncStore';
import { LinkCards } from '../group/LinksPage';
import type { GroupLink } from '../group/groupStore';
import { MaterialRow } from '../materials/MaterialRow';
import type { ISODate, Material } from '../../types/models';
import { TabToolbar } from './TabToolbar';

interface SubjectLinksTabProps {
  /** Материалы вида kind: 'link' — быстрые ссылки предмета (курс, Zoom, учебник...) */
  links: Material[];
  /** Ссылки группы из data/links.json */
  groupLinks: GroupLink[];
  today: ISODate;
  onAdd: () => void;
  onEdit: (link: Material) => void;
}

/** Быстрые ссылки предмета: курс, конференция, учебник — всё, на что нужно быстро перейти. */
export function SubjectLinksTab({ links, groupLinks, today, onAdd, onEdit }: SubjectLinksTabProps) {
  const sorted = [...links].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ready = useSyncReady();

  return (
    <>
      <TabToolbar
        label={ready ? pluralize(groupLinks.length + links.length, ['ссылка', 'ссылки', 'ссылок']) : '—'}
        addLabel="Добавить ссылку"
        onAdd={onAdd}
      />
      {groupLinks.length > 0 && <LinkCards links={groupLinks} />}
      {!ready ? (
        <LinesSkeleton label="Загружаем ссылки" />
      ) : sorted.length === 0 ? (
        groupLinks.length === 0 && (
          <EmptyState icon={Link2} title="Пока нет ссылок" description="Страница курса, видеозвонок, учебник — всё, что открываете часто." />
        )
      ) : (
        <List>
          {sorted.map((link) => (
            <MaterialRow key={link.id} material={link} today={today} onEdit={onEdit} />
          ))}
        </List>
      )}
    </>
  );
}
