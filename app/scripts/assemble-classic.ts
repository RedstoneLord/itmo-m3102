// Классический сайт группы лежит в корне репозитория ровно так, как в RedstoneLord/itmo-m3102 (index.html, css/, js/,
// data/…), — чтобы потом объединять репозитории без конфликтов. Скрипт собирает из него то, что нужно сайту:
//
//   npm run classic             корень репозитория → app/public/classic (для dev: приложение на /, классический на /classic/)
//   npm run site                готовый сайт для Pages → app/site: классический в корне, приложение (app/dist) в /app/,
//                               выгрузки предметов «Для ИИ» (build-ai.ts) в /app/ai/
//   … -- --fresh                к любому из них: самые свежие data/ и Дедлайны/ с их репозитория (в CI — всегда)
//   npm run classic -- --pull   скачать файлы сайта с их репозитория (master) в корень — обновить закоммиченную копию
//
// В собранной копии подключаются дополнения app/classic (classicPatch.ts) и общий переключатель стиля
// (switch/site-switch.js). Список файлов при --pull — один запрос к GitHub API, файлы — с raw.githubusercontent.com (без git и без
// fs.cpSync: на Windows оба ломают кириллицу в путях). Конспекты и записи лекций не берём: оба сайта читают их с GitHub.
// Нет сети или лимит API — предупреждение и выход без ошибки: остаётся то, что лежит в корне.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { patchClassicIndex, patchClassicModule } from '../src/lib/classicPatch';

const REPO = 'RedstoneLord/itmo-m3102';
const APP = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(APP, '..');
// Что их сайт отдаёт посетителю (читает data/ и Дедлайны/ по относительным путям) и что ещё лежит у них рядом с сайтом
const SERVED_FILES = ['index.html', 'site.css', 'sw.js'];
const SERVED_DIRS = ['css', 'js', 'img', 'data', 'Дедлайны', 'fonts'];
const DATA_DIRS = ['data', 'Дедлайны'];
const PULL_FILES = [...SERVED_FILES, 'manifest.webmanifest', 'package.json'];
const PULL_DIRS = [...SERVED_DIRS, 'tests'];
const PARALLEL = 8;

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const inDirs = (path: string, dirs: string[]) => dirs.some((dir) => path.startsWith(`${dir}/`));

async function listUpstream(files: string[], dirs: string[]): Promise<{ sha: string; paths: string[] }> {
  // CLASSIC_TREE_JSON — готовый ответ API (gh api repos/…/git/trees/master?recursive=1 > файл): когда лимит анонимных
  // запросов (60 в час) уже выбран. В CI лимит выше — там идёт GITHUB_TOKEN самого запуска
  const token = process.env.GITHUB_TOKEN;
  const treeFile = process.env.CLASSIC_TREE_JSON;
  let body: string;
  if (treeFile) body = readFileSync(treeFile, 'utf8');
  else {
    const response = await fetch(`https://api.github.com/repos/${REPO}/git/trees/master?recursive=1`, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok)
      throw new Error(`GitHub API ${response.status}${response.status === 403 ? ' (лимит запросов — подождите или задайте CLASSIC_TREE_JSON)' : ''}`);
    body = await response.text();
  }
  const tree = JSON.parse(body) as { sha: string; truncated: boolean; tree: { path: string; type: string }[] };
  if (tree.truncated) throw new Error('дерево файлов обрезано GitHub — слишком большой репозиторий');
  const paths = tree.tree.filter((item) => item.type === 'blob' && (files.includes(item.path) || inDirs(item.path, dirs))).map((item) => item.path);
  if (files.includes('index.html') && !paths.includes('index.html')) throw new Error('в репозитории группы нет index.html — структура изменилась');
  return { sha: tree.sha, paths };
}

async function download(path: string): Promise<Buffer> {
  const response = await fetch(`https://raw.githubusercontent.com/${REPO}/master/${encodePath(path)}`);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Скачать пути в папку целиком или не скачать вовсе: сорвалась сеть на середине — на диске ничего не меняется */
async function downloadAll(paths: string[], into: string): Promise<void> {
  const loaded: [string, Buffer][] = [];
  for (let i = 0; i < paths.length; i += PARALLEL) {
    loaded.push(...(await Promise.all(paths.slice(i, i + PARALLEL).map(async (path): Promise<[string, Buffer]> => [path, await download(path)]))));
  }
  for (const [path, data] of loaded) {
    mkdirSync(dirname(join(into, path)), { recursive: true });
    writeFileSync(join(into, path), data);
  }
}

/** fs.cpSync в Node на Windows портит кириллицу в именах папок («Дедлайны») — копируем сами */
function copyTree(from: string, to: string): void {
  if (statSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) copyTree(join(from, name), join(to, name));
  } else {
    copyFileSync(from, to);
  }
}

function pathsBelow(root: string, prefix = ''): string[] {
  if (!existsSync(join(root, prefix))) return [];
  return readdirSync(join(root, prefix)).flatMap((name) => {
    const path = prefix ? `${prefix}/${name}` : name;
    return statSync(join(root, path)).isDirectory() ? pathsBelow(root, path) : [path];
  });
}

/** A complete build-time listing avoids one GitHub API request per opened folder. */
function studentAssets(out: string): void {
  const learningRoots = ['Конспекты', 'Материалы', 'Лабораторные', 'Записи лекций'];
  const content = [...learningRoots, 'img', 'data', 'Дедлайны'].flatMap((dir) => pathsBelow(ROOT, dir)).filter((p) => !p.split('/').includes('output'));
  const dirs = new Set<string>();
  const tree: { path: string; type: string; sha: string; size?: number }[] = content.map((path) => {
    const data = readFileSync(join(ROOT, path));
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    return { path, type: 'blob', size: data.length, sha: createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex') };
  });
  tree.push(...[...dirs].map((path) => ({ path, type: 'tree', sha: '' })));
  writeFileSync(join(out, 'data', 'tree.json'), JSON.stringify({ tree, truncated: false }));
  const subjectFiles: Record<string, { ai: string }> = {};
  const lectures = JSON.parse(readFileSync(join(ROOT, 'data', 'lectures.json'), 'utf8')) as { subjects: { name: string }[] };
  mkdirSync(join(out, 'ai'), { recursive: true });
  for (const subject of lectures.subjects) {
    const paths = content.filter((path) => path.startsWith(`Конспекты/${subject.name}/`) && path.endsWith('.md'));
    const text = [`# ${subject.name.replaceAll('_', ' ')}\n`, ...paths.map((path) => `\n\n---\n\nИсточник: ${path}\n\n${readFileSync(join(ROOT, path), 'utf8')}`)].join('');
    const ai = `ai/${encodeURIComponent(subject.name)}.md`;
    writeFileSync(join(out, 'ai', `${subject.name}.md`), text);
    subjectFiles[subject.name] = { ai };
  }
  writeFileSync(join(out, 'data', 'student-subjects.json'), JSON.stringify(subjectFiles));
  for (const name of readdirSync(join(APP, 'classic'))) {
    if (name.endsWith('.js') && name !== 'sw.js') copyFileSync(join(APP, 'classic', name), join(out, 'js', name));
  }
  copyFileSync(join(APP, 'classic', 'sw.js'), join(out, 'sw.js'));
  copyFileSync(join(APP, 'classic', 'student-tools.css'), join(out, 'css', 'student-tools.css'));
  for (const path of ['js/schedule.js', 'js/schedule-ui.js', 'js/homework.js']) writeFileSync(join(out, path), patchClassicModule(path, readFileSync(join(out, path), 'utf8')));
}

function shellManifest(out: string): void {
  const paths = ['index.html', 'site.css', ...['js', 'css', 'img', 'fonts', 'switch', 'ai'].flatMap((dir) => pathsBelow(out, dir))];
  if (existsSync(join(out, 'm3102.ics'))) paths.push('m3102.ics');
  const files = paths.map((url) => ({ url: encodePath(url), revision: createHash('sha256').update(readFileSync(join(out, url))).digest('hex'), size: statSync(join(out, url)).size }));
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const vendors = [...new Set(html.match(/https:\/\/cdnjs\.cloudflare\.com\/[^"'\s)<>]+/g) || [])];
  files.push(...vendors.map((url) => ({ url, revision: url, size: 0 })));
  // Both addresses can be used to reopen the application offline.
  files.push({ url: './', revision: files[0]!.revision, size: 0 });
  writeFileSync(join(out, 'shell-manifest.json'), JSON.stringify({ files }));
  // Make browser update detection notice shell changes even when worker logic is unchanged.
  const revision = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  writeFileSync(join(out, 'sw.js'), readFileSync(join(APP, 'classic', 'sw.js'), 'utf8') + `\n// Build: ${revision}\n`);
}

/** Классический сайт из корня репозитория → папка `out`, с правкой index.html и переключателем стиля */
function assemble(out: string): void {
  // Папку может держать dev-сервер (Windows не даёт её удалить) — тогда просто перезаписываем файлы поверх
  try {
    rmSync(out, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* перезапишем поверх */
  }
  mkdirSync(out, { recursive: true });
  for (const name of [...SERVED_FILES, ...SERVED_DIRS]) {
    if (existsSync(join(ROOT, name))) copyTree(join(ROOT, name), join(out, name));
  }
  copyTree(join(APP, 'public', 'switch'), join(out, 'switch'));
  writeFileSync(join(out, 'index.html'), patchClassicIndex(readFileSync(join(ROOT, 'index.html'), 'utf8')));
  studentAssets(out);
  shellManifest(out);
}

/** Готовый сайт: классический — в корне, приложение (уже собранное в app/dist) — в /app/, выгрузки предметов для ИИ — в /app/ai/ */
async function assembleSite(out: string): Promise<void> {
  const dist = join(APP, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error('нет app/dist — сначала npm run build');
  assemble(out);
  copyTree(dist, join(out, 'app'));
  // dev-копия классического сайта (app/public/classic) попадает в dist вместе с public/ — в готовом сайте она лишняя
  rmSync(join(out, 'app', 'classic'), { recursive: true, force: true });
  // Подписка на календарь живёт по старому адресу (в корне) — у подписчиков он уже прописан
  if (existsSync(join(dist, 'm3102.ics'))) copyFileSync(join(dist, 'm3102.ics'), join(out, 'm3102.ics'));
  shellManifest(out);
  // «Для ИИ» по ссылке: кнопка на странице предмета отдаёт адрес /app/ai/<предмет>.md. Не получилось — сайт всё равно собран
  try {
    const { writeAiFiles } = await import('./build-ai');
    console.log(`Для ИИ: ${await writeAiFiles(ROOT, join(out, 'app', 'ai'))} файлов в app/ai`);
  } catch (error) {
    console.warn('Файлы «Для ИИ» не собраны:', error instanceof Error ? error.message : error);
  }
}

const siteMode = process.argv.includes('--site');
const mode = process.argv.includes('--pull') ? 'pull' : process.argv.includes('--fresh') ? 'fresh' : 'local';
const OUT = siteMode ? join(APP, 'site') : join(APP, 'public', 'classic');
try {
  if (mode === 'pull') {
    const { sha, paths } = await listUpstream(PULL_FILES, PULL_DIRS);
    await downloadAll(paths, ROOT);
    console.log(`Классический сайт обновлён в корне репозитория: ${paths.length} файлов, дерево ${sha.slice(0, 7)}`);
  } else {
    if (siteMode) await assembleSite(OUT);
    else assemble(OUT);
    const where = siteMode ? 'app/site (классический в корне, приложение в /app/)' : 'app/public/classic';
    if (mode === 'fresh') {
      try {
        const { sha, paths } = await listUpstream([], DATA_DIRS);
        await downloadAll(paths, OUT);
        console.log(`Сайт собран в ${where}; данные свежие (дерево ${sha.slice(0, 7)})`);
      } catch (error) {
        console.warn('Свежие данные классического сайта не получены, остались закоммиченные:', error instanceof Error ? error.message : error);
      }
    } else {
      console.log(`Сайт собран в ${where} из корня репозитория`);
    }
  }
} catch (error) {
  console.warn('Классический сайт не обновлён:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
