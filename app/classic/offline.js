import { CONTENT, SHELL, read, save, esc, rawUrl, bytes, stamp } from './student-core.js';
import { loadTree, json } from './student-data.js';

const KEY = 'm3102-offline-v1';
const roots = /^(Конспекты|Материалы|Лабораторные|Записи лекций)\//;
let running,
  status = '',
  inventory = [],
  shellFiles = [],
  failed = [],
  busy = false;
const panels = new Set();
const selected = new Set();
let selectionInitialized = false;
const emit = () => {
  for (const root of panels) {
    if (root.isConnected) draw(root);
    else panels.delete(root);
  }
};
async function catalog(fresh = false) {
  const [tree, manifest] = await Promise.all([loadTree({ fresh }), json('./shell-manifest.json')]);
  inventory = tree.filter(
    (e) => e.type === 'blob' && (roots.test(e.path) || /^(img\/|data\/|Дедлайны\/)/.test(e.path)) && !e.path.split('/').includes('output'),
  );
  shellFiles = manifest.files;
  if ('caches' in window) {
    const cache = await caches.open(CONTENT),
      state = read(KEY),
      files = { ...state.files };
    let complete = Boolean(state.complete);
    await Promise.all(
      inventory.map(async (entry) => {
        if (files[entry.path] && !(await cache.match(rawUrl(entry.path), { ignoreVary: true }))) delete files[entry.path];
        if (files[entry.path] !== entry.sha) complete = false;
      }),
    );
    if (complete) {
      const shell = await caches.open(SHELL);
      for (const entry of shellFiles) {
        const hit = await shell.match(new URL(entry.url, location.href));
        if (!hit || hit.headers.get('X-M3102-Revision') !== entry.revision) {
          complete = false;
          break;
        }
      }
    }
    if (state.complete && !complete) status = 'Копию нужно обновить: часть файлов изменена или удалена браузером.';
    if (state.files) save(KEY, { ...state, files, complete });
  }
  if (!selectionInitialized) {
    const previous = read(KEY).selected;
    inventory.forEach((e) => {
      if (!Array.isArray(previous) || previous.includes(e.path)) selected.add(e.path);
    });
    selectionInitialized = true;
  }
}
async function stored(entry, cache) {
  const hit = await cache.match(rawUrl(entry.path), { ignoreVary: true });
  return Boolean(hit && read(KEY).files?.[entry.path] === entry.sha);
}
async function shellDownload() {
  const cache = await caches.open(SHELL);
  const files = [...shellFiles];
  const seen = new Set(files.map((e) => new URL(e.url, location.href).href));
  for (let index = 0; index < files.length; index++) {
    const { url, revision } = files[index],
      absolute = new URL(url, location.href).href;
    try {
      let response = await cache.match(absolute);
      if (!response || response.headers.get('X-M3102-Revision') !== revision) {
        response = await fetch(absolute, { cache: 'reload', signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer(),
          headers = new Headers(response.headers);
        headers.set('X-M3102-Revision', revision);
        response = new Response(data, { headers });
        await cache.put(absolute, response.clone());
      }
      // KaTeX and other vendor styles refer to fonts not visible in the HTML.
      if (/\.css(?:\?|$)/.test(absolute))
        for (const match of (await response.text()).matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) {
          if (/^(data:|#)/.test(match[1])) continue;
          // All supported browsers use woff2. Some CDN styles list missing legacy font fallbacks.
          if (/\.(woff|ttf|otf)(?:[?#]|$)/i.test(match[1])) continue;
          const font = new URL(match[1], absolute).href;
          if (!seen.has(font)) {
            seen.add(font);
            files.push({ url: font, revision });
          }
        }
    } catch {
      failed.push(url);
    }
    status = `Оболочка и игры: ${index + 1} из ${files.length}`;
    emit();
  }
}
export function syncOffline() {
  if (running) return running;
  running = (async () => {
    busy = true;
    failed = [];
    status = 'Проверяем файлы…';
    emit();
    try {
      if (!('caches' in window) || !('serviceWorker' in navigator))
        throw new Error('Офлайн-загрузка требует HTTPS и поддержки сохранения файлов в браузере.');
      await catalog(true);
      const cache = await caches.open(CONTENT),
        state = read(KEY),
        files = { ...state.files };
      const wanted = inventory.filter((e) => selected.has(e.path));
      const estimate = await navigator.storage?.estimate?.();
      let needed = 0;
      for (const e of wanted) if (!(await stored(e, cache))) needed += e.size || 0;
      if (estimate?.quota && needed > estimate.quota - estimate.usage) throw new Error(`Не хватает места: нужно ${bytes(needed)}.`);
      await navigator.storage?.persist?.().catch(() => false);
      await shellDownload();
      let readyTimer;
      try {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => {
            readyTimer = setTimeout(() => reject(new Error('Браузер не включил офлайн-режим. Перезагрузите страницу и повторите загрузку.')), 15000);
          }),
        ]);
      } finally {
        clearTimeout(readyTimer);
      }
      // Metadata is required even when a single subject is selected.
      for (const url of [
        './data/tree.json',
        './data/student-subjects.json',
        './data/lectures.json',
        './data/display-names.json',
        './data/schedule.json',
        './data/homework.json',
        './Дедлайны/deadlines.json',
        './data/links.json',
        './data/memes.json',
        './data/old-paths.json',
        './data/search-index.json',
      ]) {
        try {
          await json(url);
        } catch {
          failed.push(url);
        }
      }
      let next = 0,
        done = 0;
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (next < wanted.length) {
            const entry = wanted[next++];
            try {
              if (!(await stored(entry, cache))) {
                const response = await fetch(rawUrl(entry.path), { cache: 'reload', signal: AbortSignal.timeout(60000) });
                if (!response.ok) throw new Error(String(response.status));
                await cache.put(rawUrl(entry.path), response);
                files[entry.path] = entry.sha;
              }
            } catch {
              failed.push(entry.path);
            }
            done++;
            status = `Материалы: ${done} из ${wanted.length}`;
            if (!save(KEY, { ...state, files, failed, complete: false })) failed.push('Не удалось сохранить список загрузок');
            emit();
          }
        }),
      );
      // A partial selection is never advertised as the entire application.
      const complete = !failed.length && wanted.length === inventory.length;
      if (!save(KEY, { files, failed, complete, at: new Date().toISOString(), selected: [...selected] }))
        throw new Error('Не удалось сохранить статус загрузки. Проверьте свободное место.');
      status = failed.length
        ? `Не удалось скачать: ${failed.length}. Повторите загрузку.`
        : complete
          ? 'Всё готово для работы без интернета'
          : 'Выбранные файлы и все игры готовы для работы без интернета';
    } catch (error) {
      status = error.message;
      save(KEY, { ...read(KEY), complete: false });
    } finally {
      busy = false;
      emit();
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
export async function clearOffline() {
  await caches.delete(CONTENT);
  save(KEY, { files: {}, complete: false });
  status = 'Сохранённые материалы удалены. Личный прогресс сохранён.';
  emit();
}
function draw(root) {
  const open = [...root.querySelectorAll('details[open]')].map((el) => el.querySelector('[data-off-group]')?.dataset.offGroup);
  const state = read(KEY),
    groups = new Map();
  for (const entry of inventory) {
    const group = entry.path.split('/').slice(0, 2).join('/');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(entry);
  }
  root.innerHTML = `<section class="dash-panel student-offline"><h2>Работа без интернета</h2><p role="status">${esc(status || (state.complete ? 'Сохранена полная копия' : 'Выберите материалы и скачайте их заранее'))}${state.at ? ` · ${esc(stamp(state.at))}` : ''}</p><p>Все разделы и игры скачиваются вместе с оболочкой. Материалы можно выбрать отдельно. Живые очереди и публикация в GitHub требуют сети.</p><div class="student-actions"><button class="btn2 btn-primary" data-off-start ${busy ? 'disabled' : ''}>${state.files ? 'Скачать / повторить ошибки' : 'Скачать'}</button><button class="btn2" data-off-catalog ${busy ? 'disabled' : ''}>Проверить обновления</button><button class="btn2" data-off-clear ${busy ? 'disabled' : ''}>Удалить материалы</button><button class="btn2" data-off-all ${busy ? 'disabled' : ''}>Выбрать всё</button></div><p>${selected.size} файлов · ${bytes(inventory.filter((e) => selected.has(e.path)).reduce((n, e) => n + (e.size || 0), 0))}</p><div class="student-file-picker">${[...groups].map(([group, entries]) => `<details><summary><label><input type="checkbox" data-off-group="${esc(group)}" ${entries.every((e) => selected.has(e.path)) ? 'checked' : ''} ${busy ? 'disabled' : ''}> ${esc(group.replace(/_/g, ' '))} · ${bytes(entries.reduce((n, e) => n + (e.size || 0), 0))}</label></summary>${entries.map((e) => `<label><input type="checkbox" data-off-file="${esc(e.path)}" ${selected.has(e.path) ? 'checked' : ''} ${busy ? 'disabled' : ''}>${esc(e.path.split('/').pop())} · ${bytes(e.size || 0)} · ${state.files?.[e.path] === e.sha ? 'сохранён' : state.files?.[e.path] ? 'есть обновление' : 'не скачан'}</label>`).join('')}</details>`).join('')}</div>${(failed.length ? failed : state.failed || []).length ? `<details><summary>Ошибки загрузки</summary><ul>${(failed.length ? failed : state.failed).map((path) => `<li>${esc(path)}</li>`).join('')}</ul></details>` : ''}</section>`;
  const size = document.createElement('p');
  size.className = 'plan-hint';
  size.textContent = `Приложение и игры: ${bytes(shellFiles.reduce((total, file) => total + (file.size || 0), 0))} дополнительно к выбранным материалам. Размер библиотек чтения определяется при загрузке.`;
  root.querySelector('.student-file-picker').before(size);
  root.querySelectorAll('details').forEach((el) => {
    if (open.includes(el.querySelector('[data-off-group]')?.dataset.offGroup)) el.open = true;
  });
}
export function mountOfflinePanel(root) {
  if (!root) return;
  panels.add(root);
  draw(root);
  root.onclick = async (event) => {
    if (event.target.closest('[data-off-start]')) syncOffline();
    if (event.target.closest('[data-off-clear]') && confirm('Удалить скачанные материалы? Личный прогресс останется.')) clearOffline();
    if (event.target.closest('[data-off-all]')) {
      inventory.forEach((e) => selected.add(e.path));
      draw(root);
    }
    if (event.target.closest('[data-off-catalog]')) {
      try {
        await catalog(true);
        status = 'Список обновлён. Выберите файлы.';
      } catch (e) {
        status = e.message;
      }
      draw(root);
    }
  };
  root.onchange = (event) => {
    const file = event.target.dataset.offFile,
      group = event.target.dataset.offGroup;
    for (const entry of inventory.filter((e) => (file ? e.path === file : group && e.path.startsWith(`${group}/`))))
      event.target.checked ? selected.add(entry.path) : selected.delete(entry.path);
    draw(root);
  };
  catalog()
    .then(() => draw(root))
    .catch((error) => {
      status = `Список недоступен: ${error.message}. Повторите проверку.`;
      draw(root);
    });
}
export function installOffline() {
  const bar = document.createElement('div');
  bar.className = 'student-network';
  bar.setAttribute('role', 'status');
  const update = () => {
    bar.hidden = navigator.onLine;
    bar.textContent = 'Нет сети — показаны сохранённые данные. Живые очереди обновятся после подключения.';
  };
  document.body.append(bar);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
