import { create } from 'zustand';

/** Панель предмета: книжный шкаф или плейлист колонки. */
export type ObjectPanel = { kind: 'shelf' | 'music'; id: string };

/** Обычный режим (не расстановка): какой предмет выбран и какая его панель открыта. Не сохраняется. */
interface InteractionStore {
  /** Предмет, по которому кликнули: для него показана карточка с действиями. */
  selectedId: string | null;
  panel: ObjectPanel | null;
  notice: { text: string; seq: number } | null;
  select: (id: string | null) => void;
  openPanel: (kind: ObjectPanel['kind'], id: string) => void;
  closePanel: () => void;
  notify: (text: string) => void;
  /** Закрыть всё (например, при входе в режим расстановки). */
  reset: () => void;
}

export const useInteractionStore = create<InteractionStore>()((set) => ({
  selectedId: null,
  panel: null,
  notice: null,
  select: (id) => set({ selectedId: id }),
  openPanel: (kind, id) => set({ panel: { kind, id }, selectedId: id }),
  closePanel: () => set({ panel: null }),
  notify: (text) => set((s) => ({ notice: { text, seq: (s.notice?.seq ?? 0) + 1 } })),
  reset: () => set({ selectedId: null, panel: null }),
}));
