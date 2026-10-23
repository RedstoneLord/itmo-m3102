import { Copy, Download, FileText, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DropdownItem, DropdownMenu } from '../../components/ui/DropdownMenu';
import { formatShortDate } from '../../lib/dates';
import { saveBlob } from '../../lib/download';
import { noteSourceUrl } from '../../services/githubContent';
import type { LectureNote, Material, Note, SubjectInfo } from '../../types/models';
import { loadPdfTexts } from '../search/searchIndex';
import { buildSubjectDigest, estimateTokens } from './aiDigest';

interface AiDigestButtonProps {
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

/** «Для ИИ»: все конспекты и материалы предмета одним .md — скачать, скопировать текст или ссылку и отдать ChatGPT / Claude */
export function AiDigestButton({ today, subjectId, ...data }: AiDigestButtonProps) {
  const [status, setStatus] = useState('');

  async function build() {
    // Текст PDF — из индекса поиска группы (~1,6 МБ), грузится, только если у предмета есть PDF
    const pdf = data.notes.some((note) => note.contentType === 'pdf') ? await loadPdfTexts() : new Map<string, string>();
    return buildSubjectDigest({
      ...data,
      sourceUrl: noteSourceUrl,
      pdfText: (note) => (note.sourceRef ? pdf.get(note.sourceRef) : undefined),
      date: formatShortDate(today, 'long'),
    });
  }

  function done(text: string, action: string) {
    setStatus(`${action} · ≈ ${Math.max(1, Math.round(estimateTokens(text) / 1000))} тыс. токенов`);
    setTimeout(() => setStatus(''), 4000);
  }

  return (
    <DropdownMenu
      align="end"
      trigger={(props) => (
        <Button variant="secondary" icon={FileText} {...props}>
          {status || 'Для ИИ'}
        </Button>
      )}
    >
      <DropdownItem
        icon={Download}
        onSelect={() =>
          void build().then((text) => {
            saveBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${data.subjectName.replace(/[\\/:*?"<>|]/g, '_')} — для ИИ.md`);
            done(text, 'Скачано');
          })
        }
      >
        Скачать .md
      </DropdownItem>
      <DropdownItem
        icon={Copy}
        onSelect={() =>
          void build().then(async (text) => {
            await navigator.clipboard.writeText(text);
            done(text, 'Скопировано');
          })
        }
      >
        Скопировать текст
      </DropdownItem>
      {/* Файла в dev нет — он появляется при сборке сайта; личные заметки в него не попадают */}
      {import.meta.env.PROD && (
        <DropdownItem
          icon={Link2}
          onSelect={() =>
            void navigator.clipboard.writeText(aiLink(subjectId)).then(() => {
              setStatus('Ссылка скопирована');
              setTimeout(() => setStatus(''), 4000);
            })
          }
        >
          Скопировать ссылку
        </DropdownItem>
      )}
    </DropdownMenu>
  );
}
