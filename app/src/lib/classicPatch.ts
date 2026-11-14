import { CLASSIC_LIGHT_THEME } from './classicLightTheme';

/**
 * Правки в index.html классического сайта группы при сборке сайта (scripts/assemble-classic.ts): сам его файл в корне
 * репозитория не меняем, все отличия — только в собранной копии. Что и зачем:
 *  - манифест убираем: «установить как приложение» остаётся за приложением (/app/). Его service worker, наоборот,
 *    оставляем: он даёт классическому сайту офлайн-режим и не мешает приложению (у приложения свой воркер на /app/,
 *    свои названия кешей, а страницы /app/ он не перехватывает, пока их ведёт воркер приложения);
 *  - список скрытых файлов его «Материалов» приводим к нижнему регистру: он сравнивает с `base.toLowerCase()`, поэтому
 *    записи «AGENTS.md» и «CLAUDE.md» никогда не совпадали и эти файлы показывались как материалы;
 *  - светлая тема: логотип, герой, фон, текст, статусы и код (classicLightTheme.ts). Встроенный CSS после его стилей
 *    попадает в тот же офлайн-кеш HTML; работает и при явном выборе темы, и по настройке устройства;
 *  - помечаем сторону (data-site-style) и подключаем общий переключатель стиля (switch/site-switch.js, лежит рядом) — в
 *    <head>, чтобы слой перехода появился до первой отрисовки.
 */
export function patchClassicIndex(html: string): string {
  if (!html.includes('</head>'))
    throw new Error('В index.html классического сайта группы нет </head> — разметка изменилась, нужно поправить patchClassicIndex.');
  let patched = html
    .replace(/<link[^>]+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Noto[^"]+"[^>]*>/, '<link rel="stylesheet" href="./css/home-fonts.css">')
    .replace(/<link[^>]*rel=["']manifest["'][^>]*>\s*/g, '')
    .replace(/(HIDDEN_FILE_NAMES\s*=\s*\[)([^\]]*)(\])/, (_all, open: string, list: string, close: string) => open + list.toLowerCase() + close)
    .replace(/<html(\s|>)/, '<html data-site-style="classic"$1')
    .replace(
      '</head>',
      `    <style id="classic-light-theme">${CLASSIC_LIGHT_THEME}</style>\n    <link rel="stylesheet" href="./css/student-tools.css">\n    <link rel="stylesheet" href="./css/home-dashboard.css">\n    <script src="./switch/site-switch.js" charset="utf-8"></script>\n  </head>`,
    );
  // Small fixtures and upstream pages without our supported router only receive the appearance patch.
  if (!html.includes('function renderRoute()')) return patched;
  for (const panel of ['schedule-panel', 'deadline-panel', 'homework-panel', 'materials-panel', 'plan-panel', 'notes-panel']) {
    if (!html.includes(`dash-panel ${panel}`)) throw new Error(`Classic integration changed: home panel ${panel}`);
  }
  patched = replaceRequired(
    patched,
    '    import { dateKey,',
    "    import { installStudentTools, renderStudentRoute, decorateStudentPage, directoryResponse, renderHomeDeadlines } from './js/student-tools.js';\n    import { loadRecentNotes, updateHomeTime } from './js/home-dashboard.js';\n    import { queues, studentFetch } from './js/student-data.js';\n    import { groupArchived, read as readClassicPreference } from './js/student-core.js';\n    import { dateKey,",
  );
  patched = replaceRequired(
    patched,
    '    installScheduleEditor();',
    '    installStudentTools({ students: STUDENTS, parseHash, studentMatches, resolveQueueEntry, renderNotes, runNoteExtras, retryRoute: renderRoute, refreshHome: async () => { await Promise.all([loadHomeDeadlines(), reloadHomework()]); } });\n    installScheduleEditor();',
  );
  patched = replaceRequired(
    patched,
    'import { installHomework, renderHomeHomework, renderHomeworkPage }',
    'import { reloadHomework, installHomework, renderHomeHomework, renderHomeworkPage }',
  );
  patched = replaceRequired(patched, 'page.getViewport({scale:cw/vp0.width})', 'page.getViewport({scale:Math.min(900,2*cw)/vp0.width})');
  patched = replaceRequired(patched, '  updateActiveTab(mode,path);', '  updateActiveTab(mode,path);\n  if(renderStudentRoute(mode,path))return;');
  patched = replaceRequired(
    patched,
    '  decorateCasinoPage(); /* casino:step6 */',
    '  decorateCasinoPage(); /* casino:step6 */\n  decorateStudentPage({mode,path});',
  );
  patched = replaceRequired(patched, "if(h==='memes')", "if(h==='memes'||h.startsWith('memes?'))");
  patched = replaceRequired(patched, 'githubFetch(apiUrl(path))', 'directoryResponse(path)');
  patched = replaceRequired(patched, "'tests','inner'", "'output','node_modules','tests','inner'");
  patched = replaceRequired(
    patched,
    "intro+breadcrumbs(path)+'<p class=\"state\">Ошибка загрузки: '+esc(e.message)+'</p>'",
    'intro+breadcrumbs(path)+\'<p class="state">Ошибка загрузки: \'+esc(e.message)+\'</p><button class="btn2" data-student-retry>Повторить попытку</button>\'',
  );
  patched = replaceRequired(
    patched,
    '    function renderDeadlines(items){',
    '    function renderDeadlines(items){ renderHomeDeadlines(items); return;',
  );
  patched = replaceRequired(
    patched,
    '    async function loadDeadlineQueues(){',
    '    async function loadDeadlineQueues(){ return queues(STUDENTS,{matches:studentMatches,resolve:resolveQueueEntry});\n      /* Original resolver kept below for upstream compatibility. */',
  );
  patched = replaceRequired(patched, 'done=isDone(sub), info=', 'done=isDone(sub)||groupArchived(sub), info=');
  patched = replaceRequired(
    patched,
    '<li><span class="dl-pos">${idx + 1}</span>',
    '<li class="${item.login&&item.login.toLowerCase()===readStudentLogin()?\'student-is-me\':\'\'}"><span class="dl-pos">${idx + 1}</span>',
  );
  patched = replaceRequired(
    patched,
    '${esc(item.label)}</a>${item.outside',
    "${esc(item.label)}${item.login&&item.login.toLowerCase()===readStudentLogin()?' — это вы · №'+(idx+1):''}</a>${item.outside",
  );
  patched = replaceRequired(
    patched,
    '    const DEADLINES_QUEUE_LABEL=',
    "    function readStudentLogin(){return (readClassicPreference('m3102-student-v1',{}).login||'').toLowerCase();}\n    const DEADLINES_QUEUE_LABEL=",
  );
  patched = patched.replaceAll("fetch('./Дедлайны/deadlines.json'", "studentFetch('./Дедлайны/deadlines.json'");
  patched = replaceRequired(patched, 'deadlinesQueueError=true;deadlinesQueueCache={};', 'deadlinesQueueError=true;');
  patched = replaceRequired(
    patched,
    "if(!path)intro='<div",
    'if(!path)intro=\'<nav class="student-actions student-quick-actions" aria-label="Быстрые действия"><a class="btn2" href="#/subjects" aria-label="Все предметы" title="Все предметы">\'+ic(\'book\',18)+\'<span class="student-action-label">Предметы</span></a><a class="btn2" href="#/bookmarks" aria-label="Мои закладки" title="Мои закладки">\'+ic(\'notes\',18)+\'<span class="student-action-label">Закладки</span></a></nav><div',
  );
  patched = replaceRequired(
    patched,
    '            }else{\n              grid+=`<div class="card"',
    '            }else if([\'mp3\',\'wav\',\'m4a\',\'ogg\',\'opus\',\'flac\'].includes(e)){\n              grid+=`<a class="card" href="#/audio/${encodePath(it.path)}"><div class="ic">${ic(\'audio\',22)}</div><div class="meta"><div class="name">${title}</div><div class="desc">${fmtSize(it.size)} · слушать с сохранением позиции</div></div></a>`;\n            }else{\n              grid+=`<div class="card"',
  );
  const recentStart = patched.indexOf('    async function fetchRecentNotes(){');
  const recentEnd = patched.indexOf('    /* ---------- мини-игра', recentStart);
  if (recentStart < 0 || recentEnd < 0) throw new Error('Classic recent notes integration changed');
  patched = patched.slice(0, recentStart) + '    async function fetchRecentNotes(){ return loadRecentNotes(); }\n\n' + patched.slice(recentEnd);
  const scheduleStart = patched.indexOf('  ensureSchedule().then(()=>{', patched.indexOf('function renderHome(){'));
  const scheduleEnd = patched.indexOf('\n}\n    const RECENT_NOTES_LIMIT', scheduleStart);
  if (scheduleStart < 0 || scheduleEnd < 0) throw new Error('Classic home schedule integration changed');
  patched = patched.slice(0, scheduleStart) + '  ensureSchedule().then(updateHomeTime).catch(()=>{});' + patched.slice(scheduleEnd);
  patched = replaceRequired(patched, '<span>Файлы</span>', '<span>Материалы</span>');
  patched = replaceRequired(patched, '<span>Пары</span>', '<span>Расписание</span>');
  patched = replaceRequired(
    patched,
    '\'<p class="empty-line">Пока задач нет. Добавьте первую задачу.</p>\'',
    '\'<div class="home-empty"><span aria-hidden="true">◇</span><div><strong>План пока свободен</strong><p>Добавьте личную задачу, когда понадобится.</p></div></div>\'',
  );
  return patched;
}

function replaceRequired(source: string, before: string, after: string): string {
  if (!source.includes(before)) throw new Error(`Classic integration changed: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

/** Only assembled copies of upstream modules change. Missing integration points fail the build. */
export function patchClassicModule(path: string, source: string): string {
  if (path === 'js/lectures.js') {
    let result = "import { plainMathText } from './student-text.js';\n" + source;
    result = replaceRequired(result, 'displayNames[nfc(path)] || unslug(fallback);', 'plainMathText(displayNames[nfc(path)] || unslug(fallback));');
    result = replaceRequired(
      result,
      'item.name = displayNames[nfc(item.path)] || unslug(item.name);',
      'item.name = plainMathText(displayNames[nfc(item.path)] || unslug(item.name));',
    );
    result = replaceRequired(result, 'file.name = original ?', 'file.name = plainMathText(original ?');
    result = replaceRequired(result, ': unslug(file.name);', ': unslug(file.name));');
    result = replaceRequired(
      result,
      "text: copy.textContent.replace(/\\s+/g, ' ').trim()",
      "text: plainMathText(copy.textContent.replace(/\\s+/g, ' ').trim())",
    );
    result = replaceRequired(result, 'const jump = norm(takeJump());', 'const jump = norm(plainMathText(takeJump()));');
    result = replaceRequired(result, 'title: heading, sub:', 'title: plainMathText(heading), sub:');
    result = replaceRequired(result, "if (!matchMedia('(max-width: 760px)').matches) { list.style.left = list.style.width = ''; return; }", '');
    result = replaceRequired(
      result,
      'list.style.left = `${12 - rect.left}px`; list.style.width = `${innerWidth - 24}px`;',
      'const width = Math.min(480, innerWidth - 24); list.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12)) - rect.left}px`; list.style.width = `${width}px`;',
    );
    result = replaceRequired(result, 'const heading = section.h ? ` › ${section.h}`', 'const heading = section.h ? ` › ${plainMathText(section.h)}`');
    return result;
  }
  if (path === 'js/quiz.js') {
    // An unmarked C++ declaration is code too: int* must never become Markdown emphasis.
    return replaceRequired(
      source,
      '  s=s.replace(/\\$([^$\\n]+?)\\$/g,',
      "  s=s.replace(/\\b(?:void|int|char|double|float|bool|auto|long|short|unsigned|signed)\\s+\\w+\\([^()\\n]*\\)/g,c=>keep('<code>'+esc(c)+'</code>'));\n  s=s.replace(/\\$([^$\\n]+?)\\$/g,",
    );
  }
  if (path === 'js/settings.js') return replaceRequired(source, 'Подгружается из Google Fonts', 'Локальный шрифт с поддержкой кириллицы');
  if (path === 'js/prefs.js') {
    let result = replaceRequired(source, '>Сбросить всё</button>', '>Сбросить настройки оформления и чтения</button>');
    result = replaceRequired(
      result,
      '<div class="prefs-actions">',
      '<p class="settings-note">Экспорт и импорт ниже переносят только оформление и настройки чтения. Для переноса задач, закладок и игрового прогресса используйте «Резервную копию личного прогресса».</p><div class="prefs-actions">',
    );
    return result;
  }
  if (path === 'js/schedule-ui.js') {
    let result = replaceRequired(source, '＋ Домашнее задание</button>', '＋ Добавить ДЗ</button>');
    result = replaceRequired(
      result,
      'export async function ensureSchedule() {',
      'export async function reloadSchedule() { data = null; loading = null; return ensureSchedule(); }\nexport async function ensureSchedule() {',
    );
    return replaceRequired(result, '}).catch(error => {', '}).catch(error => { loading = null;');
  }
  if (path === 'js/schedule.js' || path === 'js/homework.js') {
    let result = "import { studentFetch } from './student-data.js';\n" + source;
    result = result.replaceAll("fetch('./data/", "studentFetch('./data/");
    if (path === 'js/homework.js') {
      result = "import { emptyState } from './home-dashboard.js';\n" + result;
      result = replaceRequired(
        result,
        '\'<p class="empty-line">Актуальных заданий пока нет.</p>\'',
        "emptyState('Актуальных домашних заданий нет', 'Здесь появятся новые задания группы.', '#/homework', 'Открыть задания')",
      );
      result = replaceRequired(
        result,
        'export async function ensureHomework() {',
        'export async function reloadHomework() { homework = null; loading = null; await ensureHomework(); renderAll(); }\nexport async function ensureHomework() {',
      );
      result = replaceRequired(result, '})().catch(error => {', '})().catch(error => { loading = null;');
      result = "import { ic } from './icons.js';\n" + result;
      result = replaceRequired(result, '>Сохранить задание</button>', '>Сохранить только для меня</button>');
      result = replaceRequired(
        result,
        '<p class="form-error" id="homework-error"',
        '<p class="dialog-hint">Задание сначала появится только у вас. Чтобы его увидела группа, нажмите «Сохранить в GitHub» в списке ДЗ.</p><p class="form-error" id="homework-error"',
      );
      result = replaceRequired(
        result,
        'aria-label="Отметить ${esc(item.subject)} выполненным"',
        'title="Сделано для меня — группа эту отметку не видит" aria-label="Отметить ${esc(item.subject)} выполненным только для меня"',
      );
      result = replaceRequired(
        result,
        'data-hw-delete="${esc(item.id)}" aria-label="Удалить задание"',
        'data-hw-delete="${esc(item.id)}" title="Удалить в моей копии; для группы — после публикации в GitHub" aria-label="Удалить задание в моей копии"',
      );
      result = replaceRequired(
        result,
        '${esc(dueStatus(item.due))}</span>',
        "${esc(dueStatus(item.due))}${item.due ? ` · ${esc(dateLabel(item.due))}` : ''}</span>",
      );
      result = replaceRequired(
        result,
        'aria-label="Удалить задание в моей копии">×</button>',
        'aria-label="Удалить задание в моей копии">${ic(\'trash\', 20)}</button>',
      );
    }
    if (path === 'js/schedule.js') result = replaceRequired(result, 'stale: false', "stale: response.headers.has('X-M3102-Saved')");
    return result;
  }
  return source;
}
