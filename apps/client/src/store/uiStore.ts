import { create } from 'zustand';
import { TIME_MODES, type TimeMode } from '../scene/timeOfDay';

/** Выбранное время суток запоминаем в браузере: это настройка вида, а не часть мира. */
const TIME_KEY = 'interna.time';

function loadTimeMode(): TimeMode {
  try {
    const saved = localStorage.getItem(TIME_KEY);
    return TIME_MODES.includes(saved as TimeMode) ? (saved as TimeMode) : 'auto';
  } catch {
    return 'auto';
  }
}

interface UiStore {
  showGrid: boolean;
  toggleGrid: () => void;
  /** Запрос на поворот камеры на 90°: -1 влево, 1 вправо. Счётчик, чтобы каждое нажатие было новым событием. */
  rotateRequest: { dir: -1 | 1; seq: number };
  requestRotate: (dir: -1 | 1) => void;
  /** Время суток в комнате: auto — как на часах пользователя. */
  timeMode: TimeMode;
  /** Следующий режим по кругу: авто → утро → день → вечер → ночь → авто. */
  cycleTimeMode: () => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  showGrid: true,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  rotateRequest: { dir: 1, seq: 0 },
  requestRotate: (dir) => set((s) => ({ rotateRequest: { dir, seq: s.rotateRequest.seq + 1 } })),
  timeMode: loadTimeMode(),
  cycleTimeMode: () =>
    set((s) => {
      const timeMode = TIME_MODES[(TIME_MODES.indexOf(s.timeMode) + 1) % TIME_MODES.length]!;
      try {
        localStorage.setItem(TIME_KEY, timeMode);
      } catch {
        // Без localStorage режим просто не запомнится.
      }
      return { timeMode };
    }),
}));
