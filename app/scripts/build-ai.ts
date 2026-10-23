// Выгрузки предметов «Для ИИ» по ссылке: ai/<id предмета>.md. Читает конспекты и данные группы прямо из чекаута
// репозитория (без сети) тем же кодом, что страница предмета; вызывается при сборке готового сайта (assemble-classic.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAiFiles, COURSE_INFO_DIR } from '../src/features/subjects/aiFiles';

/** Откуда берутся файлы: конспекты, материалы, лабораторные, записи лекций и описания курсов */
const DIRS = ['Конспекты', 'Материалы', 'Лабораторные', 'Записи лекций', COURSE_INFO_DIR.slice(0, -1)];

/** Все файлы папки с путями через «/» (на Windows readdir отдаёт «\»; fs.cpSync и git портят кириллицу — обходим сами) */
function walk(root: string, dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(root, path) : [path];
  });
}

/** Собирает выгрузки из корня репозитория `root` в папку `out`; возвращает, сколько файлов записано */
export async function writeAiFiles(root: string, out: string): Promise<number> {
  const paths = DIRS.filter((dir) => existsSync(join(root, dir))).flatMap((dir) => walk(root, dir));
  const files = await buildAiFiles({ paths, read: (path) => readFileSync(join(root, path), 'utf8') });
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
  return Object.keys(files).length;
}
