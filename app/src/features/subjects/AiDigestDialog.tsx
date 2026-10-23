import { Copy, Download, Link2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Modal } from '../../components/ui/Modal';
import { formatShortDate } from '../../lib/dates';
import { saveBlob } from '../../lib/download';
import { noteSourceUrl } from '../../services/githubContent';
import { compareLessons, noteTitle } from '../materials/noteOrder';
import { loadPdfTexts } from '../search/searchIndex';
import type { LectureNote, Material, Note, SubjectInfo } from '../../types/models';
import { buildSubjectDigest, estimateTokens, type DigestInput } from './aiDigest';
import { ALL_SELECTED, applySelection, buildLinksText, isEmpty, isWholeSubject, type DigestSelection } from './aiSelection';
import styles from './AiDigestDialog.module.css';

export interface AiDigestData {
  subjectId: string;
  subjectName: string;
  info: SubjectInfo[];
  notes: LectureNote[];
  materials: Material[];
  links: { title: string; url: string }[];
  personalNotes: Note[];
  today: string;
}

/** Адрес выгрузки предмета (её кладёт в сайт scripts/build-ai.ts при сборке): ИИ открывает его и читает всё одной ссылкой */
const aiLink = (subjectId: string) => new URL(`ai/${subjectId}.md`, document.baseURI).href;

const thousands = (text: string) => Math.max(1, Math.round(estimateTokens(text) / 1000));

/**
 * «Для ИИ»: что оставить в выгрузке предмета — какие конспекты, описание курса, материалы, текст PDF, свои заметки. Выбор
 * действует на всё сразу: файл, скопированный текст и ссылка. Ссылка на готовый файл предмета — когда выбрано всё публичное,
 * иначе список адресов выбранного (файл под любой выбор на статическом сайте не собрать).
 */
export function AiDigestDialog({ open, onClose, today, subjectId, ...data }: AiDigestData & { open: boolean; onClose: () => void }) {
  const [selection, setSelection] = useState<DigestSelection>(ALL_SELECTED);
  const [pdf, setPdf] = useState<ReadonlyMap<string, string> | null>(null);
  const [status, setStatus] = useState('');
  const notes = useMemo(() => data.notes.filter((note) => !note.archived).sort(compareLessons), [data.notes]);
  const needPdf = notes.some((note) => note.contentType === 'pdf');

  // Текст PDF — из индекса поиска группы (~1,6 МБ): грузится, только когда окно открыли и у предмета есть PDF
  useEffect(() => {
    // На каждое открытие: не загрузился индекс (нет сети) — повторим; карта общая и дополняется на месте, поэтому ниже следим за её размером
    if (open && needPdf) void loadPdfTexts().then(setPdf);
  }, [open, needPdf]);

  const ready = !needPdf || pdf !== null;
  // Собираем, только пока окно открыто: файл на сотни тысяч символов не нужно пересобирать каждые полминуты по тику часов страницы
  const built = useMemo(() => {
    if (!open || !ready) return null;
    const input: DigestInput = {
      ...data,
      sourceUrl: noteSourceUrl,
      pdfText: (note) => (note.sourceRef ? pdf?.get(note.sourceRef) : undefined),
      date: formatShortDate(today, 'long'),
    };
    const picked = applySelection(input, selection);
    return { input, text: buildSubjectDigest(picked), empty: isEmpty(picked) };
  }, [open, ready, pdf, pdf?.size, selection, today, data.subjectName, data.info, data.notes, data.materials, data.links, data.personalNotes]);

  function say(message: string) {
    setStatus(message);
    setTimeout(() => setStatus(''), 4000);
  }

  function toggleNote(id: string) {
    setSelection((current) => {
      const off = new Set(current.off);
      if (!off.delete(id)) off.add(id);
      return { ...current, off };
    });
  }

  const flag = (key: 'info' | 'files' | 'pdfText' | 'personal') => ({
    checked: selection[key],
    onChange: () => setSelection((current) => ({ ...current, [key]: !current[key] })),
  });
  const disabled = !built || built.empty;
  // Личные заметки в ссылку не попадают: остались только они — ссылать не на что
  const linkDisabled = disabled || isEmpty(applySelection(built!.input, { ...selection, personal: false }));
  const size = built ? `В файле и тексте ≈ ${thousands(built.text)} тыс. токенов` : 'Считаю размер…';
  const whole = isWholeSubject(selection);
  const useSubjectFile = import.meta.env.PROD && whole;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Для ИИ"
      description="Что оставить: выбор действует на файл, текст и ссылку."
      size="md"
      footer={
        <div className={styles.footer}>
          <span className={styles.status} aria-live="polite">
            {status || size}
          </span>
          <div className={styles.actions}>
            <Button
              size="sm"
              variant="secondary"
              icon={Download}
              disabled={disabled}
              onClick={() => {
                saveBlob(
                  new Blob([built!.text], { type: 'text/markdown;charset=utf-8' }),
                  `${data.subjectName.replace(/[\\/:*?"<>|]/g, '_')} — для ИИ.md`,
                );
                say('Скачано');
              }}
            >
              Скачать .md
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={Copy}
              disabled={disabled}
              onClick={() =>
                void navigator.clipboard.writeText(built!.text).then(() => say(`Текст скопирован · ≈ ${thousands(built!.text)} тыс. токенов`))
              }
            >
              Скопировать текст
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={Link2}
              disabled={linkDisabled}
              onClick={() =>
                void navigator.clipboard
                  .writeText(useSubjectFile ? aiLink(subjectId) : buildLinksText(built!.input, selection))
                  .then(() => say(useSubjectFile ? 'Ссылка скопирована' : 'Скопирован список ссылок на выбранное'))
              }
            >
              Скопировать ссылку
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.sectionHead}>
        <span>
          Конспекты · {notes.length - notes.filter((note) => selection.off.has(note.id)).length} из {notes.length}
        </span>
        <span className={styles.bulk}>
          <Button size="sm" variant="ghost" onClick={() => setSelection((current) => ({ ...current, off: new Set() }))}>
            Все
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection((current) => ({ ...current, off: new Set(notes.map((note) => note.id)) }))}>
            Ничего
          </Button>
        </span>
      </div>
      <div className={styles.notes}>
        {notes.length === 0 && <span className={styles.note}>Конспектов пока нет</span>}
        {notes.map((note) => (
          <Checkbox key={note.id} label={noteTitle(note)} checked={!selection.off.has(note.id)} onChange={() => toggleNote(note.id)} />
        ))}
      </div>

      <div className={styles.sectionHead}>
        <span>Ещё</span>
      </div>
      <div className={styles.options}>
        {data.info.length > 0 && <Checkbox label="Описание курса" {...flag('info')} />}
        {data.materials.length + data.links.length > 0 && (
          <Checkbox label={`Материалы и ссылки (${data.materials.length + data.links.length})`} {...flag('files')} />
        )}
        {needPdf && <Checkbox label="Текст из PDF" {...flag('pdfText')} />}
        {needPdf && (
          <p className={styles.note}>Извлечён автоматически, формулы и таблицы могут быть искажены. В список ссылок не входит: ИИ откроет PDF сам.</p>
        )}
        {data.personalNotes.length > 0 && <Checkbox label={`Мои заметки (${data.personalNotes.length})`} {...flag('personal')} />}
        {data.personalNotes.length > 0 && <p className={styles.note}>Только в файле и тексте: из браузера в ссылку они попасть не могут.</p>}
      </div>
      <p className={styles.intro}>
        {whole
          ? 'Выбрано всё — ссылка одна, на готовый файл предмета.'
          : 'Выбрано не всё — ссылка будет списком адресов выбранного: ИИ откроет каждый.'}
      </p>
    </Modal>
  );
}
