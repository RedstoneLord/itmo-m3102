import { useGroupStore } from '../group/groupStore';
import { useHomeworkStore } from '../homework/homeworkStore';

/**
 * Отметки «сделано» из классической версии сайта. Обе версии открываются с одного адреса (один origin), поэтому localStorage у них
 * общий: ключи классической версии читаем напрямую. Ничего в них не пишем и никуда не отправляем.
 *
 * - `m3102-hw-done-v1`: `{ "<id задания из data/homework.json>": "<ISO-время>" | null }`
 * - `m3102-study-plan-v1`: `{ tasks: [...], done: { "deadline:<id из Дедлайны/deadlines.json>": true | false, "<id задачи>": true | false } }`
 *
 * id заданий и дедлайнов у обеих версий общие — берутся из одних и тех же файлов репозитория группы.
 */
const HOMEWORK_DONE_KEY = 'm3102-hw-done-v1';
const STUDY_PLAN_KEY = 'm3102-study-plan-v1';
const DEADLINE_PREFIX = 'deadline:';

export interface ClassicMarks {
  /** id задания → время отметки (ISO) */
  homework: Record<string, string>;
  /** id выполненных дедлайнов */
  deadlines: string[];
}

export interface AppMarks {
  homeworkDone: Record<string, string>;
  deadlinesDone: Record<string, boolean>;
}

export interface ImportPreview {
  foundHomework: number;
  foundDeadlines: number;
  /** Чего нет в этой версии — только это и будет добавлено */
  newHomework: Record<string, string>;
  newDeadlines: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Только чтение: нет ключа, битый JSON или запрет хранилища — просто нет данных */
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Выполненные ДЗ и дедлайны из классической версии; снятые отметки (null, false) и чужой формат пропускаются */
export function readClassicMarks(): ClassicMarks {
  const homework: Record<string, string> = {};
  const rawHomework = readJson(HOMEWORK_DONE_KEY);
  if (isRecord(rawHomework)) {
    for (const [id, at] of Object.entries(rawHomework)) {
      if (typeof at === 'string' && Number.isFinite(Date.parse(at)))
        Object.defineProperty(homework, id, { value: at, enumerable: true, writable: true, configurable: true });
    }
  }

  const deadlines: string[] = [];
  const plan = readJson(STUDY_PLAN_KEY);
  if (isRecord(plan) && isRecord(plan.done)) {
    for (const [key, value] of Object.entries(plan.done)) {
      if (value === true && key.startsWith(DEADLINE_PREFIX) && key.length > DEADLINE_PREFIX.length) deadlines.push(key.slice(DEADLINE_PREFIX.length));
    }
  }
  return { homework, deadlines };
}

/** Что найдено и что из этого новое для этой версии: отметка, которая уже есть здесь (даже снятая у дедлайна), остаётся как есть */
export function previewImport(marks: ClassicMarks, app: AppMarks): ImportPreview {
  const newHomework = Object.fromEntries(Object.entries(marks.homework).filter(([id]) => !Object.hasOwn(app.homeworkDone, id)));
  const newDeadlines = marks.deadlines.filter((id) => !Object.hasOwn(app.deadlinesDone, id));
  return { foundHomework: Object.keys(marks.homework).length, foundDeadlines: marks.deadlines.length, newHomework, newDeadlines };
}

export const countNew = (preview: ImportPreview) => Object.keys(preview.newHomework).length + preview.newDeadlines.length;

/** Текущие отметки этой версии */
export function currentAppMarks(): AppMarks {
  return { homeworkDone: useHomeworkStore.getState().done, deadlinesDone: useGroupStore.getState().deadlinesDone };
}

/** Только добавляет: значения этой версии стоят последними в объединении и побеждают, ничего не удаляется */
export function applyClassicMarks(preview: ImportPreview): void {
  useHomeworkStore.setState((state) => ({ done: { ...preview.newHomework, ...state.done } }));
  useGroupStore.setState((state) => ({
    deadlinesDone: { ...Object.fromEntries(preview.newDeadlines.map((id) => [id, true])), ...state.deadlinesDone },
  }));
}
