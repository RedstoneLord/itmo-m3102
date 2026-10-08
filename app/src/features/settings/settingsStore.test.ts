// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { useSettingsStore } from './settingsStore';

it('сохранённая стартовая страница /calendar открывает месяц расписания', async () => {
  localStorage.setItem('m3102:settings', JSON.stringify({ state: { startPage: '/calendar' }, version: 4 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().startPage).toBe('/schedule?view=month');
});

it('остальные стартовые страницы не меняются', async () => {
  localStorage.setItem('m3102:settings', JSON.stringify({ state: { startPage: '/deadlines' }, version: 4 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().startPage).toBe('/deadlines');
});
