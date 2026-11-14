import { esc } from './student-core.js';
import { ensureSchedule, getSchedule } from './schedule-ui.js';
import { lessonsOn, dateKey, addDays, mondayOf, parseDate, weekParity } from './schedule.js';
import { campusNow } from './home-preferences.js';
import { freshnessSnapshot } from './student-data.js';
import { monthDates, subjectColorId, lessonKind } from './timetable-model.js';
import { ic } from './icons.js';
const title = (date) => date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const time = (date, value) => new Date(`${dateKey(date)}T${value}:00+03:00`);
const shortDate = (date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
function lessonRow(lesson, date, details = false) {
  if (lesson.break) return `<li class="timetable-break"><span>${esc(lesson.start)}–${esc(lesson.end)}</span> Перерыв</li>`;
  const now = new Date(),
    state =
      dateKey(date) === dateKey(campusNow())
        ? time(date, lesson.end) <= now
          ? 'Завершено'
          : time(date, lesson.start) <= now
            ? 'Идёт сейчас'
            : ''
        : '';
  return `<li class="timetable-lesson" data-subject-color="${subjectColorId(lesson.subject)}"><div class="timetable-time"><strong>${esc(lesson.start)}</strong><small>${esc(lesson.end)}</small></div><div><strong class="timetable-subject">${esc(lesson.subject)}</strong><p><span>${lessonKind(lesson.kind)}</span> · <b>${lesson.room ? 'Ауд. ' + esc(lesson.room) : 'Аудитория уточняется'}</b></p>${details && lesson.teacher ? `<small>${esc(lesson.teacher)}</small>` : ''}${state ? `<small class="timetable-state" ${state === 'Идёт сейчас' ? 'data-current' : ''}>${state}</small>` : ''}</div></li>`;
}
export async function overview(node, mode, date) {
  await ensureSchedule();
  if (!node.isConnected) return () => {};
  const month = mode === 'month',
    today = campusNow();
  const remembered = new URLSearchParams(location.hash.split('?')[1] || '').get('day');
  let selected = remembered && monthDates(date).some((day) => dateKey(day) === remembered) ? remembered : dateKey(date);
  node.classList.add('timetable-page');
  const dayDetails = (schedule) => {
    const day = parseDate(selected),
      entries = lessonsOn(day, schedule);
    return `<div class="panel-head"><h2>${esc(title(day))}</h2><a class="btn2 btn-quiet" href="#/schedule/${selected}">Открыть день ${ic('arrowRight', 18)}</a></div><ul class="timetable-lessons">${entries.map((l) => lessonRow(l, day, true)).join('') || '<li class="timetable-free">Занятий нет. Можно выбрать другой день.</li>'}</ul>`;
  };
  function draw() {
    if (!node.isConnected) return;
    const schedule = getSchedule(),
      start = mondayOf(date),
      end = addDays(start, 6);
    const stale = freshnessSnapshot()['Расписание'];
    const dates = month ? monthDates(date) : Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const caption = month ? date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : `${shortDate(start)} – ${shortDate(end)}`;
    node.innerHTML = `<div class="intro"><h1>Расписание</h1><p class="sub">${weekParity(date, schedule) === 'even' ? 'Чётная' : 'Нечётная'} неделя · Время Москвы</p></div><div class="timetable-toolbar"><nav class="student-actions" aria-label="Вид расписания"><a class="btn2" href="#/schedule/${selected}">День</a><a class="btn2" href="#/week/${selected}" ${!month ? 'aria-current="page"' : ''}>Неделя</a><a class="btn2" href="#/month/${selected}" ${month ? 'aria-current="page"' : ''}>Месяц</a></nav><button class="btn2 btn-quiet" data-calendar>${ic('calendar', 18)} Подписка на календарь</button></div><div class="timetable-period"><div class="student-actions"><button class="btn2 btn-icon" data-overview-prev aria-label="Предыдущий период">${ic('arrowLeft', 18)}</button><h2>${esc(caption)}</h2><button class="btn2 btn-icon" data-overview-next aria-label="Следующий период">${ic('arrowRight', 18)}</button></div><a class="btn2" href="#/${mode}/${dateKey(today)}">Сегодня</a></div>${stale?.saved || stale?.error ? '<p class="home-cache" role="status">Сохранённое расписание. Проверить свежесть можно внизу страницы.</p>' : ''}${
      month
        ? `<div class="month-sheet" role="group" aria-label="Календарь ${esc(caption)}"><div class="month-weekdays" aria-hidden="true">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<span>${d}</span>`).join('')}</div><div class="student-calendar is-month">${dates
            .map((day) => {
              const key = dateKey(day),
                lessons = lessonsOn(day, schedule).filter((l) => !l.break);
              return `<article class="month-cell${day.getMonth() !== date.getMonth() ? ' outside-month' : ''}" data-date="${key}"><button type="button" class="month-day" data-month-day="${key}" aria-pressed="${key === selected}" tabindex="${key === selected ? 0 : -1}" aria-label="${esc(title(day))}, ${lessons.length} занятий" ${key === dateKey(today) ? 'aria-current="date"' : ''}><span class="month-number">${day.getDate()}</span><span class="month-count">${lessons.length ? lessons.length + ' зан.' : ''}</span><span class="month-marks" aria-hidden="true">${lessons.map((l) => `<i data-subject-color="${subjectColorId(l.subject)}"></i>`).join('')}</span></button><ul class="month-previews">${lessons
                .slice(0, 3)
                .map(
                  (l) =>
                    `<li data-subject-color="${subjectColorId(l.subject)}"><a href="#/schedule/${key}" title="${esc(l.start + ' · ' + l.subject + ' · ' + lessonKind(l.kind) + ' · Ауд. ' + (l.room || '?'))}"><time>${esc(l.start)}</time> ${esc(l.subject)}</a></li>`,
                )
                .join('')}${lessons.length > 3 ? `<li><a href="#/schedule/${key}">Ещё ${lessons.length - 3}</a></li>` : ''}</ul></article>`;
            })
            .join(
              '',
            )}</div></div><p class="month-help">Выберите дату, чтобы увидеть все пары и аудитории.</p><section class="dash-panel month-agenda" aria-label="Занятия выбранного дня" aria-live="polite">${dayDetails(schedule)}</section>`
        : `<div class="student-calendar week-board">${dates
            .map((day) => {
              const key = dateKey(day),
                entries = lessonsOn(day, schedule),
                real = entries.filter((l) => !l.break);
              return `<article class="dash-panel week-day${key === dateKey(today) ? ' student-today' : ''}"><div class="panel-head"><h2><a href="#/schedule/${key}" ${key === dateKey(today) ? 'aria-current="date"' : ''}>${esc(title(day))}</a></h2><span class="week-day-count">${real.length ? real.length + ' зан.' : 'Свободно'}</span></div><ul class="timetable-lessons">${entries.map((l) => lessonRow(l, day)).join('') || '<li class="timetable-free">Без занятий</li>'}</ul><a class="btn2 btn-quiet" href="#/schedule/${key}">Открыть день ${ic('arrowRight', 18)}</a></article>`;
            })
            .join('')}</div>`
    }`;
    node.querySelector('[data-overview-prev]').onclick = () => {
      location.hash = `#/${mode}/${dateKey(month ? new Date(date.getFullYear(), date.getMonth() - 1, 1) : addDays(date, -7))}`;
    };
    node.querySelector('[data-overview-next]').onclick = () => {
      location.hash = `#/${mode}/${dateKey(month ? new Date(date.getFullYear(), date.getMonth() + 1, 1) : addDays(date, 7))}`;
    };
    if (month) {
      const select = (key) => {
        selected = key;
        node.querySelectorAll('[data-month-day]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.monthDay === key));
          b.tabIndex = b.dataset.monthDay === key ? 0 : -1;
        });
        node.querySelector('.month-agenda').innerHTML = dayDetails(schedule);
        // Выбранный день остаётся в адресе, при этом текущий лист не меняется от нажатия соседнего месяца.
        history.replaceState(null, '', `#/month/${dateKey(date)}?day=${key}`);
      };
      node.querySelectorAll('[data-month-day]').forEach((button) => {
        button.onclick = () => select(button.dataset.monthDay);
        button.onkeydown = (e) => {
          const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          if (delta === undefined && !['Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const current = parseDate(button.dataset.monthDay),
            weekday = (current.getDay() + 6) % 7;
          const next = dateKey(addDays(current, delta ?? (e.key === 'Home' ? -weekday : 6 - weekday)));
          const target = node.querySelector(`[data-month-day="${next}"]`);
          if (target) {
            select(next);
            target.focus();
          }
        };
      });
    }
  }
  // Позднее обновление данных перерисовывает обзор. Периодические тики не заменяют фокус.
  draw();
  const update = () => draw();
  document.addEventListener('schedule:ready', update);
  document.addEventListener('schedule:change', update);
  return () => {
    document.removeEventListener('schedule:ready', update);
    document.removeEventListener('schedule:change', update);
  };
}
