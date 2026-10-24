import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGroupStore } from '../features/group/groupStore';
import { offlinePlan, useOfflineStore } from './offline';

// Код читалки, который загрузка подтягивает заранее, в тесте не нужен
vi.mock('../features/materials/PdfViewer', () => ({ PDF_WORKER_URL: 'worker.js' }));
vi.mock('../components/diagrams/DiagramBlock', () => ({}));
vi.mock('mermaid', () => ({}));

it('без интернета: качаем PDF и картинки из папок материалов — новые и изменённые, пропавшие удаляем', () => {
  const files = [
    { path: 'Конспекты/ДМ/Лекция_1/Логика.pdf', size: 10, sha: 'a2' },
    { path: 'Конспекты/ДМ/img/схема.svg', size: 1, sha: 'b1' },
    { path: 'Материалы/ЛА/Учебник.pdf', size: 50, sha: 'c1' },
    { path: 'Конспекты/ДМ/Лекция_1/Логика.md', size: 5, sha: 'd1' },
    { path: 'Записи лекций/ДМ/лекция.mp3', size: 900, sha: 'e1' },
    { path: 'img/memes/кот.png', size: 3, sha: 'f1' },
  ];
  const plan = offlinePlan(files, { 'Конспекты/ДМ/Лекция_1/Логика.pdf': 'a1', 'Конспекты/ДМ/img/схема.svg': 'b1', 'Конспекты/старое.pdf': 'z' });
  expect(plan.wanted.map((file) => file.path)).toEqual([
    'Конспекты/ДМ/Лекция_1/Логика.pdf',
    'Конспекты/ДМ/img/схема.svg',
    'Материалы/ЛА/Учебник.pdf',
  ]);
  expect(plan.missing.map((file) => file.path)).toEqual(['Конспекты/ДМ/Лекция_1/Логика.pdf', 'Материалы/ЛА/Учебник.pdf']);
  expect(plan.stale).toEqual(['Конспекты/старое.pdf']);
});

/** Запрос, который отвечает, когда скажет тест, и честно обрывается по сигналу */
function pendingFetch() {
  const waiting: { url: string; reply: (ok: boolean) => void }[] = [];
  const fetchMock = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        if (url === 'worker.js') return resolve(new Response('js'));
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        waiting.push({ url, reply: (ok) => resolve(new Response('pdf', { status: ok ? 200 : 500 })) });
      }),
  );
  return { fetchMock, waiting };
}

const cachePut = vi.fn(async () => {});

beforeEach(() => {
  cachePut.mockClear();
  useOfflineStore.setState({ saved: {}, status: 'idle', progress: null, error: '' });
  useGroupStore.setState({
    files: [1, 2, 3, 4].map((n) => ({ path: `Конспекты/ДМ/файл${n}.pdf`, size: 10, sha: `sha${n}` })),
  });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('caches', {
    open: async () => ({ put: cachePut, delete: async () => true }),
    delete: async () => true,
  });
});
afterEach(() => vi.unstubAllGlobals());

it('один запрос упал — остальные обрываются, а ошибка видна, только когда все остановились', async () => {
  const { fetchMock, waiting } = pendingFetch();
  vi.stubGlobal('fetch', fetchMock);

  const running = useOfflineStore.getState().download();
  await vi.waitFor(() => expect(waiting).toHaveLength(4));
  waiting[0]!.reply(false);
  await running;

  const state = useOfflineStore.getState();
  expect(state.status).toBe('error');
  expect(state.error).toContain('500');
  expect(state.saved).toEqual({});
});

it('«Очистить» посреди загрузки: поздние ответы не возвращают записи о сохранённом', async () => {
  const { fetchMock, waiting } = pendingFetch();
  vi.stubGlobal('fetch', fetchMock);

  const running = useOfflineStore.getState().download();
  await vi.waitFor(() => expect(waiting).toHaveLength(4));
  await useOfflineStore.getState().clear();
  waiting.forEach((request) => request.reply(true));
  await running;

  const state = useOfflineStore.getState();
  expect(state.saved).toEqual({});
  expect(state.status).toBe('idle');
  expect(cachePut).not.toHaveBeenCalled();
});
