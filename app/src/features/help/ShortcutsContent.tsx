import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Kbd } from '../../components/ui/Kbd';
import styles from './ShortcutsDialog.module.css';

// Стрелки — иконками: символы ← и → в шрифтах телефонов разного размера и стоят на разной высоте
const KEY_ICONS: Record<string, ReactNode> = {
  '←': <ArrowLeft size={12} strokeWidth={2.25} aria-label="Стрелка влево" />,
  '→': <ArrowRight size={12} strokeWidth={2.25} aria-label="Стрелка вправо" />,
};

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

const GROUPS: { title: string; rows: [keys: string[], what: string][] }[] = [
  {
    title: 'Везде',
    rows: [
      [[MOD, 'K'], 'Поиск по предметам, конспектам, дедлайнам'],
      [[MOD, 'B'], 'Свернуть или открыть боковое меню'],
      [['?'], 'Это окно'],
      [['Esc'], 'Закрыть окно или меню'],
      [['Tab'], 'Первая остановка — «Перейти к содержимому»'],
    ],
  },
  {
    title: 'Вкладки, дни, переключатели',
    rows: [
      [['←', '→'], 'Соседняя вкладка или день'],
      [['Home', 'End'], 'Первая или последняя'],
    ],
  },
  {
    title: 'Тесты',
    rows: [
      [['1', '–', '9'], 'Выбрать вариант ответа'],
      [['Enter'], 'Проверить, затем следующий вопрос'],
    ],
  },
  {
    title: 'Ёжик-кувырок',
    rows: [
      [['Пробел'], 'Свернуться в шар; отпустить — прыжок'],
      [['←', 'A'], 'Бэкфлип в воздухе'],
      [['→', 'D'], 'Фронтфлип в воздухе'],
      [['P'], 'Пауза'],
    ],
  },
];

export default function ShortcutsContent() {
  return (
    <div className={styles.groups}>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className={styles.title}>{group.title}</h3>
          <dl className={styles.rows}>
            {group.rows.map(([keys, what]) => (
              <div key={what} className={styles.row}>
                <dt>{keys.map((key, index) => (key === '–' ? <span key={index}>–</span> : <Kbd key={index}>{KEY_ICONS[key] ?? key}</Kbd>))}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
