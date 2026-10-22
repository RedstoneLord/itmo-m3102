import { useState } from 'react';
import type { ID, LectureNote } from '../../types/models';
import type { LectureNoteDialogTarget } from './LectureNoteDialog';

/** Какое окно конспекта открыто: создание нового (можно заранее задать предмет) или редактирование существующего. */
export function useLectureNoteDialog() {
  const [target, setTarget] = useState<LectureNoteDialogTarget | null>(null);

  return {
    target,
    openCreate: (defaultSubjectId?: ID) => setTarget({ mode: 'create', defaultSubjectId }),
    openEdit: (note: LectureNote) => setTarget({ mode: 'edit', note }),
    close: () => setTarget(null),
  };
}
