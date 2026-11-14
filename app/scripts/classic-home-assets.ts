import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { recentHistory } from './classic-note-history';

/** Из оригинала берём только рисунок, без игрового цикла, сохранений и наград. */
export function writeHomeAssets(root: string, out: string, paths: string[]): void {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const artStart = html.indexOf('var HOG = {');
  const artEnd = html.indexOf('/* ===== предметы мира ===== */', artStart);
  const spikesStart = html.indexOf('function spikeRow(');
  const spikesEnd = html.indexOf('function drawHat(', spikesStart);
  const hash = html.match(/function hash1\(n\)\{[^\n]+\}/)?.[0];
  if (artStart < 0 || artEnd < 0 || spikesStart < 0 || spikesEnd < 0 || !hash) throw new Error('Classic decorative renderer integration changed');
  const art = html.slice(artStart, artEnd);
  if (!art.includes('function drawHog(')) throw new Error('Classic decorative renderer integration changed: drawHog');
  const helpers = `const TAU=Math.PI*2;const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));\nfunction circ(c,x,y,r){c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}\n`;
  writeFileSync(join(out, 'js', 'home-hog-art.js'), helpers + hash + '\n' + html.slice(spikesStart, spikesEnd) + art + '\nexport { drawHog };\n');
  const path = (name: string) => art.match(new RegExp(`${name}: '([^']+)'`))?.[1];
  if (!path('body') || !path('head')) throw new Error('Classic decorative fallback integration changed');
  writeFileSync(
    join(out, 'img', 'home-hog.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="${path('body')}" fill="#85594f"/><path d="${path('belly')}" fill="#ffd3b6"/><path d="${path('head')}" fill="#ffd3b6"/><ellipse cx="198" cy="281" rx="28" ry="36" fill="#ffd3b6"/><ellipse cx="194" cy="286" rx="15" ry="23" fill="#f27ab0"/><ellipse cx="136" cy="299" rx="12" ry="17" fill="#161616"/><path d="${path('nose')}" fill="#3d3f43"/><path d="${path('mouth')}" fill="none" stroke="#3d3f43" stroke-width="5"/></svg>`,
  );
  const existing = new Set(
    paths.filter((p) => /^Конспекты\/.+\.(md|pdf)$/i.test(p) && !p.split('/').some((x) => x.startsWith('.') || x === 'output')),
  );
  const changes = new Map<string, { path: string; date: string; change: string }>();
  try {
    // Один ограниченный локальный запрос, без зависимости от GitHub и checkout mtime.
    const history = execFileSync(
      'git',
      ['-c', 'core.quotepath=false', 'log', '-1500', '--format=@%aI', '--name-status', '--find-renames', '--', 'Конспекты'],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    for (const [path, entry] of recentHistory(history, existing)) changes.set(path, entry);
  } catch {
    /* Архив без .git: доступные конспекты без выдуманных дат. */
  }
  const entries = [...existing].map((path) => changes.get(path) || { path, date: null, change: 'updated' });
  writeFileSync(join(out, 'data', 'recent-notes.json'), JSON.stringify({ version: 1, entries }));
}
