import { Download, RefreshCw, Trash, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button, buttonClass } from '../../components/ui/Button';
import { GithubMark } from '../../components/ui/GithubMark';
import { Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/cn';
import { REPOS } from '../../services/githubContent';
import { useSyncStore } from '../../services/syncStore';
import { getToken, saveToken } from '../../services/github';
import { TokenFields, type TokenValue } from '../group/TokenFields';
import { EDITING_ENABLED } from './EditModeContext';
import { OfflineSettings } from './OfflineSettings';
import { SettingsRow } from './SettingsRow';
import styles from './settings.module.css';
import { saveBlob } from '../../lib/download';
import {
  applyBackup,
  collectBackup,
  describeBackup,
  isBackupKey,
  isBackupStale,
  markBackupNow,
  parseBackup,
  readLastBackup,
  type BackupFile,
} from './backup';

/** Сайт и данные группы лежат в одном репозитории: вторая ссылка ведёт прямо к коду приложения */
const GITHUB_LINKS = [
  { label: 'Репозиторий группы', href: 'https://github.com/RedstoneLord/itmo-m3102' },
  { label: 'Код приложения', href: 'https://github.com/RedstoneLord/itmo-m3102/tree/master/app' },
];

/** Личные данные браузера: всё, кроме настроек интерфейса и кеша, который скачается заново (список — backup.ts) */
function dataKeys(): string[] {
  return Object.keys(localStorage).filter(isBackupKey);
}

/** Резервная копия личных данных (видна всем), синхронизация с репозиторием группы, работа без сети и сброс данных. */
export function DataSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const syncStatus = useSyncStore((state) => state.status);
  const syncResult = useSyncStore((state) => (state.status === 'done' ? state.summary : null));
  const syncError = useSyncStore((state) => (state.status === 'error' ? state.error : ''));
  const runSync = useSyncStore((state) => state.run);
  const syncing = syncStatus === 'syncing';
  const [token, setToken] = useState<TokenValue>({ token: '', remember: true });
  const [tokenSaved, setTokenSaved] = useState(() => Boolean(getToken()));

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Сбрасываем значение сразу — иначе повторный выбор того же файла не вызовет onChange
    event.target.value = '';
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Не удалось прочитать файл.');
    }
  }

  function downloadBackup() {
    const backup = collectBackup();
    saveBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `m3102-backup-${backup.exportedAt.slice(0, 10)}.json`);
    markBackupNow();
    setLastBackup(readLastBackup());
  }

  function restoreBackup() {
    if (!pending) return;
    try {
      applyBackup(pending);
    } catch (error) {
      setPending(null);
      setImportError(error instanceof Error ? error.message : 'Не удалось восстановить копию.');
      return;
    }
    window.location.reload();
  }

  function handleReset() {
    for (const key of dataKeys()) localStorage.removeItem(key);
    window.location.reload();
  }

  return (
    <>
      <SettingsRow label="GitHub" description="Репозиторий группы с конспектами и данными и код этого приложения.">
        {GITHUB_LINKS.map((link) => (
          <a key={link.href} className={buttonClass('secondary', 'sm')} href={link.href} target="_blank" rel="noreferrer">
            <GithubMark size={14} />
            {link.label}
          </a>
        ))}
      </SettingsRow>

      <SettingsRow label="Резервная копия" description={backupNote(lastBackup)}>
        <Button variant="secondary" icon={Download} onClick={downloadBackup}>
          Скачать копию
        </Button>
        <Button
          variant="secondary"
          icon={Upload}
          onClick={() => {
            setImportError('');
            fileInputRef.current?.click();
          }}
        >
          Восстановить из файла
        </Button>
        <input ref={fileInputRef} type="file" accept="application/json" className={styles.hiddenFileInput} onChange={handleFileSelected} />
      </SettingsRow>

      {importError && <p className={styles.importError}>{importError}</p>}

      <SettingsRow
        label="Синхронизировать с GitHub"
        description={`Конспекты, файлы, дедлайны, ДЗ и ссылки группы из ${REPOS.group.name}. Происходит и автоматически при открытии сайта (не чаще раза в 10 минут). Кнопка есть и в шапке.`}
      >
        <Button variant="secondary" onClick={runSync} disabled={syncing}>
          <RefreshCw size={14} strokeWidth={2} className={cn(styles.syncIcon, syncing && styles.syncIconSpinning)} aria-hidden />
          {syncing ? 'Синхронизация…' : 'Синхронизировать'}
        </Button>
      </SettingsRow>

      {syncError && <p className={styles.importError}>{syncError}</p>}

      {syncResult && (
        <div className={styles.syncResult}>
          <p className={styles.syncResultTitle}>Синхронизация завершена</p>
          <dl className={styles.syncResultStats}>
            <div>
              <dt>Конспекты</dt>
              <dd>{syncResult.group}</dd>
            </div>
            <div>
              <dt>Описания курсов</dt>
              <dd>{syncResult.subjectInfo}</dd>
            </div>
            <div>
              <dt>Материалы</dt>
              <dd>{syncResult.materials}</dd>
            </div>
            <div>
              <dt>Дедлайны</dt>
              <dd>{syncResult.deadlines}</dd>
            </div>
            <div>
              <dt>Домашнее задание</dt>
              <dd>{syncResult.homework}</dd>
            </div>
            <div>
              <dt>Ссылки</dt>
              <dd>{syncResult.links}</dd>
            </div>
          </dl>
        </div>
      )}

      <OfflineSettings />

      {EDITING_ENABLED && (
        <>
          <SettingsRow
            label="Токен GitHub"
            description={
              tokenSaved
                ? 'Токен сохранён: синхронизация идёт без лимита 60 запросов в час, можно публиковать ДЗ и мемы.'
                : 'Нужен, чтобы публиковать ДЗ и мемы для всей группы. Заодно снимает лимит GitHub (60 запросов в час).'
            }
          >
            <Button
              variant="secondary"
              disabled={!token.token.trim()}
              onClick={() => {
                saveToken(token.token, token.remember);
                setToken({ token: '', remember: token.remember });
                setTokenSaved(true);
              }}
            >
              Сохранить токен
            </Button>
          </SettingsRow>
          <div className={styles.tokenFields}>
            <TokenFields value={token} onChange={setToken} />
          </div>
        </>
      )}

      {/* Сброс — для того, кто правит данные: только в сборке с редактированием (react-app-dev) */}
      {EDITING_ENABLED && (
        <>
          <SettingsRow
            label="Сбросить данные"
            description="Удаляет ваши задачи, заметки и правки и возвращает расписание М3102 по умолчанию. Тема и режим редактирования сохранятся."
          >
            <Button variant="danger" icon={Trash} onClick={() => setConfirmingReset(true)}>
              Сбросить
            </Button>
          </SettingsRow>
        </>
      )}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Восстановить из копии?"
        description={pending ? restoreNote(pending) : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={restoreBackup}>
              Восстановить
            </Button>
          </>
        }
      >
        {null}
      </Modal>

      <Modal
        open={confirmingReset}
        onClose={() => setConfirmingReset(false)}
        title="Сбросить все данные?"
        description="Будут удалены задачи, заметки, события и ручные правки. Расписание и контент группы загрузятся заново."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={handleReset}>
              Сбросить
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </>
  );
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** Что сказать про копию: когда была последняя, и напоминание, если давно или не было вовсе */
function backupNote(last: number | null): string {
  const base =
    'Учебный план, заметки, отметки, результаты тестов лежат только в этом браузере: смените устройство или очистите данные сайта — и они пропадут. Копия переносит их одним файлом. ';
  if (last === null) return base + 'Копии ещё не было.';
  const when = new Date(last).toLocaleDateString('ru-RU', DATE_FORMAT);
  return base + (isBackupStale(last) ? `Последняя копия от ${when} — давно, скачайте новую.` : `Последняя копия от ${when}.`);
}

function restoreNote(file: BackupFile): string {
  const date = file.exportedAt ? new Date(file.exportedAt).toLocaleDateString('ru-RU', DATE_FORMAT) : 'без даты';
  const what = describeBackup(file);
  return `Копия от ${date}${what ? `: ${what}` : ''}. Личные данные на этом устройстве будут заменены ими; тема, стиль и общие данные группы не изменятся.`;
}
