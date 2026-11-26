import { create } from 'zustand';

/**
 * Качество картинки. high — мягкие тени, затенение в углах (AO), свечение ламп, сглаживание;
 * medium — свечение и виньетка без тяжёлых эффектов; low — без постобработки, для слабых устройств.
 * В режиме auto уровень выбирается сам: стартуем с подходящего устройству и опускаемся, если кадров мало.
 */
export type QualityTier = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | QualityTier;

const KEY = 'interna.quality';
const TIERS: QualityTier[] = ['low', 'medium', 'high'];

function storedSetting(): QualitySetting {
  const value = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'auto';
}

/** Телефон или планшет — начинаем со среднего качества: батарея и нагрев важнее. */
function startingTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  return window.matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
}

interface GraphicsStore {
  setting: QualitySetting;
  /** Уровень, который выбрал автоматический режим. */
  autoTier: QualityTier;
  setSetting: (setting: QualitySetting) => void;
  /** Кадров мало — на ступень ниже (только в режиме auto). */
  degrade: () => void;
  /** Кадров с запасом — на ступень выше, но не выше стартового. */
  improve: () => void;
}

const ceiling = startingTier();

export const useGraphicsStore = create<GraphicsStore>()((set, get) => ({
  setting: storedSetting(),
  autoTier: ceiling,
  setSetting: (setting) => {
    try {
      localStorage.setItem(KEY, setting);
    } catch {
      // Не запомнится — не беда.
    }
    set({ setting, autoTier: ceiling });
  },
  degrade: () => {
    const index = TIERS.indexOf(get().autoTier);
    if (index > 0) set({ autoTier: TIERS[index - 1]! });
  },
  improve: () => {
    const index = TIERS.indexOf(get().autoTier);
    if (index < TIERS.indexOf(ceiling)) set({ autoTier: TIERS[index + 1]! });
  },
}));

/** Уровень качества, который сейчас действует. */
export const useQualityTier = () => useGraphicsStore((s) => (s.setting === 'auto' ? s.autoTier : s.setting));

export const QUALITY_LABELS: Record<QualitySetting, string> = {
  auto: 'Авто',
  high: 'Высокое',
  medium: 'Среднее',
  low: 'Низкое',
};
