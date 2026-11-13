import {
  esc,
  read,
  save,
  stamp,
  nice,
  rawUrl,
  fileHref,
  deadlineGroups,
  exportPersonal,
  parsePersonal,
  restorePersonal,
  download,
  shuffled,
} from './student-core.js';
import { directoryResponse, json, loadTree, queues, freshnessMarkup, markFresh } from './student-data.js';
import { bookmarksPage, decorateReader, audioPage, memeDialog, showDialog } from './student-reader.js';
import { mountOfflinePanel, installOffline } from './offline.js';
import { ensureSchedule, getSchedule } from './schedule-ui.js';
import { lessonsOn, dateKey, addDays, mondayOf, parseDate } from './schedule.js';
import { parseQuiz, quizPageSource } from './quiz.js';
import { plainMathText } from './student-text.js';
import { ic } from './icons.js';

export { directoryResponse };
let context,
  cleanup = () => {},
  observer,
  queued = false;
const host = () => document.getElementById('content');
const me = () => read('m3102-student-v1', {}).login || '';
const done = () => read('m3102-study-plan-v1', {}).done || {};
const errors = (node, error) => {
  if (node?.isConnected)
    node.innerHTML = `<p role="alert">Не удалось загрузить: ${esc(error.message)}</p><button class="btn2" data-student-retry>Повторить попытку</button>`;
};
function panel(title, body, cls = '') {
  return `<section class="dash-panel ${cls}"><h2>${esc(title)}</h2>${body}</section>`;
}
function quickAction(icon, label, short, attributes) {
  const tag = attributes.startsWith('href=') ? 'a' : 'button';
  return `<${tag}${tag === 'button' ? ' type="button"' : ''} class="btn2" ${attributes} aria-label="${esc(label)}" title="${esc(label)}">${ic(icon, 18)}<span class="student-action-label">${esc(short)}</span></${tag}>`;
}
function compactQuickActions() {
  const specs = [
    ['[data-ai-download]', 'download', 'Текст'],
    ['[data-ai-link]', 'link', 'Ссылка'],
    ['a[href^="#/review/"]', 'cap', 'Подготовка'],
    ['[data-review-all]', 'refresh', 'Все вопросы'],
    ['[data-review-wrong]', 'notes', 'Ошибки'],
    ['[data-calendar]', 'calendar', 'Календарь'],
    ['[data-backup-export]', 'download', 'Копия'],
    ['[data-backup-choose]', 'folder', 'Восстановить'],
    ['[data-prefs-action="export"]', 'download', 'Экспорт'],
    ['[data-prefs-action="import"]', 'folder', 'Импорт'],
    ['[data-prefs-action="reset"]', 'undo', 'Сброс'],
    ['#student-work-tabs a[href="#/homework"]', 'pencil', 'ДЗ'],
    ['#student-work-tabs a[href="#/deadlines"]', 'tasks', 'Дедлайны'],
  ];
  for (const [selector, icon, short] of specs) {
    document.querySelectorAll(selector).forEach((button) => {
      if (button.querySelector('.student-action-label')) return;
      button.setAttribute('aria-label', button.textContent.trim());
      button.title = button.textContent.trim();
      button.classList.add('btn2');
      button.innerHTML = `${ic(icon, 18)}<span class="student-action-label">${short}</span>`;
      button.parentElement.classList.add('student-quick-actions');
    });
  }
}
function identityMarkup() {
  return `<label class="sched-field">Кто вы?<select data-student-me><option value="">Я гость</option>${context.students.map((s) => `<option value="${esc(s.nick)}" ${me() === s.nick ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><p>Выбор хранится только у вас. Он нужен для выделения ваших мест в общих очередях.</p>`;
}
function deadlineList(entries, limit = Infinity) {
  return (
    entries
      .slice(0, limit)
      .map((d) => `<p><a href="#/deadlines"><strong>${esc(d.name)}</strong></a> · ${esc(stamp(d.deadline))}</p>`)
      .join('') || '<p>Нет работ в этом списке.</p>'
  );
}
export function renderHomeDeadlines(items) {
  const box = document.getElementById('home-deadlines');
  if (!box) return;
  const g = deadlineGroups(items, done());
  box.innerHTML =
    deadlineList(g.upcoming, 3) +
    `<details><summary>Остались долги · ${g.debts.length}</summary>${deadlineList(g.debts)}</details><details><summary>Архив и выполненные для меня · ${g.archive.length}</summary>${deadlineList(g.archive)}</details>`;
  const old = document.getElementById('completed-deadlines');
  if (old) old.innerHTML = '';
}
function settings() {
  const page = document.querySelector('.settings-page');
  if (!page || page.querySelector('#student-settings')) return;
  const node = document.createElement('div');
  node.id = 'student-settings';
  node.className = 'student-stack';
  node.innerHTML =
    panel('Мои данные', `${identityMarkup()}<a class="btn2" href="#/bookmarks">Мои закладки и вопросы</a>`) +
    panel(
      'Резервная копия личного прогресса',
      '<p>Перенести мои данные: задачи, выполнение ДЗ, учебный план, закладки, ошибки тестов, позиции чтения и прослушивания, игровой прогресс и настройки. Токены и скачанные материалы в копию не входят.</p><div class="student-actions"><button class="btn2" data-backup-export>Скачать резервную копию</button><button class="btn2" data-backup-choose>Выбрать резервную копию</button><input type="file" accept="application/json,.json" hidden data-backup-import></div><p data-backup-filename></p><p data-backup-status role="status"></p>',
    ) +
    '<div id="student-offline-settings"></div>';
  page.append(node);
  mountOfflinePanel(node.querySelector('#student-offline-settings'));
}
async function personalQueues(node) {
  if (!me()) {
    node.innerHTML = identityMarkup();
    return;
  }
  try {
    const [data, deadlines] = await Promise.all([
      queues(context.students, { matches: context.studentMatches, resolve: context.resolveQueueEntry }),
      json('./Дедлайны/deadlines.json', 'Дедлайны'),
    ]);
    if (!node.isConnected) return;
    const mine = deadlines
      .filter((d) => !deadlineGroups([d], done()).archive.length)
      .flatMap((d) => {
        const q = data[d.id] || [],
          pos = q.findIndex((e) => e.login.toLowerCase() === me().toLowerCase());
        return pos < 0 ? [] : [`<p><a href="#/deadlines"><strong>${esc(d.name)}</strong> — вы №${pos + 1} из ${q.length}</a></p>`];
      });
    node.innerHTML = mine.join('') || '<p>Вы пока не записаны в открытые очереди.</p>';
  } catch (error) {
    errors(node, error);
  }
}
function nextClass() {
  const node = document.querySelector('#student-next');
  if (!node) return;
  const schedule = getSchedule();
  if (!schedule) return;
  const now = new Date();
  let found;
  for (let offset = 0; offset < 30 && !found; offset++) {
    const date = addDays(now, offset);
    for (const lesson of lessonsOn(date, schedule).filter((l) => !l.break)) {
      const start = new Date(`${dateKey(date)}T${lesson.start}`),
        end = new Date(`${dateKey(date)}T${lesson.end}`);
      if (end > now) {
        found = { lesson, date, start, end };
        break;
      }
    }
  }
  if (!found) {
    node.textContent = 'В ближайшие 30 дней занятий нет.';
    return;
  }
  const { lesson, date, start, end } = found,
    minutes = Math.ceil(((start > now ? start : end) - now) / 60000);
  node.innerHTML = `<strong>${esc(lesson.subject)}</strong><p>${start > now ? `До начала ${minutes < 120 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`}` : `Сейчас идёт · осталось ${minutes} мин`} · ${esc(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }))}, ${esc(lesson.start)}–${esc(lesson.end)}</p><p>Ауд. ${esc(lesson.room || 'уточняется')} · ${esc(lesson.location || schedule.defaultLocation || '')}</p><a class="btn2" href="#/schedule/${dateKey(date)}">Открыть день</a>`;
}
function home() {
  const grid = document.querySelector('.dashboard-grid');
  const anchor = document.querySelector('.schedule-panel');
  if (!anchor || document.querySelector('#student-home-tools')) return;
  const tools = document.createElement('div');
  tools.id = 'student-home-tools';
  tools.className = 'student-stack';
  tools.innerHTML =
    panel('Следующая пара', '<div id="student-next">Загружаем расписание…</div>', 'student-next-panel') +
    panel('Мои очереди', '<div id="student-my-queues">Загружаем очереди…</div>', 'student-queues-panel') +
    `<nav id="student-home-tools" class="student-actions student-quick-actions" aria-label="Быстрые действия">${quickAction('book', 'Все предметы', 'Предметы', 'href="#/subjects"')}${quickAction('notes', 'Закладки и вопросы', 'Закладки', 'href="#/bookmarks"')}${quickAction('settings', 'Настроить главную', 'Настроить', 'data-home-config')}</nav>`;
  anchor.before(...tools.children);
  ensureSchedule()
    .then(nextClass)
    .catch((e) => errors(document.querySelector('#student-next'), e));
  personalQueues(document.querySelector('#student-my-queues'));
  const parent = grid || anchor.parentElement;
  const panels = [...parent.children].filter((e) => e.matches('section.dash-panel'));
  panels.forEach((p, i) => {
    p.dataset.homeBlock = p.id || [...p.classList].find((c) => c !== 'dash-panel' && c.endsWith('-panel')) || `block-${i}`;
  });
  const order = read('m3102-home-layout-v1', {}).order || [];
  [...panels]
    .sort(
      (a, b) =>
        (order.indexOf(a.dataset.homeBlock) < 0 ? 99 : order.indexOf(a.dataset.homeBlock)) -
        (order.indexOf(b.dataset.homeBlock) < 0 ? 99 : order.indexOf(b.dataset.homeBlock)),
    )
    .forEach((p) => parent.append(p));
}
function homeConfig() {
  const nodes = [...document.querySelectorAll('[data-home-block]')];
  const dialog = showDialog(
    'Порядок блоков главной',
    `<p>Выберите, что видеть первым. Порядок сохраняется только для вас.</p><div data-order>${nodes.map((n) => `<div class="student-order" data-block="${esc(n.dataset.homeBlock)}"><span>${esc(n.querySelector('h2')?.textContent || 'Следующая пара и мои очереди')}</span><button class="btn2" data-up aria-label="Поднять блок">↑</button><button class="btn2" data-down aria-label="Опустить блок">↓</button></div>`).join('')}</div><button class="btn2 btn-primary" data-order-save>Сохранить порядок</button>`,
  );
  dialog.onclick = (event) => {
    const row = event.target.closest('[data-block]');
    if (row && event.target.closest('[data-up]') && row.previousElementSibling) row.previousElementSibling.before(row);
    if (row && event.target.closest('[data-down]') && row.nextElementSibling) row.nextElementSibling.after(row);
    if (event.target.closest('[data-order-save]')) {
      const order = [...dialog.querySelectorAll('[data-block]')].map((n) => n.dataset.block);
      if (save('m3102-home-layout-v1', { order })) {
        for (const key of order) {
          const node = nodes.find((n) => n.dataset.homeBlock === key);
          node.parentElement.append(node);
        }
        dialog.close();
      }
    }
  };
}
function tabs(mode) {
  if (!['homework', 'deadlines'].includes(mode)) return;
  save('m3102-last-work-tab-v1', mode);
  if (!document.querySelector('#student-work-tabs'))
    host().insertAdjacentHTML(
      'afterbegin',
      `<nav id="student-work-tabs" class="student-actions" aria-label="Задания и сроки"><a class="btn2" href="#/homework" ${mode === 'homework' ? 'aria-current="page"' : ''}>Домашнее задание</a><a class="btn2" href="#/deadlines" ${mode === 'deadlines' ? 'aria-current="page"' : ''}>Дедлайны</a></nav>`,
    );
}
function scheduleLinks() {
  const page = document.querySelector('#schedule-page');
  if (!page || page.querySelector('[data-schedule-links]')) return;
  page
    .querySelector('.intro')
    .insertAdjacentHTML(
      'afterend',
      '<nav class="student-actions" data-schedule-links aria-label="Обзор расписания"><a class="btn2" href="#/schedule" aria-current="page">День</a><a class="btn2" href="#/week">Неделя</a><a class="btn2" href="#/month">Месяц</a><button class="btn2" data-calendar>Подписка на календарь</button></nav>',
    );
}
function calendarDialog() {
  const url = new URL('./m3102.ics', location.href),
    subscription = url.href.replace(/^https?:/, 'webcal:');
  const dialog = showDialog(
    'Календарь телефона',
    `<p>Подписка обновляет пары и дедлайны автоматически. Частоту обновления выбирает ваше календарное приложение.</p><a class="btn2 btn-primary" href="${esc(subscription)}">Подписаться на расписание</a><label class="sched-field">Адрес подписки<input readonly value="${esc(url.href)}"></label><button class="btn2" data-calendar-copy>Копировать адрес</button><p>Разовый файл — снимок расписания. После импорта он сам не обновляется.</p><a class="btn2" href="${esc(url.href)}" download="m3102.ics">Скачать файл один раз</a><p role="status"></p>`,
  );
  dialog.querySelector('[data-calendar-copy]').onclick = () =>
    navigator.clipboard
      .writeText(url.href)
      .then(() => {
        dialog.querySelector('[role=status]').textContent = 'Адрес скопирован';
      })
      .catch(() => {});
}
async function overview(node, mode, date) {
  const schedule = await ensureSchedule();
  if (!node.isConnected) return;
  const month = mode === 'month',
    start = month ? mondayOf(new Date(date.getFullYear(), date.getMonth(), 1)) : mondayOf(date);
  const count = month
    ? Math.ceil(
        (((new Date(date.getFullYear(), date.getMonth() + 1, 0).getDay() + 6) % 7) + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) /
          7,
      ) * 7
    : 7;
  // Month grid always includes leading and trailing days; six rows when needed.
  const cells = month
    ? Math.ceil(
        (((new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7) + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) / 7,
      ) * 7
    : count;
  node.innerHTML = `<h1>${month ? 'Месяц' : 'Неделя'} расписания</h1><nav class="student-actions"><a class="btn2" href="#/schedule/${dateKey(date)}">День</a><a class="btn2" href="#/week/${dateKey(date)}">Неделя</a><a class="btn2" href="#/month/${dateKey(date)}">Месяц</a><button class="btn2" data-calendar>Подписка на календарь</button></nav><div class="student-actions"><button class="btn2" data-overview-prev aria-label="Предыдущий период">←</button><strong>${esc(date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }))}</strong><button class="btn2" data-overview-next aria-label="Следующий период">→</button><a class="btn2" href="#/${mode}/${dateKey(new Date())}">Сегодня</a></div><div class="student-calendar ${month ? 'is-month' : ''}">${Array.from(
    { length: cells },
    (_, i) => {
      const day = addDays(start, i),
        entries = lessonsOn(day, schedule),
        real = entries.filter((l) => !l.break);
      return `<article class="dash-panel ${dateKey(day) === dateKey(new Date()) ? 'student-today' : ''}"><h2><a href="#/schedule/${dateKey(day)}">${esc(day.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }))}</a></h2>${entries.map((l) => `<p class="${l.break ? 'student-gap' : ''}"><strong>${esc(l.start)}–${esc(l.end)}</strong><br>${esc(l.break ? 'Свободное окно' : l.subject)}${l.break ? '' : `<br><small>${esc({ lecture: 'Лекция', practice: 'Практика', lab: 'Лабораторная' }[l.kind] || 'Занятие')} · ауд. ${esc(l.room || '?')}</small>`}</p>`).join('') || '<p>Свободный день</p>'}${real.length ? `<small>Занятий: ${real.length}</small>` : ''}</article>`;
    },
  ).join('')}</div>`;
  node.querySelector('[data-overview-prev]').onclick = () => {
    location.hash = `#/${mode}/${dateKey(month ? new Date(date.getFullYear(), date.getMonth() - 1, 1) : addDays(date, -7))}`;
  };
  node.querySelector('[data-overview-next]').onclick = () => {
    location.hash = `#/${mode}/${dateKey(month ? new Date(date.getFullYear(), date.getMonth() + 1, 1) : addDays(date, 7))}`;
  };
}
async function subjectsPage(node, subject = '') {
  const [lectures, tree, deadlines, links, schedule] = await Promise.all([
    json('./data/lectures.json'),
    loadTree(),
    json('./Дедлайны/deadlines.json', 'Дедлайны'),
    json('./data/links.json'),
    ensureSchedule(),
  ]);
  if (!node.isConnected) return;
  const subjects = lectures.subjects || [];
  if (!subject) {
    node.innerHTML = `<h1>Предметы</h1><div class="grid">${subjects.map((s) => `<a class="card" href="#/subject/${encodeURIComponent(s.name)}"><div class="meta"><strong>${esc(s.name.replace(/_/g, ' '))}</strong><p>Конспекты, занятия, лабораторные и подготовка</p></div></a>`).join('')}</div>`;
    return;
  }
  const s = subjects.find((s) => s.name === subject);
  if (!s) throw new Error('Предмет не найден');
  const norm = (v) =>
    String(v || '')
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/ё/g, 'е');
  const name = subject.replace(/_/g, ' '),
    aliases = {
      Алгоритмы_и_структуры_данных: ['аисд'],
      Основы_программирования: ['оп'],
      Математический_анализ: ['матанализ', 'матан'],
      Дискретная_математика: ['дм'],
      Линейная_алгебра: ['линал'],
      Инструментальные_средства_разработки_ПО: ['исрпо'],
    };
  const matches = (v) =>
    norm(v).includes(norm(name)) || (aliases[subject] || []).some((a) => new RegExp(`(^|[^а-яa-z])${a}([^а-яa-z]|$)`, 'i').test(v));
  let next;
  for (let i = 0; i < 30 && !next; i++) {
    const date = addDays(new Date(), i);
    const lesson = lessonsOn(date, schedule).find((l) => matches(l.subject) && new Date(`${dateKey(date)}T${l.end}`) > new Date());
    if (lesson) next = { date, lesson };
  }
  const files = tree.filter((e) => e.type === 'blob' && /^(Лабораторные|Материалы|Записи лекций)\//.test(e.path) && matches(e.path.split('/')[1]));
  const teachers = [
    ...new Set(
      schedule.cycle
        .flat()
        .filter((l) => matches(l.subject))
        .map((l) => l.teacher)
        .filter(Boolean),
    ),
  ];
  const ds = deadlineGroups(
    deadlines.filter((d) => matches(d.name)),
    done(),
  );
  node.innerHTML = `<a href="#/subjects">← Все предметы</a><h1>${esc(name)}</h1><div class="student-actions"><a class="btn2" href="#/review/${encodeURIComponent(subject)}">Подготовка к контрольной</a><button class="btn2" data-ai-download="${esc(subject)}">Для ИИ: скачать текст</button><button class="btn2" data-ai-link="${esc(subject)}">Для ИИ: ссылка</button></div><p data-ai-status role="status"></p><div class="student-stack">${panel('Ближайшая пара', next ? `<a href="#/schedule/${dateKey(next.date)}">${esc(stamp(`${dateKey(next.date)}T${next.lesson.start}`))} · ауд. ${esc(next.lesson.room)}</a>` : '<p>В ближайшие 30 дней занятий нет.</p>')}${panel(
    'Конспекты и темы',
    s.lectures
      .map(
        (l) =>
          `<details><summary>${esc(l.name.replace(/_/g, ' '))} — ${esc(
            l.files
              .flatMap((f) => f.headings || [])
              .filter((h) => !/^лекци[яи]|практика|содержание$/i.test(h))
              .slice(0, 3)
              .join(' · '),
          )}</summary>${l.files.map((f) => `<p><a href="${esc(fileHref(f.path))}">${esc(f.name.replace(/_/g, ' '))}</a></p>`).join('')}</details>`,
      )
      .join(''),
  )}${panel('Лабораторные, материалы и записи', files.map((e) => `<p><a href="${esc(/\.(mp3|wav|m4a|ogg|opus|flac)$/i.test(e.path) ? fileHref(e.path) : /\.(md|pdf)$/i.test(e.path) ? fileHref(e.path) : rawUrl(e.path))}">${esc(nice(e.path))}</a></p>`).join('') || '<p>Материалы пока не опубликованы.</p>')}${panel('Скоро сдавать', deadlineList(ds.upcoming))}${panel('Остались долги', deadlineList(ds.debts))}${panel('Преподаватели', teachers.map((t) => `<p>${esc(t)}</p>`).join('') || '<p>Уточняются</p>')}${panel(
    'Полезные ссылки',
    (links.items || [])
      .filter((l) => matches(l.subject))
      .map((l) => `<p><a href="${esc(/^https?:/.test(l.url) ? l.url : '#/links')}" target="_blank" rel="noopener">${esc(l.title)}</a></p>`)
      .join('') || '<a href="#/links">Все ссылки группы</a>',
  )}</div>`;
}
async function ai(subject, linkOnly, button) {
  const status = document.querySelector('[data-ai-status]');
  const files = await json('./data/student-subjects.json'),
    record = files[subject];
  if (!record) throw new Error('Выгрузка предмета не найдена');
  const url = new URL(record.ai, location.href);
  if (linkOnly) {
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = 'Ссылка на текст предмета скопирована';
    } catch {
      status.textContent = url.href;
    }
  } else {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Выгрузка пока недоступна');
    download(await r.text(), `${subject}.md`, 'text/markdown');
    status.textContent = 'Текст предмета скачан';
  }
  button.disabled = false;
}
async function reviewPage(node, subject) {
  node.innerHTML = '<h1>Подготовка к контрольной</h1><p role="status">Собираем вопросы предмета…</p>';
  const tree = await loadTree(),
    files = tree.filter((e) => e.type === 'blob' && e.path.startsWith(`Конспекты/${subject}/`) && /\.md$/i.test(e.path));
  const questions = [],
    failed = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < files.length) {
        const file = files[next++];
        try {
          const response = await fetch(rawUrl(file.path));
          if (!response.ok) throw new Error();
          const text = await response.text(),
            page = quizPageSource(text);
          const blocks = page !== null ? [page] : [...text.matchAll(/```(?:quiz|test)\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
          for (const block of blocks)
            for (const q of parseQuiz(block).questions) questions.push({ ...q, path: file.path, id: `${file.path}\n${q.q}` });
        } catch {
          failed.push(file.path);
        }
      }
    }),
  );
  if (!node.isConnected) return;
  const mistakes = read('m3102-review-v1', {});
  let order = [],
    index = 0,
    correct = 0;
  const intro = () => {
    node.innerHTML = `<h1>Подготовка: ${esc(subject.replace(/_/g, ' '))}</h1><p>Вопросов: ${questions.length}. Сохранённых ошибок: ${questions.filter((q) => mistakes[q.id]).length}. Вопросы перемешиваются, результаты видны только вам.</p>${failed.length ? `<p role="alert">Не удалось прочитать файлов: ${failed.length}. Вопросы из них не включены.</p><button class="btn2" data-review-reload>Повторить загрузку</button>` : ''}<div class="student-actions"><button class="btn2" data-review-all ${questions.length ? '' : 'disabled'}>Перемешать все вопросы</button><button class="btn2" data-review-wrong ${questions.some((q) => mistakes[q.id]) ? '' : 'disabled'}>Повторить сохранённые ошибки</button><a class="btn2" href="#/subject/${encodeURIComponent(subject)}">К предмету</a></div>`;
    node.querySelector('[data-review-all]').onclick = () => start(questions);
    node.querySelector('[data-review-wrong]').onclick = () => start(questions.filter((q) => mistakes[q.id]));
    node.querySelector('[data-review-reload]')?.addEventListener('click', () => reviewPage(node, subject).catch((e) => errors(node, e)));
  };
  const start = (list) => {
    order = shuffled(list);
    index = 0;
    correct = 0;
    show();
  };
  const show = () => {
    if (index >= order.length) {
      node.innerHTML = `<h1>Результат: ${correct} из ${order.length}</h1><p>Ошибки сохранены. Можно вернуться к ним позже.</p><button class="btn2" data-review-back>Выбрать повторение</button>`;
      node.querySelector('button').onclick = intro;
      return;
    }
    const q = order[index];
    node.innerHTML = `<h1>Вопрос ${index + 1} из ${order.length}</h1><article class="dash-panel"><div class="prose student-question">${context.renderNotes(q.q, q.path)}</div><form>${q.type === 'text' ? '<label class="sched-field">Ответ<input name="answer" required autocomplete="off"></label>' : q.options.map((o, i) => `<label class="student-answer"><input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" name="answer" value="${i}"><span class="prose">${context.renderNotes(o.t, q.path)}</span></label>`).join('')}<button class="btn2 btn-primary">Проверить</button></form><div data-feedback role="status"></div><a href="${esc(fileHref(q.path))}">Объяснение в конспекте: ${esc(nice(q.path))}</a></article>`;
    context.runNoteExtras(node);
    node.querySelector('form').onsubmit = (event) => {
      event.preventDefault();
      const form = event.target,
        selected = new FormData(form).getAll('answer'),
        norm = (v) => v.trim().toLowerCase().replace(/ё/g, 'е');
      const ok =
        q.type === 'text'
          ? q.answers.some((a) => norm(a) === norm(String(selected[0] || '')))
          : q.options.every((o, i) => o.ok === selected.includes(String(i)));
      if (ok) {
        correct++;
        delete mistakes[q.id];
      } else mistakes[q.id] = { path: q.path, question: q.q, at: new Date().toISOString() };
      const saved = save('m3102-review-v1', mistakes);
      form.querySelectorAll('input,button').forEach((e) => {
        e.disabled = true;
      });
      const feedback = node.querySelector('[data-feedback]');
      feedback.innerHTML = `<p><strong>${ok ? 'Верно' : 'Нужно повторить'}</strong></p>${
        !ok
          ? `<p>Правильный ответ: ${esc(
              q.type === 'text'
                ? q.answers.join(' / ')
                : q.options
                    .filter((o) => o.ok)
                    .map((o) => o.t)
                    .join('; '),
            )}</p>`
          : ''
      }<div class="prose">${context.renderNotes((ok ? q.correct || q.explain : q.wrong || q.explain) || '', q.path)}</div>${saved ? '' : '<p>Не удалось сохранить результат: проверьте свободное место.</p>'}<button class="btn2" data-review-next>Далее</button>`;
      context.runNoteExtras(feedback);
      feedback.querySelector('button').onclick = () => {
        index++;
        show();
      };
    };
  };
  intro();
}
async function folderTopics() {
  const cards = [...document.querySelectorAll('[data-nav]')].filter((e) => /Лекция|Практика/.test(e.dataset.nav) && !e.dataset.studentTopic);
  if (!cards.length) return;
  const index = await json('./data/lectures.json');
  for (const card of cards) {
    if (!card.isConnected) continue;
    const lecture = index.subjects?.flatMap((s) => s.lectures).find((l) => l.path === card.dataset.nav);
    if (!lecture) continue;
    const topics = [...new Set(lecture.files.flatMap((f) => f.headings || []).filter((h) => !/^(лекци[яи]|практика|содержание)/i.test(h)))].slice(
      0,
      3,
    );
    if (topics.length) {
      const desc = card.querySelector('.desc');
      if (desc) desc.textContent = topics.join(' · ');
      card.dataset.studentTopic = '1';
    }
  }
}
export function renderStudentRoute(mode, path) {
  cleanup();
  cleanup = () => {};
  const hash = location.hash.slice(2),
    slash = hash.indexOf('/'),
    name = slash < 0 ? hash : hash.slice(0, slash);
  const custom = ['subjects', 'subject', 'bookmarks', 'audio', 'review', 'week', 'month'];
  if (mode === 'hw-deadlines') {
    location.replace(`#/${read('m3102-last-work-tab-v1', 'homework') === 'deadlines' ? 'deadlines' : 'homework'}`);
    return true;
  }
  if (!custom.includes(name)) return false;
  const node = host(),
    page = document.createElement('section');
  page.className = 'student-page';
  node.replaceChildren(page);
  page.innerHTML = '<p role="status">Загрузка…</p>';
  const arg = slash < 0 ? '' : decodeURIComponent(hash.slice(slash + 1));
  if (name === 'bookmarks') {
    bookmarksPage(page);
    return true;
  }
  const task =
    name === 'subjects' || name === 'subject'
      ? subjectsPage(page, arg)
      : name === 'review'
        ? reviewPage(page, arg)
        : name === 'audio'
          ? loadTree()
              .then((tree) => page.isConnected && audioPage(page, arg, tree))
              .then((fn) => {
                if (typeof fn === 'function') {
                  if (page.isConnected) cleanup = fn;
                  else fn();
                }
              })
          : overview(page, name, parseDate(arg) || new Date());
  Promise.resolve(task).catch((error) => errors(page, error));
  return true;
}
export function decorateStudentPage({ mode, path }) {
  tabs(mode);
  settings();
  home();
  scheduleLinks();
  compactQuickActions();
  if (mode === 'note' || mode === 'view') {
    const dispose = decorateReader(path);
    if (dispose) cleanup = dispose;
  }
  folderTopics().catch(() => {});
  const title = document.querySelector('.deadline-panel h2');
  if (title) title.textContent = 'Скоро сдавать';
  if (mode === 'deadlines') {
    const grid = document.querySelector('.dl-grid');
    if (grid && !grid.dataset.studentGrouped) {
      grid.dataset.studentGrouped = '1';
      for (const [label, states] of [
        ['Скоро сдавать', ['urgent', 'soon', 'ok']],
        ['Остались долги', ['late']],
        ['Архив и выполненные для меня', ['done']],
      ]) {
        const cards = [...grid.querySelectorAll('.dl-card')].filter((e) => states.includes(e.dataset.state));
        if (!cards.length) continue;
        const section = document.createElement(label.startsWith('Архив') ? 'details' : 'section');
        section.className = 'student-deadline-group';
        section.innerHTML = label.startsWith('Архив') ? `<summary>${label} · ${cards.length}</summary>` : `<h2>${label}</h2>`;
        section.append(...cards);
        grid.append(section);
      }
    }
    if (!document.querySelector('[data-queue-identity]'))
      document.querySelector('.dl-page .intro')?.insertAdjacentHTML('afterend', `<div data-queue-identity>${identityMarkup()}</div>`);
  }
  if (mode === 'memes') {
    document.querySelectorAll('.meme-card').forEach((card) => {
      if (card.dataset.studentMeme) return;
      card.dataset.studentMeme = '1';
      card.querySelector('.meme-img')?.setAttribute('role', 'button');
      card.querySelector('.meme-img')?.setAttribute('tabindex', '0');
      const link = document.createElement('a');
      link.className = 'btn2';
      link.href = `#/memes?meme=${encodeURIComponent(card.dataset.meme)}`;
      link.textContent = 'Ссылка на мем';
      card.append(link);
    });
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('meme');
    if (id && !document.querySelector('.student-dialog')) {
      const card = [...document.querySelectorAll('.meme-card')].find((e) => e.dataset.meme === id);
      if (card && !card.dataset.studentOpened) {
        card.dataset.studentOpened = '1';
        memeDialog(card);
      }
    }
  }
  const deal = document.querySelector('#bj-deal');
  if (deal) {
    const berries = read('hh_save_v1', {}).berries || 0,
      bet = read('m3102-slots-v1', {}).bet || 5;
    let hint = document.querySelector('#student-berries');
    if (deal.disabled && berries < bet) {
      if (!hint) {
        hint = document.createElement('p');
        hint.id = 'student-berries';
        deal.parentElement.after(hint);
      }
      const text = `Для раздачи нужно ${bet} ягод, у вас ${berries}. `;
      if (!hint.textContent.startsWith(text))
        hint.innerHTML = `${esc(text)}<a href="#/hedgehog">Получить ягоды в игре с ёжиком</a> · <a href="#/collection/daily">Ежедневная награда</a>`;
    } else hint?.remove();
  }
  refreshFreshness();
}
function refreshFreshness() {
  let node = document.getElementById('student-freshness');
  if (!node) {
    node = document.createElement('aside');
    node.id = 'student-freshness';
    node.className = 'student-freshness';
    node.setAttribute('aria-label', 'Свежесть данных');
    document.querySelector('main')?.after(node);
    if (!node.isConnected) document.body.append(node);
  }
  const markup = `${freshnessMarkup()}<button class="btn2" data-student-retry>Повторить обновление</button>`;
  if (node.innerHTML !== markup) node.innerHTML = markup;
}
export function installStudentTools(options) {
  context = options;
  installOffline();
  const schedule = () => {
    queued = false;
    const { mode, path } = context.parseHash();
    decorateStudentPage({ mode, path });
  };
  observer = new MutationObserver(() => {
    if (!queued) {
      queued = true;
      setTimeout(schedule, 80);
    }
  });
  observer.observe(host(), { childList: true, subtree: true });
  document.addEventListener('student:freshness', refreshFreshness);
  document.addEventListener('schedule:ready', (event) => {
    const result = event.detail,
      cachedAt = read('m3102-data-dates-v1', {}).schedule;
    const at = result.stale ? cachedAt : new Date().toISOString();
    if (!result.stale) save('m3102-data-dates-v1', { ...read('m3102-data-dates-v1'), schedule: at });
    if (result.stale) markFresh('Расписание', at, true);
    nextClass();
  });
  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (target.closest('[data-student-retry]')) {
      location.reload();
      return;
    }
    if (target.closest('[data-home-config]')) homeConfig();
    if (target.closest('[data-backup-choose]')) document.querySelector('[data-backup-import]')?.click();
    if (target.closest('[data-calendar]')) calendarDialog();
    if (target.closest('[data-backup-export]')) {
      try {
        download(JSON.stringify(exportPersonal(localStorage), null, 2), `m3102-progress-${dateKey(new Date())}.json`);
      } catch {
        document.querySelector('[data-backup-status]').textContent = 'Браузер запретил доступ к личным данным.';
      }
    }
    const aiButton = target.closest('[data-ai-download],[data-ai-link]');
    if (aiButton) {
      aiButton.disabled = true;
      try {
        await ai(aiButton.dataset.aiDownload || aiButton.dataset.aiLink, Boolean(aiButton.dataset.aiLink), aiButton);
      } catch (error) {
        document.querySelector('[data-ai-status]').textContent = error.message;
      } finally {
        aiButton.disabled = false;
      }
    }
  });
  // Intercept image/figcaption clicks before the original non-keyboard lightbox.
  document.addEventListener(
    'click',
    (event) => {
      const card = event.target.closest('.meme-card');
      if (card && !event.target.closest('a,button')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        memeDialog(card);
      }
    },
    true,
  );
  document.addEventListener('keydown', (event) => {
    if (['Enter', ' '].includes(event.key) && event.target.matches('.meme-img')) {
      event.preventDefault();
      memeDialog(event.target.closest('.meme-card'));
    }
  });
  document.addEventListener('change', async (event) => {
    if (event.target.matches('[data-backup-import]'))
      document.querySelector('[data-backup-filename]').textContent = event.target.files?.[0]?.name || '';
    if (event.target.matches('[data-student-me]')) {
      if (!save('m3102-student-v1', { login: event.target.value })) return;
      location.reload();
    }
    if (event.target.matches('[data-backup-import]')) {
      const file = event.target.files[0],
        status = document.querySelector('[data-backup-status]');
      if (!file) return;
      try {
        if (file.size > 20 * 1048576) throw new Error('Резервная копия слишком большая.');
        const backup = parsePersonal(await file.text());
        const dialog = showDialog(
          'Восстановить личный прогресс?',
          `<p>Копия от ${esc(stamp(backup.exportedAt))}. Текущие личные данные будут заменены. Сначала можно скачать текущую копию.</p><div class="student-actions"><button class="btn2" data-before-export>Скачать текущую копию</button><button class="btn2 btn-primary" data-restore-confirm>Восстановить</button></div><p role="alert"></p>`,
        );
        dialog.querySelector('[data-before-export]').onclick = () =>
          download(JSON.stringify(exportPersonal(localStorage), null, 2), 'm3102-before-restore.json');
        dialog.querySelector('[data-restore-confirm]').onclick = () => {
          try {
            restorePersonal(localStorage, backup);
            location.reload();
          } catch (error) {
            dialog.querySelector('[role=alert]').textContent = error.message;
          }
        };
      } catch (error) {
        status.textContent = error.message;
      }
      event.target.value = '';
    }
  });
  setInterval(nextClass, 30000);
}
