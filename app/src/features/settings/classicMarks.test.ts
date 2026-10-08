// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGroupStore } from '../group/groupStore';
import { useHomeworkStore } from '../homework/homeworkStore';
import { applyClassicMarks, countNew, currentAppMarks, previewImport, readClassicMarks } from './classicMarks';

// Формат ключей — как у классической версии на живом сайте: m3102-hw-done-v1 и m3102-study-plan-v1
const HW_KEY = 'm3102-hw-done-v1';
const PLAN_KEY = 'm3102-study-plan-v1';
const HW_1 = 'f59225ed-9cd5-4fbf-9655-669dbfcb2d32';
const HW_2 = '0a1b2c3d-1111-4222-8333-444455556666';
const HW_3 = '9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff';
const TASK_ID = '07e5f327-952d-4940-9cde-46a32edffd12';

function setClassic(homework: object | null, plan: object | null) {
  if (homework) localStorage.setItem(HW_KEY, JSON.stringify(homework));
  if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

const CLASSIC_PLAN = {
  tasks: [{ id: TASK_ID, name: 'Своя задача', date: '2026-10-20' }],
  done: { 'deadline:dm-hw': true, 'deadline:op-lab1': true, 'deadline:isrpo-dokumentaciya': false, [TASK_ID]: true },
};

beforeEach(() => {
  localStorage.clear();
  useHomeworkStore.setState({ done: {} });
  useGroupStore.setState({ deadlinesDone: {} });
});

afterEach(() => vi.restoreAllMocks());

describe('чтение отметок классической версии', () => {
  it('берёт выполненные ДЗ и дедлайны; снятые отметки и личные задачи пропускает', () => {
    setClassic({ [HW_1]: '2026-10-08T23:00:52.587Z', [HW_2]: null, [HW_3]: '2026-10-09T08:00:00.000Z' }, CLASSIC_PLAN);
    expect(readClassicMarks()).toEqual({
      homework: { [HW_1]: '2026-10-08T23:00:52.587Z', [HW_3]: '2026-10-09T08:00:00.000Z' },
      deadlines: ['dm-hw', 'op-lab1'],
    });
  });

  it('ключей нет, формат чужой или JSON битый — просто ничего нет, без ошибки', () => {
    expect(readClassicMarks()).toEqual({ homework: {}, deadlines: [] });
    localStorage.setItem(HW_KEY, '{ не json');
    localStorage.setItem(PLAN_KEY, JSON.stringify(['a', 1]));
    expect(readClassicMarks()).toEqual({ homework: {}, deadlines: [] });
    localStorage.setItem(HW_KEY, JSON.stringify({ [HW_1]: 'не дата', [HW_2]: 5 }));
    localStorage.setItem(PLAN_KEY, JSON.stringify({ done: { 'deadline:': true, deadline: true } }));
    expect(readClassicMarks()).toEqual({ homework: {}, deadlines: [] });
  });

  it('браузер запретил хранилище — тоже ничего, без ошибки', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    try {
      expect(readClassicMarks()).toEqual({ homework: {}, deadlines: [] });
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});

describe('перенос только добавляет', () => {
  it('новые отметки добавляются, существующие значения этой версии не перезаписываются и ничего не удаляется', () => {
    setClassic({ [HW_1]: '2026-10-08T23:00:52.587Z', [HW_3]: '2026-10-09T08:00:00.000Z' }, CLASSIC_PLAN);
    // В этой версии: ДЗ №1 уже отмечено в другое время, у дедлайна dm-hw явно снята отметка, есть своя отметка, которой нет в классической
    useHomeworkStore.setState({ done: { [HW_1]: '2026-10-01T10:00:00.000Z', [HW_2]: '2026-10-02T10:00:00.000Z' } });
    useGroupStore.setState({ deadlinesDone: { 'dm-hw': false, 'dm-tasks': true } });

    const preview = previewImport(readClassicMarks(), currentAppMarks());
    expect(preview).toMatchObject({ foundHomework: 2, foundDeadlines: 2 });
    expect(countNew(preview)).toBe(2); // ДЗ №3 и дедлайн op-lab1

    applyClassicMarks(preview);
    expect(useHomeworkStore.getState().done).toEqual({
      [HW_1]: '2026-10-01T10:00:00.000Z', // значение этой версии осталось
      [HW_2]: '2026-10-02T10:00:00.000Z', // чужого не удалили
      [HW_3]: '2026-10-09T08:00:00.000Z', // новое добавлено
    });
    expect(useGroupStore.getState().deadlinesDone).toEqual({ 'dm-hw': false, 'dm-tasks': true, 'op-lab1': true });
  });

  it('повторный перенос ничего не добавляет', () => {
    setClassic({ [HW_1]: '2026-10-08T23:00:52.587Z' }, CLASSIC_PLAN);
    applyClassicMarks(previewImport(readClassicMarks(), currentAppMarks()));
    const again = previewImport(readClassicMarks(), currentAppMarks());
    expect(countNew(again)).toBe(0);
    expect(again.foundHomework + again.foundDeadlines).toBe(3);
  });

  it('данные классической версии не меняются, а запись идёт только в свои ключи (m3102:…)', () => {
    setClassic({ [HW_1]: '2026-10-08T23:00:52.587Z' }, CLASSIC_PLAN);
    localStorage.setItem('hh_save_v1', '{"level":3}');
    const before = { hw: localStorage.getItem(HW_KEY), plan: localStorage.getItem(PLAN_KEY), game: localStorage.getItem('hh_save_v1') };
    const written: string[] = [];
    const removed: string[] = [];
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      written.push(key);
      setItem.call(this, key, value);
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      removed.push(key);
      removeItem.call(this, key);
    });

    applyClassicMarks(previewImport(readClassicMarks(), currentAppMarks()));

    expect(removed).toEqual([]);
    expect(written.every((key) => key.startsWith('m3102:'))).toBe(true);
    expect({ hw: localStorage.getItem(HW_KEY), plan: localStorage.getItem(PLAN_KEY), game: localStorage.getItem('hh_save_v1') }).toEqual(before);
  });
});
