import { create } from 'zustand';
import { TIME_MODES, type TimeMode } from '../scene/timeOfDay';

/** Выбранное время суток запоминаем в браузере: это настройка вида, а не часть мира. */
const TIME_KEY = 'interna.time';
/** Брать ли персонажа на прогулку — тоже запоминаем: следующая прогулка начнётся так же. */
const TOGETHER_KEY = 'interna.walkTogether';

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
  /** Вид от первого лица: вы сами ходите по комнате. Иначе — диорама сверху. */
  firstPerson: boolean;
  setFirstPerson: (on: boolean) => void;
  /** Куда вы идёте после тапа по полу: для отметки на полу. */
  walkGoal: { x: number; z: number } | null;
  setWalkGoal: (goal: { x: number; z: number } | null) => void;
  /** Где вы: в комнате или на прогулке в поле за домом. */
  place: 'room' | 'field';
  setPlace: (place: 'room' | 'field') => void;
  /** Персонаж гуляет с вами (иначе он дома, а вы гуляете один). */
  walkTogether: boolean;
  setWalkTogether: (together: boolean) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  showGrid: true,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  rotateRequest: { dir: 1, seq: 0 },
  requestRotate: (dir) => set((s) => ({ rotateRequest: { dir, seq: s.rotateRequest.seq + 1 } })),
  timeMode: loadTimeMode(),
  firstPerson: false,
  setFirstPerson: (firstPerson) => set({ firstPerson, walkGoal: null }),
  walkGoal: null,
  setWalkGoal: (walkGoal) => set({ walkGoal }),
  place: 'room',
  setPlace: (place) => set({ place, walkGoal: null }),
  walkTogether: (() => {
    try {
      return localStorage.getItem(TOGETHER_KEY) !== 'false';
    } catch {
      return true;
    }
  })(),
  setWalkTogether: (walkTogether) => {
    try {
      localStorage.setItem(TOGETHER_KEY, String(walkTogether));
    } catch {
      // Не запомнится — не беда.
    }
    set({ walkTogether });
  },
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
