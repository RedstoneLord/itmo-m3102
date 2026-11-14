/** Переименование обновляет существующий конспект, а не объявляет его новым. */
export function recentHistory(history: string, existing: Set<string>): Map<string, { path: string; date: string; change: string }> {
  const changes = new Map<string, { path: string; date: string; change: string }>();
  let date = '';
  for (const line of history.split('\n')) {
    if (line.startsWith('@')) {
      date = line.slice(1);
      continue;
    }
    const [status = '', ...parts] = line.split('\t');
    const renamed = /^R\d+$/.test(status);
    const path = renamed ? parts.at(-1) || '' : parts.join('\t');
    if (Number.isFinite(Date.parse(date)) && existing.has(path) && !changes.has(path) && (renamed || ['A', 'M'].includes(status)))
      changes.set(path, { path, date, change: status === 'A' ? 'added' : 'updated' });
  }
  return changes;
}
