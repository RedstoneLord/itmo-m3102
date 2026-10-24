// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSyncStore } from '../../services/syncStore';
import { useGroupStore } from '../group/groupStore';
import { useHomeworkStore } from '../homework/homeworkStore';
import { useLectureNotesStore } from '../materials/lectureNotesStore';
import { DeadlinesPanel, HomeworkPanel, MaterialsPanel, RecentNotesPanel } from './HomePanels';

const view = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

const cold = () => useSyncStore.setState({ status: 'syncing', lastSync: null });

describe('главная до первой загрузки', () => {
  beforeEach(() => {
    useGroupStore.setState({ deadlines: [], deadlinesDone: {}, files: [] });
    useHomeworkStore.setState({ items: [], done: {} });
    useLectureNotesStore.setState({ lectureNotes: [] });
  });
  afterEach(() => useSyncStore.setState({ status: 'idle', lastSync: null }));

  it('вместо «пусто» — скелетон, вместо нуля — прочерк', () => {
    cold();
    view(
      <>
        <DeadlinesPanel />
        <HomeworkPanel today="2026-10-01" />
        <MaterialsPanel />
        <RecentNotesPanel />
      </>,
    );
    expect(screen.queryByText(/Сроков пока нет/)).toBeNull();
    expect(screen.queryByText(/Актуальных заданий пока нет/)).toBeNull();
    expect(screen.queryByText(/Пока нет конспектов/)).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByLabelText('Загружаем дедлайны')).toBeTruthy();
    expect(screen.getByLabelText('Загружаем задания')).toBeTruthy();
    expect(screen.getByLabelText('Загружаем конспекты')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('первая синхронизация закончилась и данных правда нет — честные пустые состояния', () => {
    useSyncStore.setState({ status: 'done', lastSync: Date.now() });
    view(
      <>
        <DeadlinesPanel />
        <HomeworkPanel today="2026-10-01" />
        <MaterialsPanel />
      </>,
    );
    expect(screen.getByText('Сроков пока нет.')).toBeTruthy();
    expect(screen.getByText('Актуальных заданий пока нет.')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('сохранённые данные видны сразу, пока идёт новая синхронизация', () => {
    useSyncStore.setState({ status: 'syncing', lastSync: Date.now() });
    useGroupStore.setState({ deadlines: [{ id: 'd1', name: 'Лаба 1', deadline: '2026-10-05T23:59:00+03:00' }] });
    view(<DeadlinesPanel />);
    expect(screen.getByText('Лаба 1')).toBeTruthy();
    expect(screen.queryByLabelText('Загружаем дедлайны')).toBeNull();
  });
});
