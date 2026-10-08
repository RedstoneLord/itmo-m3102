// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLectureNotesStore } from '../features/materials/lectureNotesStore';
import { blobSha, parseTree, syncGithubContent } from './githubContent';

const NOTE = 'Конспекты/ДМ/Лекция_1/Графы.md';
const TEXT = ['# Графы', '', 'Текст'].join('\n');

describe('parseTree', () => {
  it('принимает формат дерева API: файлы с путём, sha и размером; папки пропускает', () => {
    expect(
      parseTree({
        truncated: false,
        tree: [
          { path: 'a.md', type: 'blob', sha: '1', size: 5 },
          { path: 'dir', type: 'tree', sha: '2' },
          { path: 'dir/b.md', type: 'blob', sha: '3' },
        ],
      }),
    ).toEqual([
      { path: 'a.md', size: 5, sha: '1' },
      { path: 'dir/b.md', size: 0, sha: '3' },
    ]);
  });

  it('чужой формат и обрезанный список — не дерево', () => {
    expect(parseTree(null)).toBeNull();
    expect(parseTree([])).toBeNull();
    expect(parseTree({ files: [] })).toBeNull();
    expect(parseTree({ truncated: true, tree: [] })).toBeNull();
    expect(parseTree({ tree: [{ path: 'a.md', type: 'blob' }] })).toBeNull();
  });
});

describe('синхронизация: data/tree.json вместо дерева из API', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** treeJson: ответ на data/tree.json (число — статус ошибки, строка — тело как есть) */
  async function run(treeJson: object | number | string) {
    const sha = await blobSha(new TextEncoder().encode(TEXT));
    const files = [NOTE, 'data/homework.json', 'Дедлайны/deadlines.json'].map((path) => ({ path, type: 'blob', sha }));
    const apiCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = decodeURI(String(input));
        if (url.includes('api.github.com')) {
          apiCalls.push(url);
          return Response.json({ tree: files });
        }
        if (url.endsWith('data/tree.json')) {
          if (typeof treeJson === 'number') return new Response('Not Found', { status: treeJson });
          return typeof treeJson === 'string' ? new Response(treeJson) : Response.json(treeJson);
        }
        if (url.endsWith('deadlines.json')) return Response.json([]);
        if (url.endsWith('.json')) return Response.json({ items: [] });
        return new Response(TEXT);
      }),
    );
    useLectureNotesStore.setState({ lectureNotes: [] });
    await syncGithubContent();
    return { apiCalls, notes: useLectureNotesStore.getState().lectureNotes.map((note) => note.id), files };
  }

  it('есть годный tree.json — запросов к API нет', async () => {
    const sha = await blobSha(new TextEncoder().encode(TEXT));
    const files = [NOTE, 'data/homework.json', 'Дедлайны/deadlines.json'].map((path) => ({ path, type: 'blob', sha }));
    const result = await run({ tree: files });
    expect(result.apiCalls).toEqual([]);
    expect(result.notes).toEqual([`gh:${NOTE}`]);
  });

  it('нет файла, не читается, чужой формат или только часть репозитория — дерево берётся из API', async () => {
    for (const treeJson of [404, '{ не json', { items: [] }, { truncated: true, tree: [] }, { tree: [{ path: NOTE, type: 'blob', sha: '1' }] }]) {
      const result = await run(treeJson);
      expect(result.apiCalls, JSON.stringify(treeJson)).toHaveLength(1);
      expect(result.notes, JSON.stringify(treeJson)).toEqual([`gh:${NOTE}`]);
    }
  });
});
