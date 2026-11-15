import { Bookmark, Highlighter, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';
import { useOptionalSubjectName } from '../subjects/subjectsStore';
import type { LectureNote } from '../../types/models';
import { useLectureNotesStore } from './lectureNotesStore';
import { useMarksStore, type NoteMark } from './marksStore';
import styles from './BookmarksTab.module.css';

/**
 * «Материалы → Закладки»: все закладки и пометки из всех конспектов на одной странице, как у классической версии.
 * Пометка ведёт прямо к своему месту в конспекте (`?mark=<id>`, прокручивает useJumpToMark в NoteMarks.tsx).
 */
export function BookmarksTab() {
  const notes = useLectureNotesStore((state) => state.lectureNotes);
  const bookmarks = useMarksStore((state) => state.bookmarks);
  const marks = useMarksStore((state) => state.marks);
  // Сначала — где что-то делали недавно: закладка или последняя пометка
  const touched = (note: LectureNote) =>
    [bookmarks[note.id] ?? '', ...marks.filter((mark) => mark.noteId === note.id).map((mark) => mark.at)].sort().at(-1) ?? '';
  const marked = notes
    .filter((note) => bookmarks[note.id] || marks.some((mark) => mark.noteId === note.id))
    .sort((a, b) => touched(b).localeCompare(touched(a)));

  if (!marked.length) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Закладок пока нет"
        description="В конспекте нажмите на закладку рядом с заголовком или выделите текст и нажмите «Пометить» — всё соберётся здесь."
      />
    );
  }
  return (
    <div className={styles.list}>
      {marked.map((note) => (
        <NoteMarksCard key={note.id} note={note} bookmarked={Boolean(bookmarks[note.id])} marks={marks.filter((mark) => mark.noteId === note.id)} />
      ))}
    </div>
  );
}

function NoteMarksCard({ note, bookmarked, marks }: { note: LectureNote; bookmarked: boolean; marks: NoteMark[] }) {
  const subject = useOptionalSubjectName(note.subjectId);
  const removeMark = useMarksStore((state) => state.removeMark);
  const toggleBookmark = useMarksStore((state) => state.toggleBookmark);
  return (
    <section className={styles.card}>
      <header className={styles.head}>
        <Link to={`/materials/notes/${note.id}`} className={styles.title}>
          {note.title}
        </Link>
        {bookmarked && (
          <button
            type="button"
            className={styles.icon}
            aria-label="Убрать из закладок"
            title="Убрать из закладок"
            onClick={() => toggleBookmark(note.id)}
          >
            <Bookmark size={14} strokeWidth={1.75} fill="currentColor" aria-hidden />
          </button>
        )}
      </header>
      <p className={styles.meta}>{[subject, note.lectureNumber].filter(Boolean).join(' · ')}</p>
      {marks.length > 0 && (
        <ul className={styles.marks}>
          {marks.map((mark) => (
            <li key={mark.id} className={styles.mark}>
              <Highlighter size={13} strokeWidth={1.75} aria-hidden className={styles.markIcon} />
              <Link to={`/materials/notes/${note.id}?mark=${mark.id}`} className={styles.markText}>
                {mark.text}
              </Link>
              <button type="button" className={styles.icon} aria-label="Удалить пометку" title="Удалить пометку" onClick={() => removeMark(mark.id)}>
                <Trash2 size={13} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
