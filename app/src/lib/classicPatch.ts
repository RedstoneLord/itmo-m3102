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
    .replace(/<link[^>]*rel=["']manifest["'][^>]*>\s*/g, '')
    .replace(/(HIDDEN_FILE_NAMES\s*=\s*\[)([^\]]*)(\])/, (_all, open: string, list: string, close: string) => open + list.toLowerCase() + close)
    .replace(/<html(\s|>)/, '<html data-site-style="classic"$1')
    .replace(
      '</head>',
      `    <style id="classic-light-theme">${CLASSIC_LIGHT_THEME}</style>\n    <link rel="stylesheet" href="./css/student-tools.css">\n    <script src="./switch/site-switch.js" charset="utf-8"></script>\n  </head>`,
    );
  // Small fixtures and upstream pages without our supported router only receive the appearance patch.
  if (!html.includes('function renderRoute()')) return patched;
  patched = replaceRequired(
    patched,
    '    import { dateKey,',
    "    import { installStudentTools, renderStudentRoute, decorateStudentPage, directoryResponse, renderHomeDeadlines } from './js/student-tools.js';\n    import { queues, studentFetch } from './js/student-data.js';\n    import { groupArchived } from './js/student-core.js';\n    import { dateKey,",
  );
  patched = replaceRequired(
    patched,
    '    installScheduleEditor();',
    '    installStudentTools({ students: STUDENTS, parseHash, studentMatches, resolveQueueEntry, renderNotes, runNoteExtras });\n    installScheduleEditor();',
  );
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
    "    function readStudentLogin(){try{return (JSON.parse(localStorage.getItem('m3102-student-v1'))?.login||'').toLowerCase();}catch{return '';}}\n    const DEADLINES_QUEUE_LABEL=",
  );
  patched = patched.replaceAll("fetch('./Дедлайны/deadlines.json'", "studentFetch('./Дедлайны/deadlines.json'");
  patched = replaceRequired(patched, 'deadlinesQueueError=true;deadlinesQueueCache={};', 'deadlinesQueueError=true;');
  patched = replaceRequired(
    patched,
    "if(!path)intro='<div",
    'if(!path)intro=\'<nav class="student-actions"><a class="btn2" href="#/subjects">Все предметы</a><a class="btn2" href="#/bookmarks">Мои закладки</a></nav><div',
  );
  patched = replaceRequired(
    patched,
    '            }else{\n              grid+=`<div class="card"',
    '            }else if([\'mp3\',\'wav\',\'m4a\',\'ogg\',\'opus\',\'flac\'].includes(e)){\n              grid+=`<a class="card" href="#/audio/${encodePath(it.path)}"><div class="ic">${ic(\'audio\',22)}</div><div class="meta"><div class="name">${title}</div><div class="desc">${fmtSize(it.size)} · слушать с сохранением позиции</div></div></a>`;\n            }else{\n              grid+=`<div class="card"',
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
    result = replaceRequired(result, 'const heading = section.h ? ` › ${section.h}`', 'const heading = section.h ? ` › ${plainMathText(section.h)}`');
    return result;
  }
  if (path === 'js/schedule-ui.js') return replaceRequired(source, '＋ Домашнее задание</button>', '＋ Добавить ДЗ</button>');
  if (path === 'js/schedule.js' || path === 'js/homework.js') {
    let result = "import { studentFetch } from './student-data.js';\n" + source;
    result = result.replaceAll("fetch('./data/", "studentFetch('./data/");
    if (path === 'js/homework.js') {
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
    }
    return result;
  }
  return source;
}
