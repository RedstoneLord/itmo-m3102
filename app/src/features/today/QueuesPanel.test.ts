// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { myQueues } from './QueuesPanel';

const entry = (login: string) => ({ name: login, login, url: `https://example.com/${login}` });
const deadline = (id: string, day: number, year = 2100) => ({ id, name: `ОП - ${id}`, deadline: new Date(year, 0, day).toISOString() });

describe('мои очереди', () => {
  const deadlines = [deadline('late', 1, 2000), deadline('soon', 20), deadline('far', 25), deadline('finished', 22)];
  const queues = {
    late: [entry('anna'), entry('me')],
    soon: [entry('me')],
    far: [entry('anna')],
    finished: [entry('me')],
  };

  it('только невыполненные сроки, где я стою, с настоящим номером и длиной очереди', () => {
    const mine = myQueues(deadlines, { finished: true }, queues, 'me');
    expect(mine.map(({ item, place, total }) => [item.id, place, total])).toEqual([
      ['soon', 1, 1],
      ['late', 2, 2],
    ]);
  });

  it('нет очередей — пусто', () => {
    expect(myQueues(deadlines, {}, {}, 'me')).toEqual([]);
    expect(myQueues(deadlines, {}, queues, 'nobody')).toEqual([]);
  });
});
