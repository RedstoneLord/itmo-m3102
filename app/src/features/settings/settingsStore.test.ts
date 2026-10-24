// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { useSettingsStore } from './settingsStore';

it('с пустым хранилищем окно «первого входа» ещё не показано', () => {
  expect(useSettingsStore.getState().onboarded).toBe(false);
});

it('у кого стор уже был (любая прежняя версия), окно «первого входа» считается показанным', async () => {
  for (const version of [4, 5, 6]) {
    useSettingsStore.setState({ onboarded: false });
    localStorage.setItem('m3102:settings', JSON.stringify({ state: { theme: 'dark' }, version }));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().onboarded).toBe(true);
  }
});

it('в сторе новой версии сохранённое onboarded не трогаем: вернули приветствие — оно покажется', async () => {
  localStorage.setItem('m3102:settings', JSON.stringify({ state: { onboarded: false }, version: 7 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().onboarded).toBe(false);
});

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

it('сохранённая стартовая страница /homework открывает вкладку ДЗ', async () => {
  localStorage.setItem('m3102:settings', JSON.stringify({ state: { startPage: '/homework' }, version: 4 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().startPage).toBe('/deadlines?tab=homework');
});

it('до появления «Стиля»: сияние и свечение выключены — Minimalism, иначе Aurora', async () => {
  localStorage.setItem('m3102:settings', JSON.stringify({ state: { aurora: false, glow: false }, version: 5 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().style).toBe('minimal');

  localStorage.setItem('m3102:settings', JSON.stringify({ state: { aurora: false, glow: true }, version: 5 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().style).toBe('aurora');
});

it('прежняя пара по умолчанию (индиго + роза) переходит на лаванду, выбранные цвета остаются', async () => {
  localStorage.setItem('m3102:settings', JSON.stringify({ state: { accent: 'indigo', accent2: 'rose' }, version: 5 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()).toMatchObject({ accent: 'lavender', accent2: 'dusty' });

  localStorage.setItem('m3102:settings', JSON.stringify({ state: { accent: 'teal', accent2: 'rose' }, version: 5 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()).toMatchObject({ accent: 'teal', accent2: 'rose' });
});

it('сохранённый стиль новой версии не трогаем', async () => {
  localStorage.setItem('m3102:settings', JSON.stringify({ state: { style: 'glass', accent: 'indigo', accent2: 'rose' }, version: 6 }));
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()).toMatchObject({ style: 'glass', accent: 'indigo', accent2: 'rose' });
});
