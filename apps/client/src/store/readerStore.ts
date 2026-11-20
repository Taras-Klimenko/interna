import { create } from 'zustand';

/** Какая книга открыта в читалке. Не сохраняется: после перезагрузки читалка закрыта, а место в книге — в мире. */
interface ReaderStore {
  open: { shelfId: string; bookId: string } | null;
  openBook: (shelfId: string, bookId: string) => void;
  close: () => void;
}

export const useReaderStore = create<ReaderStore>()((set) => ({
  open: null,
  openBook: (shelfId, bookId) => set({ open: { shelfId, bookId } }),
  close: () => set({ open: null }),
}));
