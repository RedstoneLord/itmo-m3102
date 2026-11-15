import { parseLiveTimetable } from '../../classic/live-timetable';
import { useScheduleStore } from '../features/schedule/scheduleStore';

let flight: Promise<void> | undefined;

/** Public same-origin data only. Authentication is confined to the private Actions job. */
export function refreshLiveTimetable(): Promise<void> {
  flight ??= (async () => {
    try {
      const response = await fetch(new URL('./data/timetable-live.json', document.baseURI), {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('Timetable unavailable');
      const snapshot = parseLiveTimetable(await response.json());
      const current = useScheduleStore.getState().liveTimetable;
      // A stale CDN/offline response must not overwrite a newer accepted snapshot.
      if (!current || snapshot.updatedAt >= current.updatedAt)
        useScheduleStore.setState({ liveTimetable: snapshot, liveError: response.headers.has('X-M3102-Saved') });
      else useScheduleStore.setState({ liveError: true });
    } catch {
      useScheduleStore.setState({ liveError: true });
    }
  })().finally(() => {
    flight = undefined;
  });
  return flight;
}

export function startLiveTimetableSync(): void {
  const saved = useScheduleStore.getState().liveTimetable;
  if (saved) {
    try {
      useScheduleStore.setState({ liveTimetable: parseLiveTimetable(saved) });
    } catch {
      useScheduleStore.setState({ liveTimetable: null });
    }
  }
  void refreshLiveTimetable();
  setInterval(() => {
    if (document.visibilityState === 'visible') void refreshLiveTimetable();
  }, 5 * 60_000);
  window.addEventListener('online', () => void refreshLiveTimetable());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshLiveTimetable();
  });
}
