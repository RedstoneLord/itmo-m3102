// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBackup, collectBackup, describeBackup, isBackupStale, markBackupNow, parseBackup, readLastBackup } from './backup';

const NOW = new Date('2026-10-23T12:00:00Z');

describe('резервная копия личных данных', () => {
  beforeEach(() => localStorage.clear());

  it('в копию входят личные данные, настройки и кеш — нет', () => {
    localStorage.setItem('m3102:tasks', '{"state":{"tasks":[1]}}');
    localStorage.setItem('m3102:notes', '{"state":{}}');
    localStorage.setItem('m3102:settings', '{"state":{"theme":"dark"}}');
    localStorage.setItem('m3102:lecture-notes', '{"state":{}}');
    localStorage.setItem('m3102:last-sync', '123');
    localStorage.setItem('other:key', '"x"');
    const backup = collectBackup(localStorage, NOW);
    expect(Object.keys(backup.data).sort()).toEqual(['m3102:notes', 'm3102:tasks']);
    expect(backup).toMatchObject({ app: 'm3102', version: 1, exportedAt: '2026-10-23T12:00:00.000Z' });
  });

  it('круг: выгрузили → очистили → разобрали и применили — то же самое, чужие и лишние ключи на месте', () => {
    localStorage.setItem('m3102:tasks', '{"state":{"tasks":[1,2]}}');
    localStorage.setItem('m3102:me', '{"state":{"login":"anna"}}');
    const text = JSON.stringify(collectBackup(localStorage, NOW));
    localStorage.clear();
    localStorage.setItem('m3102:tasks', '{"state":{"tasks":[]}}');
    localStorage.setItem('m3102:notes', '{"state":{"old":true}}');
    localStorage.setItem('m3102:settings', '{"state":{"theme":"dark"}}');
    const result = applyBackup(parseBackup(text));
    expect(result).toEqual({ removed: 2, written: 2 });
    expect(localStorage.getItem('m3102:tasks')).toBe('{"state":{"tasks":[1,2]}}');
    expect(localStorage.getItem('m3102:me')).toBe('{"state":{"login":"anna"}}');
    expect(localStorage.getItem('m3102:notes')).toBeNull();
    expect(localStorage.getItem('m3102:settings')).toBe('{"state":{"theme":"dark"}}');
  });

  it('не хватило места посреди записи — прежние данные возвращены и ошибка понятная', () => {
    localStorage.setItem('m3102:tasks', '{"state":{"tasks":[1]}}');
    localStorage.setItem('m3102:notes', '{"state":{"old":true}}');
    const file = parseBackup(JSON.stringify({ app: 'm3102', data: { 'm3102:tasks': '{"state":{"tasks":[1,2,3]}}', 'm3102:me': '{"state":{}}' } }));
    const original = Storage.prototype.setItem;
    let writes = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      // первая запись проходит, на второй «квота»; откат (после ошибки) снова пишется нормально
      if (++writes === 2) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    });
    expect(() => applyBackup(file)).toThrow('Текущие данные не изменены');
    vi.restoreAllMocks();
    expect(localStorage.getItem('m3102:tasks')).toBe('{"state":{"tasks":[1]}}');
    expect(localStorage.getItem('m3102:notes')).toBe('{"state":{"old":true}}');
    expect(localStorage.getItem('m3102:me')).toBeNull();
  });

  it('значение, которое не объект хранилища, отклоняется до записи', () => {
    for (const value of ['5', '"текст"', 'null', '[1]'])
      expect(() => parseBackup(JSON.stringify({ app: 'm3102', data: { 'm3102:tasks': value } }))).toThrow('повреждена');
  });

  it('чужой, битый и слишком новый файл отклоняются с понятным сообщением', () => {
    expect(() => parseBackup('не json')).toThrow('не корректный JSON');
    expect(() => parseBackup('{"app":"other","data":{}}')).toThrow('Это не файл резервной копии');
    expect(() => parseBackup(JSON.stringify({ app: 'm3102', version: 99, data: { 'm3102:tasks': '{}' } }))).toThrow('более новой версией');
    expect(() => parseBackup(JSON.stringify({ app: 'm3102', data: { 'm3102:tasks': 5 } }))).toThrow('повреждена');
    expect(() => parseBackup(JSON.stringify({ app: 'm3102', data: { 'm3102:tasks': '{не json' } }))).toThrow('повреждена');
    expect(() => parseBackup(JSON.stringify({ app: 'm3102', data: { 'm3102:settings': '{}' } }))).toThrow('нет данных');
  });

  it('старая копия без версии принимается, настройки из неё не восстанавливаются', () => {
    const file = parseBackup(JSON.stringify({ app: 'm3102', data: { 'm3102:tasks': '{}', 'm3102:settings': '{"x":1}' } }));
    expect(file.version).toBe(1);
    expect(Object.keys(file.data)).toEqual(['m3102:tasks']);
  });

  it('описание говорит человеческими словами', () => {
    const file = parseBackup(JSON.stringify({ app: 'm3102', data: { 'm3102:tasks': '{}', 'm3102:notes': '{}', 'm3102:marks': '{}' } }));
    expect(describeBackup(file)).toBe('учебный план, заметки, закладки и пометки в конспектах');
  });

  it('дата последней копии и напоминание: нет копии или старше 30 дней', () => {
    expect(readLastBackup()).toBeNull();
    expect(isBackupStale(null)).toBe(true);
    markBackupNow(NOW.getTime());
    expect(readLastBackup()).toBe(NOW.getTime());
    expect(isBackupStale(NOW.getTime(), NOW.getTime() + 29 * 86_400_000)).toBe(false);
    expect(isBackupStale(NOW.getTime(), NOW.getTime() + 31 * 86_400_000)).toBe(true);
  });
});
