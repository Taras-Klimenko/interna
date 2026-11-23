import { create } from 'zustand';
import type { GridPos } from '@interna/shared';
import type { ActionId } from '../interaction/actions';

/**
 * Дело персонажа: дойти до предмета и что-то с ним сделать.
 * walking — идёт к предмету, acting — играет анимацию; эффект (свет, полив) применяется, когда она доиграет.
 */
export interface CharacterTask {
  objectId: string;
  action: ActionId;
  /** Точка в мировых координатах, к которой повернуться лицом. */
  face: { x: number; z: number };
  /** Уточнение дела: название трека, название книги. */
  arg?: string;
  phase: 'walking' | 'acting';
}

/**
 * Состояние персонажа во время работы (не сохраняется).
 * Позиция «между клетками» живёт в ref внутри сцены, а не в сторе, чтобы не перерисовывать React каждый кадр.
 */
interface CharacterRuntimeStore {
  /** Клетки, по которым идти. Новый объект — новый маршрут. */
  path: { cells: GridPos[]; seq: number };
  /** Куда идём: для маркера на полу. */
  target: GridPos | null;
  /** Анимация, выбранная вручную в тестовой панели или для дела. null — обычное поведение. */
  manualClip: string | null;
  /** Какой клип играет сейчас: для подсветки в панели. */
  currentClip: string;
  task: CharacterTask | null;
  /** Просто идти (клик по полу). Отменяет текущее дело. */
  walk: (cells: GridPos[], target: GridPos) => void;
  /** Идти к предмету, чтобы потом выполнить дело. */
  walkForTask: (cells: GridPos[], target: GridPos, task: Omit<CharacterTask, 'phase'>) => void;
  arrive: () => void;
  playClip: (clip: string | null) => void;
  setCurrentClip: (clip: string) => void;
  cancelTask: () => void;
}

export const useCharacterStore = create<CharacterRuntimeStore>()((set) => ({
  path: { cells: [], seq: 0 },
  target: null,
  manualClip: null,
  currentClip: 'Idle_Loop',
  task: null,
  walk: (cells, target) => set((s) => ({ path: { cells, seq: s.path.seq + 1 }, target, manualClip: null, task: null })),
  walkForTask: (cells, target, task) =>
    set((s) => ({
      path: { cells, seq: s.path.seq + 1 },
      target: cells.length > 0 ? target : null,
      manualClip: null,
      task: { ...task, phase: 'walking' },
    })),
  arrive: () => set({ target: null }),
  playClip: (clip) => set((s) => ({ manualClip: clip, target: null, task: null, path: { cells: [], seq: s.path.seq + 1 } })),
  setCurrentClip: (clip) => set({ currentClip: clip }),
  cancelTask: () => set({ task: null }),
}));
