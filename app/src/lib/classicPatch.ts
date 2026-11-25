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
    .replace(/<html(\s|>)/, '<html data-site-style="classic" data-classic-view="legacy"$1')
    .replace(/<head(\s[^>]*)?>/, '$&\n    <script src="./js/classic-view.js"></script>')
    .replace(
      '</head>',
      `    <link rel="stylesheet" href="./css/student-tools.css">\n    <link rel="stylesheet" href="./css/timetable.css">\n    <link rel="stylesheet" href="./css/legacy.css">\n    <style id="classic-light-theme" data-classic-design media="not all">${CLASSIC_LIGHT_THEME}</style>\n    <link rel="stylesheet" href="./css/classic-plus.css" data-classic-design media="not all">\n    <script>window.applyClassicView?.();</script>\n    <script src="./js/classic-boot.js" defer></script>\n    <script src="./switch/site-switch.js" charset="utf-8"></script>\n  </head>`,
    );
  // Small fixtures and upstream pages without our supported router only receive the appearance patch.
  if (!html.includes('function renderRoute()')) return patched;
  patched = replaceRequired(patched, '</head>', '  <link rel="stylesheet" href="./css/study-diagrams.css">\n  </head>');
  patched = replaceRequired(
    patched,
    "    import { printifyDiagrams } from './js/diagrams/array-player.js';",
    "    import { printifyDiagrams } from './js/diagrams/array-player.js';\n    import { printStudyFigures } from './js/diagrams/study.js';",
  );
  patched = replaceRequired(patched, '        printifyDiagrams(source);', '        printifyDiagrams(source);\n        printStudyFigures(source);');
  for (const panel of ['schedule-panel', 'deadline-panel', 'homework-panel', 'materials-panel', 'plan-panel', 'notes-panel']) {
    if (!html.includes(`dash-panel ${panel}`)) throw new Error(`Classic integration changed: home panel ${panel}`);
  }
  patched = replaceRequired(
    patched,
    '    import { dateKey,',
    "    import { isClassicView } from './js/home-preferences.js';\n    import { loadClassicLibrary } from './js/classic-libraries.js';\n    import { installStudentTools, renderStudentRoute, decorateStudentPage, directoryResponse, renderHomeDeadlines } from './js/student-tools.js';\n    import { loadRecentNotes, updateHomeTime } from './js/home-dashboard.js';\n    import { queues, studentFetch } from './js/student-data.js';\n    import { groupArchived, read as readClassicPreference } from './js/student-core.js';\n    import { dateKey,",
  );
  // Эти четыре существующие библиотеки нужны только PDF, экспорту и Mermaid, не главной.
  for (const library of [
    'pdf.js/2.16.105/pdf.min.js',
    'mermaid/10.9.1/mermaid.min.js',
    'jspdf/2.5.1/jspdf.umd.min.js',
    'html2canvas/1.4.1/html2canvas.min.js',
  ]) {
    patched = replaceRequired(patched, `    <script src="https://cdnjs.cloudflare.com/ajax/libs/${library}"></script>`, '');
  }
  patched = replaceRequired(patched, 'function renderPdfView(path){', 'async function renderPdfView(path){');
  patched = replaceRequired(
    patched,
    '  if(!window.__pdfWorkerSet){',
    "  try { await loadClassicLibrary('pdf'); } catch { const status=document.getElementById('pdf-status'); if(status&&seq===routeSeq){status.innerHTML='Не удалось загрузить PDF. <button class=\"btn2\" data-pdf-retry>Повторить</button>';status.querySelector('button').onclick=()=>renderPdfView(path);} return; }\n  if(seq!==routeSeq)return;\n  if(!window.__pdfWorkerSet){",
  );
  patched = replaceRequired(
    patched,
    '      if(nodes.length){\n        initMermaidOnce();',
    "      if(nodes.length){\n        try { await loadClassicLibrary('mermaid'); } catch { for(const node of nodes){node.innerHTML='<p role=\"alert\">Не удалось загрузить схему. <button class=\"btn2\">Повторить</button></p>';node.querySelector('button').onclick=()=>runNoteExtras(container);} return; }\n        initMermaidOnce();",
  );
  patched = replaceRequired(
    patched,
    '      if(!window.jspdf || !window.html2canvas){',
    "      if(btn){btn.disabled=true;btn.textContent='Подготавливаем PDF…';}\n      try { await Promise.all([loadClassicLibrary('exportPdf'),loadClassicLibrary('capture')]); } catch {} finally { if(btn){btn.disabled=false;btn.innerHTML=origHtml;} }\n      if(!window.jspdf || !window.html2canvas){",
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
  patched = replaceRequired(patched, "if(h==='settings')", "if(h==='settings'||h.startsWith('settings?'))");
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
  patched = replaceRequired(patched, '<span>Файлы</span>', '<span data-classic-label="Учёба">Файлы</span>');
  patched = replaceRequired(patched, '<span>ДЗ</span>', '<span data-classic-label="Задания">ДЗ</span>');
  patched = replaceRequired(patched, '<span>Еще</span>', '<span>Ещё</span>');
  patched = replaceRequired(
    patched,
    'data-icon="folder"></span>Материалы',
    'data-icon="folder"></span><span data-classic-label="Учёба">Материалы</span>',
  );
  patched = replaceRequired(
    patched,
    'data-icon="calendar"></span>Расписание',
    'data-icon="calendar"></span><span data-classic-label="Пары">Расписание</span>',
  );
  patched = patched.replace(/(<a class="tab" id="tab-homework"[^>]*>[\s\S]*?<\/span>)([^<]+)/, '$1<span data-classic-label="Задания">$2</span>');
  patched = replaceRequired(
    patched,
    "        mountOfflinePanel(c.querySelector('#offline-panel'));",
    '        c.querySelector(\'#offline-panel\').innerHTML=\'<a class="btn2" href="#/settings?section=data">Данные и работа без интернета</a>\';',
  );
  for (const [id, label] of [
    ['home', 'Главная'],
    ['materials', 'Материалы и конспекты'],
    ['schedule', 'Расписание занятий'],
    ['homework', 'Домашнее задание и дедлайны'],
    ['other', 'Ещё'],
  ]) {
    patched = patched.replace(new RegExp(`(id="tab-${id}"[^>]*)(>)`), `$1 aria-label="${label}"$2`);
  }
  // У исходного HTML одинаковый stylesheet подключён дважды.
  patched = patched.replace('    <link rel="stylesheet" href="./css/shell.css">\n', '');
  // Размер приветствия задаёт иерархия, длинный текст переносится по словам.
  patched = replaceRequired(
    patched,
    "  fitHeroTitle(c.querySelector('.home-hero h1'));",
    "  if(!isClassicView())fitHeroTitle(c.querySelector('.home-hero h1'));",
  );
  patched = replaceRequired(
    patched,
    '\'<p class="empty-line">Пока задач нет. Добавьте первую задачу.</p>\'',
    '(isClassicView()?\'<div class="home-empty"><span aria-hidden="true">◇</span><div><strong>План пока свободен</strong><p>Добавьте личную задачу, когда понадобится.</p></div></div>\':\'<p class="empty-line">Пока задач нет. Добавьте первую задачу.</p>\')',
  );
  return patched;
}

function replaceRequired(source: string, before: string, after: string): string {
  if (!source.includes(before)) throw new Error(`Classic integration changed: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}

function patchClassicDiagramEditor(source: string): string {
  let patched =
    "import { isStudyLanguage, mountStudyDiagram, mountStudyFigures, resolveStudySvg, STUDY_LANGUAGES, studyArt, studyTypes } from './study.js';\n" +
    source;
  patched = replaceRequired(
    patched,
    'const graphId =',
    'for (const lang of STUDY_LANGUAGES) { examples[lang] = studyTypes[lang].template; labels[lang] = studyTypes[lang].label; }\nconst graphId =',
  );
  patched = replaceRequired(
    patched,
    '  if (fromLink && diagramLanguages().includes(fromLink.language) && fromLink.source.length < 12000) { language = fromLink.language; source = fromLink.source; }',
    "  if (fromLink && diagramLanguages().includes(fromLink.language) && fromLink.source.length < 12000) {\n    language = fromLink.language; source = fromLink.source;\n    saveDraft();\n    history.replaceState(history.state, '', '#/diagrams');\n  }",
  );
  patched = replaceRequired(
    patched,
    '  let errorLine = 0;',
    "  const study = isStudyLanguage(language);\n  preview.toggleAttribute('data-study-preview', study);\n  if (study) editor().querySelector('#diagram-tool-label').textContent = language === 'matrix' ? 'Просмотрите шаги преобразования' : 'Вращайте сцену на холсте или кнопками';\n  let errorLine = 0;",
  );
  patched = replaceRequired(
    patched,
    '    preview.innerHTML = live ?',
    '    preview.innerHTML = study ? `<div class="diagram-image">${studyArt(result.model)}</div>` : live ?',
  );
  patched = replaceRequired(
    patched,
    '    if (live) mountArrayPlayers(preview);',
    '    if (study) mountStudyDiagram(preview, result.model);\n    if (live) mountArrayPlayers(preview);',
  );
  patched = replaceRequired(
    patched,
    "  if (language === 'graph' && model.edges[selectedEdge])",
    "  if (isStudyLanguage(language)) { slot.textContent = studyTypes[language].hint; return; }\n  if (language === 'graph' && model.edges[selectedEdge])",
  );
  patched = replaceRequired(
    patched,
    '  return clone.outerHTML.replace(',
    "  if (element.hasAttribute('data-study-current')) return resolveStudySvg(element, clone.outerHTML);\n  return clone.outerHTML.replace(",
  );
  patched = replaceRequired(patched, "event.target.closest('.arr-live')", "event.target.closest('.arr-live, .study-diagram')");
  patched = replaceRequired(
    patched,
    "if (!event.target.closest('#diagram-preview svg')) return;",
    "if (event.target.closest('.study-diagram') || !event.target.closest('#diagram-preview svg')) return;",
  );
  patched = replaceRequired(
    patched,
    "if (!editor()) return;\n    if (event.code === 'Space'",
    "if (!editor() || event.target.closest('.study-diagram')) return;\n    if (event.code === 'Space'",
  );
  patched = replaceRequired(
    patched,
    'graph, plot, chart, tree, array, diagram или canvas.',
    'graph, plot, chart, tree, array, diagram, canvas, geometry3d или matrix.',
  );
  patched = replaceRequired(patched, "figure.querySelector('svg'); if (!image) return;", "figure.querySelector('.dgm-art svg'); if (!image) return;");
  patched = replaceRequired(patched, '  mountArrayPlayers(container);', '  mountArrayPlayers(container);\n  mountStudyFigures(container);');
  return replaceRequired(
    patched,
    "if (!live && event.target.closest('.dgm-art'))",
    "if (!live && !figure.hasAttribute('data-study-figure') && event.target.closest('.dgm-art'))",
  );
}

/** Retain the upstream DSL and text formatting. Share edge geometry and flow layout with React. */
function patchClassicDiagramDrawing(source: string) {
  const graphStart = source.indexOf('function drawGraph(model) {');
  const graphNodes = source.indexOf('  const nodes = [...model.nodes.values()].map(node => {', graphStart);
  const flowStart = source.indexOf('const flowBase =');
  const flowNodes = source.indexOf('  const shapes = nodes.map(node => {', flowStart);
  if (graphStart < 0 || graphNodes < 0 || flowStart < 0 || flowNodes < 0) throw new Error('Classic diagram drawing hooks missing');
  let patched =
    source.slice(0, graphStart) +
    `function sizedGraphSvg(model, inner, defs, view) {
  return svg(model, inner, view.w, view.h, defs, view).replace('<svg ', \`<svg class="dgm-network" style="--dgm-width:\${view.w}px;--dgm-min-width:\${view.w * .8}px" \`);
}
function drawGraph(model) {
  const width = size(model.width, 640), height = size(model.height, 360);
  const points = graphPositions(model, width, height);
  const radii = new Map([...model.nodes.values()].map(node => [node.id, nodeRadius(node)]));
  const nodesWithSizes = [...model.nodes.values()].map(node => ({
    ...node, ...points.get(node.id), shape: 'circle', w: radii.get(node.id) * 2, h: radii.get(node.id) * 2,
  }));
  const { defs, edges, notes, view } = classicEdges({
    nodes: nodesWithSizes, edges: model.edges.map(edge => ({ ...edge, label: edge.weight })),
  }, \`dgm-arrow-\${hash(model.source)}\`, fmtLabel);
` +
    source.slice(graphNodes, flowStart) +
    `function drawFlow(model) {
  const nodes = [...model.nodes.values()].map(node => ({
    ...node, x: node.x ?? undefined, y: node.y ?? undefined,
    ...sizeNode({ ...node, label: symbols(node.label) }, true),
  }));
  const flow = { nodes, edges: model.edges, layout: 'layered', flow: true };
  applyLayout(flow);
  separateFlowNodes(nodes);
  const marker = \`dgm-flow-arrow-\${hash(model.source)}\`;
  const { defs, edges, notes, view } = classicEdges(flow, marker, fmtLabel);
` +
    source.slice(flowNodes);
  patched = replaceRequired(
    patched,
    '    extend(bounds, p.x - r, p.y - r, p.x + r, p.y + r);\n    return `<g data-dgm-node=',
    '    return `<g data-dgm-node=',
  );
  patched = replaceRequired(
    patched,
    '  const fitted = fitView(model, edges + nodes, bounds, width, height);\n  return svg(model, fitted.inner, width, height, defs, fitted.view);',
    '  return sizedGraphSvg(model, edges + nodes + notes, defs, view);',
  );
  patched = replaceRequired(
    patched,
    '    const p = positions.get(node.id), { w, h, fit } = boxes.get(node.id), x =',
    '    const p = node, { w, h, lines } = node, fit = { lines, size: NODE_FONT, truncated: false }, x =',
  );
  patched = replaceRequired(patched, 'textY += 5;', 'textY += 2;');
  patched = replaceRequired(patched, 'label: chain.weight })); return;', "label: chain.weight, directed: chain.arrows[i] !== '--' })); return;");
  patched = replaceRequired(patched, 'p.y - h / 2 + 12), bottom = format(p.y + h / 2 - 12)', 'p.y - h / 2 + 6), bottom = format(p.y + h / 2 - 6)');
  patched = replaceRequired(patched, 'A${format(w / 2)} 12 0 0 1 ${right}', 'A${format(w / 2)} 6 0 0 1 ${right}');
  patched = replaceRequired(patched, 'A${format(w / 2)} 12 0 0 1 ${left}', 'A${format(w / 2)} 6 0 0 1 ${left}');
  patched = replaceRequired(patched, 'ry="12"/>`; textY', 'ry="6"/>`; textY');
  patched = replaceRequired(
    patched,
    `fill="var(--card)" stroke="\${node.color || 'var(--accent)'}" stroke-width="2">\${shape}`,
    `fill="var(--card)" stroke="\${node.color || (node.shape === 'diamond' || node.shape === 'round' ? 'var(--accent)' : 'var(--muted)')}" stroke-width="1.4">\${shape}`,
  );
  return replaceRequired(
    patched,
    '  const fitted = fitView(model, arrows + shapes, bounds, width, wantedH);\n  return svg(model, fitted.inner, width, wantedH, defs, fitted.view);',
    '  return sizedGraphSvg(model, edges + shapes + notes, defs, view);',
  );
}

/** Only assembled copies of upstream modules change. Missing integration points fail the build. */
export function patchClassicModule(path: string, source: string): string {
  if (path === 'js/diagrams/index.js') {
    const imports =
      "import { STUDY_LANGUAGES, isStudyLanguage, parseStudyDiagram, printStudySvg, studyFigure, editDiagramButton, applyLayout, separateFlowNodes, classicEdges, sizeNode, NODE_FONT } from './study.js';\n";
    const hook = replaceRequired(
      source,
      'export function codeFigure(lang, text) {',
      'export function codeFigure(lang, text) {\n  if (isStudyLanguage(lang)) return studyFigure(lang, text);',
    );
    const register =
      '\nfor (const lang of STUDY_LANGUAGES) registerDiagram(lang, { parse: text => parseStudyDiagram(lang, text), render: printStudySvg });\n';
    const actions =
      '<div class="dgm-actions"><button type="button" data-dgm-copy>Копировать SVG</button><button type="button" data-dgm-save="svg">SVG</button><button type="button" data-dgm-save="png">PNG</button><button type="button" data-dgm-edit>✎ Редактировать</button></div>';
    return imports + patchClassicDiagramDrawing(replaceRequired(hook, actions, '${editDiagramButton()}')) + register;
  }
  if (path === 'js/diagrams/editor.js') return patchClassicDiagramEditor(source);
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
  if (path === 'js/settings.js') {
    let result = replaceRequired(source, 'Подгружается из Google Fonts', 'Локальный шрифт с поддержкой кириллицы');
    result = replaceRequired(
      result,
      'const FONTS = [',
      "const FONTS = [\n  { id: 'golos', name: 'Golos Text', var: '--ff-golos', note: 'Кириллица и латиница' },",
    );
    result = replaceRequired(result, "var: '--ff-noto', note: 'По умолчанию'", "var: '--ff-noto', note: 'Кириллица и латиница'");
    result = replaceRequired(result, "? id : 'noto'", "? id : document.documentElement.dataset.classicView === 'classic' ? 'golos' : 'noto'");
    return result;
  }
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
    let result = replaceRequired(
      "import { subjectColorId } from './timetable-model.js';\n" + source,
      '＋ Домашнее задание</button>',
      '＋ Добавить ДЗ</button>',
    );
    result = "import { campusNow } from './home-preferences.js';\n" + result.replaceAll('new Date()', 'campusNow()');
    result =
      "import { cancelledLessonMarkup, liveChangeMarkup, liveChangeLabel, liveDayBanner, liveStatusMarkup } from './live-schedule.js';\nimport { occurrencesOn } from './schedule.js';\n" +
      result;
    result = replaceRequired(
      result,
      'function lessonMarkup(lesson, date, index) {',
      'function lessonMarkup(lesson, date, index) {\n  if(lesson.cancelled)return cancelledLessonMarkup(lesson);\n  index=lessonsOn(date,data).findIndex(item=>item.id===lesson.id);',
    );
    result = replaceRequired(
      result,
      "other: 'Занятие'",
      "other: 'Занятие', seminar:'Семинар', consultation:'Консультация', exam:'Экзамен', credit:'Зачёт'",
    );
    result = replaceRequired(
      result,
      '<strong>${esc(lesson.subject)}</strong><small>',
      '<strong>${esc(lesson.subject)}</strong>${lesson.sourceChange ? `<span class="live-change-badge">${liveChangeLabel(lesson)}</span>` : \'\'}<small>',
    );
    result = replaceRequired(
      result,
      'ауд. ${esc(lesson.room)}`',
      "ауд. ${esc(lesson.room)}${lesson.previousRoom && lesson.previousRoom !== lesson.room ? ` (было ${esc(lesson.previousRoom)})` : ''}`",
    );
    result = replaceRequired(result, '<div class="sched-card-body"><p>', '<div class="sched-card-body">${liveChangeMarkup(lesson)}<p>');
    result = replaceRequired(
      result,
      'const lessons = lessonsOn(date, data);',
      'const lessons = occurrencesOn(date, data);\n  const source=liveStatusMarkup(data,dateKey(date));',
    );
    result = replaceRequired(
      result,
      'if (!lessons.length) return `<div class="sched-empty">',
      'if (!lessons.length) return `${source}<div class="sched-empty">',
    );
    result = replaceRequired(
      result,
      'return `<div class="sched-timeline">',
      'return `${source}${liveDayBanner(lessons)}<div class="sched-timeline">',
    );
    result = replaceRequired(result, '${data.overrides[key] ?', '${data.overrides[key] || occurrencesOn(date,data).some(item=>item.sourceChange) ?');
    result = replaceRequired(
      result,
      "entry.classList.toggle('is-current', minute >= start && minute < end);",
      "entry.classList.toggle('is-current', !entry.dataset.cancelled && minute >= start && minute < end);",
    );
    result = replaceRequired(
      result,
      'data-lesson="${esc(lesson.id)}"',
      'data-subject-color="${subjectColorId(lesson.subject)}" data-lesson="${esc(lesson.id)}"',
    );
    result = replaceRequired(
      result,
      'export async function ensureSchedule() {',
      'export async function reloadSchedule() { data = null; loading = null; return ensureSchedule(); }\nexport async function ensureSchedule() {',
    );
    result +=
      "\nconst pollSchedule=()=>{if(document.visibilityState==='visible')reloadSchedule().catch(()=>{});};\nsetInterval(pollSchedule,300000);window.addEventListener('online',pollSchedule);document.addEventListener('visibilitychange',pollSchedule);\n";
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
    if (path === 'js/schedule.js') {
      result = "import { loadLiveSnapshot, liveRowsOn } from './live-schedule.js';\n" + result;
      result = replaceRequired(result, 'stale: false', "stale: response.headers.has('X-M3102-Saved')");
      result = replaceRequired(result, 'export function lessonsOn(date, schedule) {', 'function baseLessonsOn(date, schedule) {');
      result = replaceRequired(result, 'export async function loadSchedule() {', 'async function loadBaseSchedule() {');
      result += `\nexport function occurrencesOn(date,schedule){return liveRowsOn(dateKey(date),baseLessonsOn(date,schedule),schedule.live);}
export function lessonsOn(date,schedule){return occurrencesOn(date,schedule).filter(item=>!item.cancelled);}
export async function loadSchedule(){const result=await loadBaseSchedule();const live=await loadLiveSnapshot();for(const data of [result.base,result.data]){Object.defineProperties(data,{live:{value:live.snapshot,configurable:true},liveSaved:{value:live.saved,configurable:true}});}return result;}\n`;
    }
    return result;
  }
  return source;
}
