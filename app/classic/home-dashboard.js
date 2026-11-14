import { subjectColorId } from './timetable-model.js';
import { esc, read, nice, fileHref, CONTENT, validTree } from './student-core.js';
import { json, loadTree, freshnessSnapshot, refreshSources } from './student-data.js';
import { ensureSchedule, getSchedule, reloadSchedule } from './schedule-ui.js';
import { lessonsOn, addDays, dateKey, weekParity, isVacation } from './schedule.js';
import { HOME_BLOCKS, campusNow, duration, normalizeRecent } from './home-preferences.js';
import { homeLayout, mountHomeSettings } from './home-setup.js';
import { plainMathText } from './student-text.js';
import { ic } from './icons.js';
export const emptyState = (title, text, href = '', label = '') =>
  `<div class="home-empty"><span aria-hidden="true">${ic(/занят|пар|расписан/i.test(title) ? 'calendar' : /очеред|работ|задан/i.test(title) ? 'tasks' : /план/i.test(title) ? 'pencil' : 'notes', 20)}</span><div><strong>${esc(title)}</strong><p>${esc(text)}</p>${href ? `<a href="${esc(href)}">${esc(label)}</a>` : ''}</div></div>`;
const setMarkup = (node, html) => {
  if (node && node.innerHTML !== html) node.innerHTML = html;
};
const relevantFreshness = () =>
  Object.fromEntries(
    Object.entries(freshnessSnapshot()).filter(
      ([name]) =>
        name !== 'Очереди' ||
        (Boolean(read('m3102-student-v1').login) &&
          (!document.querySelector('.dashboard-grid') || homeLayout().visible.includes('student-queues-panel'))),
    ),
  );
let disposeMascot = () => {},
  mascotHost,
  tick,
  refreshBusy = false,
  queueRefresh = async () => {},
  homeRefresh = async () => {},
  notesFlight;
const kind = (lesson) => ({ lecture: 'Лекция', practice: 'Практика', lab: 'Лабораторная', other: 'Занятие' })[lesson.kind] || 'Занятие';
const instant = (date, time) => new Date(`${dateKey(date)}T${time}:00+03:00`);
export function updateHomeTime() {
  const node = document.querySelector('#student-next');
  if (!node) return;
  const schedule = getSchedule(),
    now = campusNow(),
    realNow = new Date();
  if (!schedule) return;
  const date = document.querySelector('.hero-date strong'),
    parity = document.querySelector('.hero-week');
  if (date) date.textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  if (parity)
    parity.textContent = `${isVacation(now, schedule) ? 'Каникулы' : weekParity(now, schedule) === 'even' ? 'Чётная неделя' : 'Нечётная неделя'} · Москва`;
  let found;
  for (let offset = 0; offset < 30 && !found; offset++) {
    const date = addDays(now, offset);
    for (const lesson of [...lessonsOn(date, schedule)].filter((l) => !l.break).sort((a, b) => a.start.localeCompare(b.start))) {
      const start = instant(date, lesson.start),
        end = instant(date, lesson.end);
      if (end > realNow) {
        found = { lesson, date, start, end, offset };
        break;
      }
    }
  }
  const stale = freshnessSnapshot()['Расписание'];
  const warning = stale?.saved || stale?.error ? '<p class="home-cache">Сохранённое расписание. Проверить свежесть можно внизу страницы.</p>' : '';
  if (!found) {
    delete node.dataset.lesson;
    setMarkup(
      node,
      emptyState('В ближайшие 30 дней занятий нет', 'Выберите другой день в расписании.', '#/schedule', 'Открыть расписание') + warning,
    );
  } else {
    const { lesson, date, start, end, offset } = found,
      ongoing = start <= realNow,
      minutes = Math.max(1, Math.ceil(((ongoing ? end : start) - realNow) / 60000));
    const subject = read('m3102-home-subjects', []).find((s) => s.replaceAll('_', ' ').toLowerCase() === lesson.subject.toLowerCase());
    const html = `<div class="lesson-summary" data-ongoing="${ongoing}"><div class="lesson-clock"><span class="lesson-status">${ongoing ? 'Идёт сейчас' : 'Следующая пара'}</span><strong data-lesson-start>${esc(lesson.start)}</strong><span class="lesson-interval">До ${esc(lesson.end)}</span></div><div class="lesson-description"><p class="lesson-day">${offset === 0 ? 'Сегодня' : offset === 1 ? 'Завтра' : esc(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }))} <span class="lesson-chip">${!ongoing && offset > 1 ? `Через ${offset} ${offset < 5 ? 'дня' : 'дней'}` : `${ongoing ? 'Осталось' : 'Через'} ${duration(minutes)}`}</span></p><h3 data-subject-color="${subjectColorId(lesson.subject)}">${esc(lesson.subject)}</h3><p data-lesson-kind>${kind(lesson)} · <strong class="lesson-room">${lesson.room ? 'Ауд. ' + esc(lesson.room) : 'Аудитория уточняется'}</strong></p><p class="lesson-secondary">${esc([lesson.teacher, lesson.location || schedule.defaultLocation].filter(Boolean).join(' · '))}</p><div class="student-actions"><a class="btn2 btn-primary" href="#/schedule/${dateKey(date)}">Открыть день</a>${subject ? `<a class="btn2" href="#/subject/${encodeURIComponent(subject)}">Материалы по предмету</a>` : ''}</div></div></div>${warning}`;
    // У существующих действий не теряем фокус при ежеминутном изменении времени.
    if (node.dataset.lesson === lesson.id + dateKey(date) && node.querySelector('.lesson-summary')) {
      const next = document.createElement('div');
      next.innerHTML = html;
      node.querySelector('.lesson-summary').dataset.ongoing = String(ongoing);
      for (const sel of [
        '.lesson-status',
        '[data-lesson-start]',
        '.lesson-interval',
        '.lesson-day',
        'h3',
        '[data-lesson-kind]',
        '.lesson-secondary',
      ]) {
        const a = node.querySelector(sel),
          b = next.querySelector(sel);
        if (a && b && a.innerHTML !== b.innerHTML) {
          a.innerHTML = b.innerHTML;
          if (b.hasAttribute('data-subject-color')) a.dataset.subjectColor = b.dataset.subjectColor;
        }
      }
      // Действия с прежним href сохраняют сам DOM-узел, следовательно и фокус.
      const actions = node.querySelector('.student-actions');
      const wanted = [...next.querySelectorAll('.student-actions a')];
      for (const [index, link] of wanted.entries()) {
        const old = [...actions.querySelectorAll('a')].find((a) => a.getAttribute('href') === link.getAttribute('href'));
        if (!old || actions.children[index] !== old) actions.insertBefore(old || link, actions.children[index] || null);
      }
      for (const link of [...actions.querySelectorAll('a')])
        if (!wanted.some((a) => a.getAttribute('href') === link.getAttribute('href'))) link.remove();
      const old = node.querySelector('.home-cache');
      if (warning && !old) node.insertAdjacentHTML('beforeend', warning);
      if (!warning) old?.remove();
    } else {
      setMarkup(node, html);
      node.dataset.lesson = lesson.id + dateKey(date);
    }
  }
  const today = document.getElementById('home-today');
  const lessons = lessonsOn(now, schedule);
  setMarkup(
    today,
    lessons.length
      ? `<div class="home-today-list">${lessons
          .map((l) => {
            const end = instant(now, l.end),
              start = instant(now, l.start);
            return `<div data-subject-color="${subjectColorId(l.subject)}" class="home-today-row${l.break ? ' is-break' : ''}"><span class="lesson-interval">${esc(l.start)}–${esc(l.end)}</span><div><strong>${esc(l.break ? 'Перерыв' : l.subject)}</strong>${l.break ? '' : `<p>${kind(l)} · Ауд. ${esc(l.room || 'уточняется')}</p><small>${end <= realNow ? 'Завершено' : start <= realNow ? 'Идёт сейчас' : 'Предстоит'}</small>`}</div></div>`;
          })
          .join('')}</div>${warning}`
      : emptyState(
          'Сегодня без занятий',
          found
            ? `Следующая пара: ${found.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${found.lesson.start}.`
            : 'Можно выбрать день в расписании.',
          '#/schedule',
          'Открыть расписание',
        ) + warning,
  );
}
export function applyHomeLayout() {
  const grid = document.querySelector('.dashboard-grid');
  if (!grid) return;
  const layout = homeLayout();
  for (const id of layout.order) {
    const node = grid.querySelector(`[data-home-block="${id}"]`);
    if (!node) continue;
    node.hidden = !layout.visible.includes(id);
    grid.append(node);
  }
  let none = grid.querySelector('[data-home-none]');
  if (!none) {
    none = document.createElement('p');
    none.dataset.homeNone = '';
    none.innerHTML = 'Главная настроена без блоков. <button class="btn2" data-home-config>Настроить главную</button>';
    grid.append(none);
  }
  none.hidden = layout.visible.length !== 0;
}
export function mountHome() {
  mountHomeSettings();
  const grid = document.querySelector('.dashboard-grid');
  if (!grid || grid.dataset.homeMounted) return;
  grid.dataset.homeMounted = 'true';
  grid.insertAdjacentHTML(
    'afterbegin',
    '<section class="dash-panel student-next-panel"><div id="student-next" role="region" aria-label="Следующая пара"><p class="home-loading" role="status">Загружаем расписание…</p></div></section><section class="dash-panel student-queues-panel"><div class="panel-head"><h2>Мои очереди</h2><a href="#/deadlines">Дедлайны</a></div><div id="student-my-queues"></div></section>',
  );
  document
    .querySelector('.home-hero .hero-inner > div')
    .insertAdjacentHTML(
      'beforeend',
      '<nav id="student-home-tools" class="student-actions student-quick-actions" aria-label="Настройка главной"><button class="btn2" data-home-config>Настроить главную</button></nav>',
    );
  for (const b of HOME_BLOCKS) {
    const node = grid.querySelector('.' + b.id);
    if (node) node.dataset.homeBlock = b.id;
  }
  const today = grid.querySelector('.schedule-panel');
  today.querySelector('.today-list,.empty-line')?.remove();
  today.insertAdjacentHTML('beforeend', '<div id="home-today"><p class="home-loading" role="status">Загружаем занятия…</p></div>');
  applyHomeLayout();
  ensureSchedule()
    .then(updateHomeTime)
    .catch(() => {
      setMarkup(document.querySelector('#student-next'), emptyState('Расписание недоступно', 'Проверьте соединение и повторите обновление.'));
      setMarkup(document.querySelector('#home-today'), emptyState('Не удалось загрузить занятия', 'Данные ещё не получены.'));
    });
  document.querySelector('.home-hero .sub').textContent = 'Всё важное для группы М3102 в одном месте.';
  const hero = document.querySelector('.home-hero');
  hero.querySelector('.hero-hedgehog')?.remove();
  hero.querySelector('.hero-orbit')?.remove();
  hero.insertAdjacentHTML(
    'beforeend',
    '<div class="home-terrain"><svg viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 59 Q125 39 250 59 T500 59 T750 59 T1000 59 V80 H0Z"/></svg><div class="hog-travel"><div class="hog-height"><div class="hog-facing"><img src="./img/home-hog.svg" alt="" aria-hidden="true"><canvas width="128" height="128" aria-hidden="true"></canvas></div></div></div></div><button class="btn2 home-motion" aria-label="Приостановить анимацию ёжика" aria-pressed="false">Ⅱ</button>',
  );
  mascotHost = hero;
  // Некритичный рисунок подгружается после расписания; статичный SVG остаётся при ошибке.
  import('./home-mascot.js')
    .then(({ mountMascot }) => {
      if (hero.isConnected && mascotHost === hero) disposeMascot = mountMascot(hero);
    })
    .catch(() => {});
  loadTree()
    .then((tree) => {
      const subjects = [...new Set(tree.filter((e) => e.path.startsWith('Конспекты/')).map((e) => e.path.split('/')[1]))];
      import('./student-core.js').then(({ remember }) => {
        remember('m3102-home-subjects', subjects);
        updateHomeTime();
      });
    })
    .catch(() => {});
}
export function leaveHome() {
  disposeMascot();
  disposeMascot = () => {};
  mascotHost = null;
}
export function loadRecentNotes() {
  if (notesFlight) return notesFlight;
  notesFlight = recentNotes().finally(() => {
    notesFlight = null;
  });
  return notesFlight;
}
async function recentNotes() {
  const box = document.getElementById('recent-notes');
  if (!box) return;
  const paint = async (index, cached = false, cachedTree) => {
    const tree = cachedTree || (await loadTree());
    if (!box.isConnected) return;
    const list = normalizeRecent(index.entries, tree).slice(0, 6);
    const h = box.closest('section').querySelector('h2');
    h.textContent = list.some((n) => n.date) ? 'Недавние конспекты' : 'Доступные конспекты';
    setMarkup(
      box,
      list.length
        ? `<div class="home-note-list">${list
            .map((n) => {
              const parts = n.path.split('/');
              return `<a class="home-note" href="${esc(fileHref(n.path))}"><span class="home-format" data-subject-color="${subjectColorId(n.path.split('/')[1])}">${/\.pdf$/i.test(n.path) ? 'PDF' : 'MD'}</span><span><strong>${esc(plainMathText(nice(n.path)))}</strong><small>${esc(parts[1].replaceAll('_', ' '))} · ${esc(parts.slice(2, -1).join(' / ').replaceAll('_', ' '))}</small>${n.date ? `<small>${n.change === 'added' ? 'Добавлено' : 'Обновлено'} ${new Date(n.date).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', year: 'numeric' })}</small>` : ''}</span>${ic('arrowUpRight', 18)}</a>`;
            })
            .join('')}</div>${cached ? '<p class="home-cache">Сохранённый список конспектов</p>' : ''}`
        : emptyState(
            'Новых конспектов пока нет',
            'Все доступные материалы остаются в библиотеке.',
            '#/' + encodeURIComponent('Конспекты'),
            'Все конспекты',
          ),
    );
  };
  try {
    const cache = await caches.open(CONTENT);
    const [hit, treeHit] = await Promise.all([
      cache.match(new URL('./data/recent-notes.json', location.href).href),
      cache.match(new URL('./data/tree.json', location.href).href),
    ]);
    if (hit) await paint(await hit.json(), true, treeHit ? validTree(await treeHit.json()) : undefined);
  } catch {}
  try {
    const index = await json('./data/recent-notes.json', 'Конспекты');
    if (!Array.isArray(index.entries)) throw new Error('Неверный индекс');
    await paint(index, Boolean(freshnessSnapshot()['Конспекты']?.saved));
  } catch {
    if (box.isConnected && !box.querySelector('a'))
      setMarkup(
        box,
        emptyState(
          'Список конспектов недоступен',
          'Повторите проверку обновлений или откройте библиотеку.',
          '#/' + encodeURIComponent('Конспекты'),
          'Все конспекты',
        ) + '<button class="btn2" data-student-retry>Повторить попытку</button>',
      );
  }
}
export function renderFreshness() {
  let node = document.getElementById('student-freshness');
  if (!node) {
    node = document.createElement('aside');
    node.id = 'student-freshness';
    node.className = 'home-freshness';
    node.setAttribute('aria-label', 'Свежесть данных');
    node.innerHTML = `<div class="home-freshness-row"><span data-data-summary></span><button class="btn2" data-data-details aria-expanded="false" aria-controls="home-source-details">Подробнее</button><button class="btn2 home-refresh" data-student-retry aria-label="Проверить обновления">${ic('refresh', 20)}</button></div><div id="home-source-details" hidden></div><p role="status" aria-live="polite" data-refresh-message></p>`;
    document.querySelector('.wrap footer')?.before(node);
    if (!node.isConnected) document.body.append(node);
  }
  const entries = Object.entries(freshnessSnapshot()).filter(([k, v]) => v.at || v.error || (k !== 'Очереди' && k !== 'ДЗ'));
  const dates = Object.values(relevantFreshness())
    .map((v) => v.at)
    .filter(Boolean)
    .sort();
  const stale = Object.entries(relevantFreshness()).some(([, v]) => v.saved || v.error);
  node.querySelector('[data-data-summary]').textContent = dates.length
    ? `Проверено: ${new Date(dates[0]).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${stale ? ' · есть кеш' : ''}`
    : 'Данные загружаются';
  setMarkup(
    node.querySelector('#home-source-details'),
    entries
      .map(
        ([name, v]) =>
          `<p><strong>${esc(name)}</strong>: ${v.at ? esc(new Date(v.at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })) : 'ещё не получены'}${name === 'Очереди' && !relevantFreshness()[name] ? ' · не используется на этой странице' : v.error ? ' · ошибка проверки' : v.saved ? ' · сохранённые данные' : ' · проверено'}</p>`,
      )
      .join(''),
  );
}
export async function refreshHomeData() {
  if (refreshBusy) return;
  refreshBusy = true;
  renderFreshness();
  const button = document.querySelector('.home-refresh'),
    message = document.querySelector('[data-refresh-message]');
  button.setAttribute('aria-busy', 'true');
  button.setAttribute('aria-disabled', 'true');
  message.textContent = 'Проверяем обновления…';
  try {
    const results = await Promise.allSettled([
      reloadSchedule(),
      loadTree({ fresh: true }),
      loadRecentNotes(),
      refreshSources(),
      homeRefresh(),
      queueRefresh(),
    ]);
    updateHomeTime();
    const partial = results.some((r) => r.status === 'rejected') || Object.values(relevantFreshness()).some((s) => s.error || s.saved);
    message.textContent = !navigator.onLine
      ? 'Нет сети. Доступны сохранённые данные.'
      : partial
        ? 'Часть данных не удалось проверить. Последние успешные даты сохранены.'
        : 'Проверка завершена. Данные актуальны.';
  } finally {
    refreshBusy = false;
    button.removeAttribute('aria-disabled');
    button.removeAttribute('aria-busy');
    renderFreshness();
  }
}
export function installHomeDashboard(options) {
  queueRefresh = options.queues;
  homeRefresh = options.refresh;
  document.addEventListener('student:preferences', () => {
    applyHomeLayout();
    queueRefresh();
    const profile = document.querySelector('#home-settings-profile');
    if (profile)
      profile.querySelector('[data-profile-name]').textContent = read('m3102-student-v1').login
        ? `Вы: ${read('m3102-student-v1').login}`
        : 'Вы: гость';
  });
  document.addEventListener('schedule:ready', updateHomeTime);
  document.addEventListener('schedule:change', updateHomeTime);
  document.addEventListener('student:freshness', renderFreshness);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateHomeTime();
  });
  window.addEventListener('pageshow', updateHomeTime);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-data-details]');
    if (b) {
      const expanded = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!expanded));
      document.getElementById('home-source-details').hidden = expanded;
    }
  });
  tick = setInterval(updateHomeTime, 1000);
  window.addEventListener('pagehide', () => clearInterval(tick));
  window.addEventListener('pageshow', () => {
    clearInterval(tick);
    tick = setInterval(updateHomeTime, 1000);
  });
}
