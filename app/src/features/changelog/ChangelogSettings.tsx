import { useEffect } from 'react';
import { CHANGELOG } from './changelog';
import { useChangelogStore } from './changelogStore';
import styles from './Changelog.module.css';

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** «Настройки → Что нового»: выпуски сверху вниз; заглянули — точка у «Настроек» гаснет */
export function ChangelogSettings() {
  const markSeen = useChangelogStore((state) => state.markSeen);
  useEffect(markSeen, [markSeen]);

  return (
    <div className={styles.list}>
      {CHANGELOG.map((entry) => (
        <article key={entry.id} className={styles.entry}>
          <p className={styles.date}>{new Date(`${entry.id}T12:00:00`).toLocaleDateString('ru-RU', DATE_FORMAT)}</p>
          <h3 className={styles.title}>{entry.title}</h3>
          <ul className={styles.items}>
            {entry.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
