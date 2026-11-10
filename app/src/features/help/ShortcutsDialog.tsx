import { lazy, Suspense, useEffect } from 'react';
import { create } from 'zustand';
import { Modal } from '../../components/ui/Modal';

const ShortcutsContent = lazy(() => import('./ShortcutsContent'));

/** Открыто ли окно — открывают и клавиша «?», и пункт в меню пользователя */
export const useShortcutsDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** «?» открывает список сочетаний клавиш — кроме полей ввода, где это просто символ */
export function useShortcutsKey() {
  const setOpen = useShortcutsDialog((state) => state.setOpen);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== '?' || (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]'))) return;
      event.preventDefault();
      setOpen(true);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [setOpen]);
}

export function ShortcutsDialog() {
  const { open, setOpen } = useShortcutsDialog();
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Сочетания клавиш">
      <Suspense fallback={null}>
        <ShortcutsContent />
      </Suspense>
    </Modal>
  );
}
