import { expect, it } from 'vitest';
import { formatTime } from './AudioPlayer';

it('время записи: минуты и секунды, с часами — с ведущим нулём у минут', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(65)).toBe('1:05');
  expect(formatTime(3725)).toBe('1:02:05');
  expect(formatTime(Number.NaN)).toBe('0:00');
});
