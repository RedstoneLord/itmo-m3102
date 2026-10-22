// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueueStore } from './queueStore';

const issue = (i: number) => ({
  title: `[dl1] Гость ${i}`,
  html_url: `https://github.com/RedstoneLord/itmo-m3102/issues/${i}`,
  user: { login: 'stranger' },
});
const page = (from: number, count: number) => Array.from({ length: count }, (_, k) => issue(from + k));

/** Подставляет GitHub: страница N → ответ pages[N - 1] (число записей) или статус ошибки */
function stubIssues(pages: (number | { status: number })[]) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    // Без параметра page GitHub отдаёт первую страницу
    const number = Number(new URL(String(input)).searchParams.get('page') ?? 1);
    const reply = pages[number - 1] ?? 0;
    if (typeof reply === 'object') return new Response('{}', { status: reply.status });
    const from = pages.slice(0, number - 1).reduce<number>((sum, item) => sum + (typeof item === 'number' ? item : 0), 0);
    return Response.json(page(from, reply));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('очередь сдачи: страницы GitHub', () => {
  beforeEach(() => useQueueStore.setState({ queues: {}, at: 0, error: '', loading: false }));
  afterEach(() => vi.unstubAllGlobals());

  it('записей больше 100 — читаются все страницы, последние в очереди не теряются', async () => {
    const fetchMock = stubIssues([100, 5]);
    await useQueueStore.getState().refresh();

    const { queues, error } = useQueueStore.getState();
    expect(error).toBe('');
    expect(queues.dl1).toHaveLength(105);
    expect(queues.dl1?.at(-1)?.name).toBe('Гость 104');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('page=2');
  });

  it('меньше страницы — один запрос; ровно страница — следующий пустой заканчивает', async () => {
    const few = stubIssues([30]);
    await useQueueStore.getState().refresh();
    expect(few).toHaveBeenCalledTimes(1);
    expect(useQueueStore.getState().queues.dl1).toHaveLength(30);

    const exact = stubIssues([100, 0]);
    await useQueueStore.getState().refresh();
    expect(exact).toHaveBeenCalledTimes(2);
    expect(useQueueStore.getState().queues.dl1).toHaveLength(100);
  });

  it('страниц не больше пяти, даже если GitHub отдаёт полные до бесконечности', async () => {
    const fetchMock = stubIssues([100, 100, 100, 100, 100, 100, 100]);
    await useQueueStore.getState().refresh();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(useQueueStore.getState().queues.dl1).toHaveLength(500);
  });

  it('сбой на второй странице оставляет прошлую очередь, а не половину новой', async () => {
    const previous = { dl1: [{ name: 'Прошлый', url: 'https://github.com/x/1' }] };
    useQueueStore.setState({ queues: previous });
    stubIssues([100, { status: 500 }]);
    await useQueueStore.getState().refresh();

    const { queues, error } = useQueueStore.getState();
    expect(queues).toEqual(previous);
    expect(error).not.toBe('');
  });
});
