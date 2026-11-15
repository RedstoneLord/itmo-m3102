// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateRange, importPersonalTimetable } from '../../classic/live-timetable';
import { useScheduleStore } from '../features/schedule/scheduleStore';
import { refreshLiveTimetable } from './liveTimetable';

const snapshot = (at: string) =>
  importPersonalTimetable(
    [
      {
        code: 0,
        data: dateRange('2026-11-15', '2026-11-21').map((date, i) => ({
          date,
          lessons:
            i === 0
              ? [
                  {
                    pair_id: 1,
                    subject: 'Дискретная математика',
                    group: 'ДМ 1.2(M3102)',
                    work_type_id: 2,
                    time_start: '13:30',
                    time_end: '15:00',
                  },
                ]
              : [],
        })),
      },
    ],
    '2026-11-15',
    '2026-11-21',
    at,
  );

describe('public timetable polling', () => {
  beforeEach(() => useScheduleStore.setState({ liveTimetable: snapshot('2026-11-15T09:00:00Z'), liveError: false }));
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the last accepted data when the new response is malformed or unavailable', async () => {
    for (const response of [new Response('{}'), new Response('', { status: 503 })]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await refreshLiveTimetable();
      expect(useScheduleStore.getState().liveTimetable!.updatedAt).toBe('2026-11-15T09:00:00Z');
      expect(useScheduleStore.getState().liveError).toBe(true);
    }
  });
  it('never overwrites a newer accepted snapshot with an older CDN response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot('2026-11-15T08:00:00Z')))));
    await refreshLiveTimetable();
    expect(useScheduleStore.getState().liveTimetable!.updatedAt).toBe('2026-11-15T09:00:00Z');
    expect(useScheduleStore.getState().liveError).toBe(true);
  });
});
