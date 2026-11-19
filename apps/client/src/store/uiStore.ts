import { create } from 'zustand';

interface UiStore {
  showGrid: boolean;
  toggleGrid: () => void;
  /** Запрос на поворот камеры на 90°: -1 влево, 1 вправо. Счётчик, чтобы каждое нажатие было новым событием. */
  rotateRequest: { dir: -1 | 1; seq: number };
  requestRotate: (dir: -1 | 1) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  showGrid: true,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  rotateRequest: { dir: 1, seq: 0 },
  requestRotate: (dir) => set((s) => ({ rotateRequest: { dir, seq: s.rotateRequest.seq + 1 } })),
}));
