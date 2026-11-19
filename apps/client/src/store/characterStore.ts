import { create } from 'zustand';
import type { GridPos } from '@interna/shared';

/**
 * Состояние персонажа во время работы (не сохраняется).
 * Позиция «между клетками» живёт в ref внутри сцены, а не в сторе, чтобы не перерисовывать React каждый кадр.
 */
interface CharacterRuntimeStore {
  /** Клетки, по которым идти. Новый объект — новый маршрут. */
  path: { cells: GridPos[]; seq: number };
  /** Куда идём: для маркера на полу. */
  target: GridPos | null;
  /** Анимация, выбранная вручную в тестовой панели. null — обычное поведение. */
  manualClip: string | null;
  /** Какой клип играет сейчас: для подсветки в панели. */
  currentClip: string;
  walk: (cells: GridPos[], target: GridPos) => void;
  arrive: () => void;
  playClip: (clip: string | null) => void;
  setCurrentClip: (clip: string) => void;
}

export const useCharacterStore = create<CharacterRuntimeStore>()((set) => ({
  path: { cells: [], seq: 0 },
  target: null,
  manualClip: null,
  currentClip: 'Idle_Loop',
  walk: (cells, target) => set((s) => ({ path: { cells, seq: s.path.seq + 1 }, target, manualClip: null })),
  arrive: () => set({ target: null }),
  playClip: (clip) => set((s) => ({ manualClip: clip, target: null, path: { cells: [], seq: s.path.seq + 1 } })),
  setCurrentClip: (clip) => set({ currentClip: clip }),
}));
