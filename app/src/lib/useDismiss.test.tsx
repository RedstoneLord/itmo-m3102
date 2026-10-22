// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useDismiss } from './useDismiss';

function Panel() {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, setOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>снаружи</button>
      <div ref={ref}>{open && <span>панель</span>}</div>
    </>
  );
}

describe('useDismiss', () => {
  it('клик внутри панели и чужая клавиша её не закрывают', () => {
    render(<Panel />);
    fireEvent.pointerDown(screen.getByText('панель'));
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(screen.queryByText('панель')).not.toBeNull();
  });

  it('клик мимо закрывает, Escape тоже, и так каждый раз при повторном открытии', () => {
    render(<Panel />);
    fireEvent.pointerDown(screen.getByText('снаружи'));
    expect(screen.queryByText('панель')).toBeNull();

    fireEvent.click(screen.getByText('снаружи'));
    expect(screen.queryByText('панель')).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('панель')).toBeNull();
  });
});
