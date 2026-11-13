import { read, save, esc, nice, fileHref, rawUrl, stamp } from './student-core.js';

export function showDialog(title, body) {
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog student-dialog';
  dialog.innerHTML = `<div class="dialog-head"><h2>${esc(title)}</h2><button class="btn2" data-dismiss aria-label="Закрыть">×</button></div>${body}`;
  dialog.querySelector('[data-dismiss]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
export function bookmarksPage(host) {
  const entries = read('m3102-bookmarks-v1', {});
  host.innerHTML = `<h1>Мои закладки и вопросы</h1><p>Видны только вам. Сохраняются в резервную копию личного прогресса.</p><div class="student-stack">${
    Object.entries(entries)
      .map(
        ([id, e]) =>
          `<article class="dash-panel"><a href="${esc(fileHref(e.path))}" data-jump-heading="${esc(e.heading || '')}" data-bookmark-open="${esc(id)}"><strong>${esc(e.heading || nice(e.path))}${e.page ? ` · страница ${e.page}` : ''}</strong></a><blockquote>${esc(e.quote || '')}</blockquote><p>${esc(e.note || '')}</p><small>${esc(nice(e.path))} · ${esc(stamp(e.at))}</small><div class="student-actions"><button class="btn2" data-bookmark-edit="${esc(id)}">Изменить</button><button class="btn2" data-bookmark-remove="${esc(id)}">Удалить</button></div></article>`,
      )
      .join('') || '<p>Откройте конспект, выделите текст и нажмите «Закладка / вопрос».</p>'
  }</div>`;
  host.onclick = (event) => {
    const remove = event.target.closest('[data-bookmark-remove]'),
      edit = event.target.closest('[data-bookmark-edit]');
    if (remove) {
      delete entries[remove.dataset.bookmarkRemove];
      if (save('m3102-bookmarks-v1', entries)) bookmarksPage(host);
    }
    if (edit) bookmarkForm(entries[edit.dataset.bookmarkEdit], edit.dataset.bookmarkEdit, () => bookmarksPage(host));
    const jump = event.target.closest('[data-jump-heading]');
    if (jump) {
      try {
        sessionStorage.setItem('m3102-jump-heading', jump.dataset.jumpHeading);
        sessionStorage.setItem('m3102-bookmark-jump', JSON.stringify(entries[jump.dataset.bookmarkOpen]));
      } catch {}
    }
  };
}
function bookmarkForm(entry, id = crypto.randomUUID(), after = () => {}) {
  const dialog = showDialog(
    'Личная закладка и вопрос',
    `<form><p>${esc(entry.heading || nice(entry.path))}</p><blockquote>${esc(entry.quote || '')}</blockquote><label class="sched-field">Моя пометка<textarea name="note" rows="4" maxlength="5000">${esc(entry.note || '')}</textarea></label><p>Только на этом устройстве. Переносится с резервной копией.</p><p data-error role="alert"></p><button class="btn2 btn-primary">Сохранить для меня</button></form>`,
  );
  dialog.querySelector('form').onsubmit = (event) => {
    event.preventDefault();
    const entries = read('m3102-bookmarks-v1', {});
    entries[id] = { ...entry, note: event.target.elements.note.value, at: new Date().toISOString() };
    if (!save('m3102-bookmarks-v1', entries)) {
      dialog.querySelector('[data-error]').textContent = 'Не удалось сохранить. Проверьте место в браузере.';
      return;
    }
    dialog.close();
    after();
  };
}
export function decorateReader(path) {
  const bar = document.querySelector('.note-main .viewbar');
  if (bar && !bar.querySelector('[data-bookmark-add]')) {
    const button = document.createElement('button');
    button.className = 'btn2';
    button.dataset.bookmarkAdd = '';
    button.textContent = 'Закладка / вопрос';
    // Pointerdown preserves the selected passage when the button receives focus.
    let selection = '';
    button.onpointerdown = () => {
      const s = getSelection();
      selection = document.querySelector('#note-body')?.contains(s?.anchorNode) ? s.toString().slice(0, 3000) : '';
    };
    button.onclick = () => {
      const s = getSelection(),
        node = s?.anchorNode?.parentElement;
      const heading =
        node?.closest('h1,h2,h3,h4') ||
        [...document.querySelectorAll('#note-body h1,#note-body h2,#note-body h3,#note-body h4')]
          .reverse()
          .find((e) => e.getBoundingClientRect().top < innerHeight / 2);
      bookmarkForm({
        path,
        quote: selection || '',
        heading: heading?.textContent || '',
        page: Number(document.querySelector('.student-pdf-controls input[type=number]')?.value) || undefined,
      });
    };
    bar.append(button);
  }
  let jump;
  try {
    jump = JSON.parse(sessionStorage.getItem('m3102-bookmark-jump'));
  } catch {}
  const body = document.querySelector('#note-body');
  if (jump?.path === path && body?.children.length) {
    try {
      sessionStorage.removeItem('m3102-bookmark-jump');
    } catch {}
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    const quote = normalize(jump.quote || '');
    const target = quote && [...body.querySelectorAll('p,li,blockquote,pre')].find((e) => normalize(e.textContent).includes(quote));
    if (target)
      requestAnimationFrame(() => {
        if (target.isConnected) target.scrollIntoView({ block: 'center' });
      });
  }
  const pages = document.querySelector('#pdf-pages');
  if (!pages?.children.length || pages.dataset.studentReady) return;
  pages.dataset.studentReady = '1';
  const state = read('m3102-reading-v1', {})[path] || {},
    canvases = [...pages.querySelectorAll('canvas')];
  if (jump?.path === path && jump.page) {
    state.page = jump.page;
    try {
      sessionStorage.removeItem('m3102-bookmark-jump');
    } catch {}
  }
  const controls = document.createElement('div');
  controls.className = 'student-actions student-pdf-controls';
  controls.innerHTML = `<label>Страница <input aria-label="Страница PDF" type="number" min="1" max="${canvases.length}" value="${Math.min(state.page || 1, canvases.length)}"> из ${canvases.length}</label><label><input type="checkbox" data-pdf-dark ${state.dark !== false ? 'checked' : ''}> Тёмные страницы в тёмной теме</label>`;
  pages.before(controls);
  pages.classList.toggle('student-dark-pdf', state.dark !== false);
  const input = controls.querySelector('input[type=number]');
  const persist = (page) => {
    const all = read('m3102-reading-v1', {});
    all[path] = { page, dark: controls.querySelector('[data-pdf-dark]').checked };
    save('m3102-reading-v1', all);
  };
  let restoring = state.page > 1;
  input.onchange = () => {
    const page = Math.max(1, Math.min(canvases.length, Number(input.value) || 1));
    input.value = page;
    restoring = true;
    canvases[page - 1].scrollIntoView({ block: 'start', behavior: 'instant' });
    persist(page);
    requestAnimationFrame(() => {
      restoring = false;
    });
  };
  controls.querySelector('[data-pdf-dark]').onchange = (e) => {
    pages.classList.toggle('student-dark-pdf', e.target.checked);
    persist(Number(input.value));
  };
  const observer = new IntersectionObserver(
    () => {
      if (!pages.isConnected) {
        observer.disconnect();
        return;
      }
      if (restoring) return;
      const visible = canvases
        .map((canvas, index) => {
          const rect = canvas.getBoundingClientRect();
          return { index, area: Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)) };
        })
        .sort((a, b) => b.area - a.area)[0];
      if (visible?.area) {
        input.value = visible.index + 1;
        persist(Number(input.value));
      }
    },
    { threshold: [0.1, 0.5] },
  );
  canvases.forEach((e) => observer.observe(e));
  if (state.page > 1)
    requestAnimationFrame(() => {
      if (pages.isConnected) canvases[Math.min(state.page, canvases.length) - 1].scrollIntoView({ block: 'start', behavior: 'instant' });
      requestAnimationFrame(() => {
        restoring = false;
      });
    });
  return () => observer.disconnect();
}
export async function audioPage(host, path, tree) {
  const saved = read('m3102-audio-v1', {})[path] || {};
  const subject = path.split('/')[1];
  const notes = tree.filter((e) => e.type === 'blob' && e.path.startsWith(`Конспекты/${subject}/`) && /\.(md|pdf)$/i.test(e.path));
  host.innerHTML = `<h1>${esc(nice(path))}</h1><div class="dash-panel"><audio controls preload="metadata" src="${esc(rawUrl(path))}"></audio><div class="student-actions"><button class="btn2" data-seek="-15">−15 секунд</button><button class="btn2" data-seek="15">+15 секунд</button><label>Скорость <select aria-label="Скорость записи">${[0.75, 1, 1.25, 1.5, 1.75, 2].map((n) => `<option value="${n}" ${Number(saved.rate || 1) === n ? 'selected' : ''}>${n}×</option>`).join('')}</select></label><button class="btn2" data-time-add>Отметить тему здесь</button></div><p data-audio-status role="status">Позиция и отметки сохраняются только для вас.</p><div data-times></div></div><h2>Конспекты этого предмета</h2>${notes.map((e) => `<p><a href="${esc(fileHref(e.path))}">${esc(nice(e.path))}</a></p>`).join('') || '<p>Соответствующий конспект пока не опубликован.</p>'}`;
  const audio = host.querySelector('audio'),
    times = saved.times || [];
  audio.playbackRate = saved.rate || 1;
  const persist = () => {
    const all = read('m3102-audio-v1', {});
    all[path] = { position: audio.currentTime, rate: audio.playbackRate, times };
    save('m3102-audio-v1', all);
  };
  audio.onloadedmetadata = () => {
    audio.currentTime = Math.min(saved.position || 0, Math.max(0, (audio.duration || Infinity) - 1));
  };
  audio.ontimeupdate = persist;
  audio.onpause = persist;
  audio.onerror = () => {
    host.querySelector('[data-audio-status]').textContent =
      'Запись недоступна. Подключитесь к сети или скачайте её в разделе «Работа без интернета».';
  };
  host.querySelector('select').onchange = (e) => {
    audio.playbackRate = Number(e.target.value);
    persist();
  };
  const draw = () => {
    host.querySelector('[data-times]').innerHTML = times
      .map(
        (t, i) =>
          `<div class="student-actions"><button class="btn2" data-time="${t.at}">${Math.floor(t.at / 60)}:${String(Math.floor(t.at % 60)).padStart(2, '0')} · ${esc(t.title)}</button><button class="btn2" data-time-remove="${i}" aria-label="Удалить отметку">×</button></div>`,
      )
      .join('');
  };
  host.onclick = (event) => {
    const seek = event.target.closest('[data-seek]'),
      time = event.target.closest('[data-time]'),
      remove = event.target.closest('[data-time-remove]');
    if (seek)
      audio.currentTime = Math.max(
        0,
        Math.min(Number.isFinite(audio.duration) ? audio.duration : Infinity, audio.currentTime + Number(seek.dataset.seek)),
      );
    if (time) audio.currentTime = Number(time.dataset.time);
    if (remove) {
      times.splice(Number(remove.dataset.timeRemove), 1);
      persist();
      draw();
    }
    if (event.target.closest('[data-time-add]')) {
      const dialog = showDialog(
        'Тема записи',
        '<form><label class="sched-field">Название темы<input name="title" required maxlength="160"></label><button class="btn2 btn-primary">Сохранить отметку</button></form>',
      );
      const at = audio.currentTime;
      dialog.querySelector('form').onsubmit = (e) => {
        e.preventDefault();
        times.push({ at, title: e.target.elements.title.value });
        times.sort((a, b) => a.at - b.at);
        persist();
        draw();
        dialog.close();
      };
    }
  };
  draw();
  window.addEventListener('pagehide', persist);
  return () => {
    persist();
    window.removeEventListener('pagehide', persist);
    audio.ontimeupdate = null;
    audio.onpause = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
}
export function memeDialog(card) {
  const image = card.querySelector('img');
  if (!image) return;
  const id = card.dataset.meme,
    link = new URL(location.href);
  link.hash = `#/memes?meme=${encodeURIComponent(id)}`;
  const dialog = showDialog(
    image.alt || 'Мем',
    `<img class="student-meme-large" src="${esc(image.src)}" alt="${esc(image.alt)}"><div class="student-actions"><button class="btn2" data-copy>Копировать ссылку</button><a class="btn2" href="${esc(link.href)}">Ссылка на этот мем</a></div><p role="status"></p>`,
  );
  dialog.querySelector('[data-copy]').onclick = () =>
    navigator.clipboard
      .writeText(link.href)
      .then(() => {
        dialog.querySelector('[role=status]').textContent = 'Ссылка скопирована';
      })
      .catch(() => {
        dialog.querySelector('[role=status]').textContent = link.href;
      });
}
