import { ArrowDownToLine } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { applyClassicMarks, countNew, currentAppMarks, previewImport, readClassicMarks, type ImportPreview } from './classicMarks';
import { SettingsRow } from './SettingsRow';
import styles from './settings.module.css';

/** Есть ли в браузере отметки классической версии — иначе строку не показываем */
function hasClassicMarks(): boolean {
  const marks = readClassicMarks();
  return Object.keys(marks.homework).length + marks.deadlines.length > 0;
}

/**
 * «Перенести отметки из классической версии»: сначала превью (читаем и считаем, ничего не меняем), перенос — отдельной кнопкой.
 * Только добавляет то, чего здесь ещё нет. Классическая версия не меняется, данные не уходят в сеть.
 */
export function ClassicImport() {
  const [available] = useState(hasClassicMarks);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  if (!available) return null;

  function showPreview() {
    setImported(null);
    setPreview(previewImport(readClassicMarks(), currentAppMarks()));
  }

  function confirm() {
    if (!preview) return;
    // Между превью и подтверждением отметки могли поменяться — пересчитываем по свежим данным
    const fresh = previewImport(readClassicMarks(), currentAppMarks());
    applyClassicMarks(fresh);
    setImported(countNew(fresh));
    setPreview(null);
  }

  const news = preview ? countNew(preview) : 0;

  return (
    <>
      <SettingsRow
        label="Отметки из классической версии"
        description="Выполненные ДЗ и дедлайны, которые вы отметили в классической версии сайта. Только чтение: там ничего не меняется, данные никуда не отправляются."
      >
        <Button variant="secondary" icon={ArrowDownToLine} onClick={showPreview} disabled={preview !== null}>
          Перенести отметки из классической версии
        </Button>
      </SettingsRow>

      {preview && (
        <div className={styles.syncResult} role="status">
          <p className={styles.syncResultTitle}>Найдено в классической версии</p>
          <dl className={styles.syncResultStats}>
            <div>
              <dt>Выполненных ДЗ</dt>
              <dd>{preview.foundHomework}</dd>
            </div>
            <div>
              <dt>Выполненных дедлайнов</dt>
              <dd>{preview.foundDeadlines}</dd>
            </div>
            <div>
              <dt>Новых для этой версии</dt>
              <dd>{news}</dd>
            </div>
          </dl>
          <div className={styles.importActions}>
            <Button variant="primary" onClick={confirm} disabled={news === 0}>
              Перенести
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Отмена
            </Button>
          </div>
          {news === 0 && <p className={styles.description}>Всё уже отмечено и здесь.</p>}
        </div>
      )}

      {imported !== null && (
        <p className={styles.syncResultTitle} role="status">
          {imported > 0 ? `Перенесено отметок: ${imported}.` : 'Новых отметок не было.'}
        </p>
      )}
    </>
  );
}
