import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// Неизменяемые адреса всего графа: даже прежний воркер не смешает зависимости разных выпусков.
export function freezeClassicRelease(out: string, paths: string[]): string {
  const revision = createHash('sha256');
  for (const path of paths) revision.update(path).update(readFileSync(join(out, path)));
  const id = revision.digest('hex').slice(0, 20);
  for (const path of paths.filter(p => /^(js|css|fonts|img|switch)\//.test(p) || p === 'site.css')) {
    const target = join(out, 'releases', id, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(out, path), target);
  }
  let html = readFileSync(join(out, 'index.html'), 'utf8');
  // Относительные импорты внутри модулей/CSS уже остаются в том же каталоге выпуска.
  html = html.replace(/((?:src|href)=["'])(?:\.\/)?((?:js|css|fonts|img|switch)\/[^"']+|site\.css)(["'])/g, `$1./releases/${id}/$2$3`);
  html = html.replace(/(\bfrom\s*['"]|\bimport\s*\(\s*['"])(\.\/js\/)/g, `$1./releases/${id}/js/`);
  html = html.replace('<html ', `<html data-classic-release="${id}" `);
  writeFileSync(join(out, 'index.html'), html);
  return id;
}
