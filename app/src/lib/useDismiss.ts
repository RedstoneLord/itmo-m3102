import { useEffect, type RefObject } from 'react';

/** Открытая панель закрывается кликом мимо неё и клавишей Escape. `setOpen` — сеттер состояния: он не меняется между рендерами */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', onDown);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('pointerdown', onDown);
      removeEventListener('keydown', onKey);
    };
  }, [ref, open, setOpen]);
}
