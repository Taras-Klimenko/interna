import { Color, Vector3 } from 'three';

/** Режим времени суток: как на часах у пользователя или выбранное вручную. */
export type TimeMode = 'auto' | 'morning' | 'day' | 'evening' | 'night';

export const TIME_MODES: TimeMode[] = ['auto', 'morning', 'day', 'evening', 'night'];

/** Час, который показываем в ручных режимах. */
const MODE_HOURS: Record<Exclude<TimeMode, 'auto'>, number> = { morning: 8, day: 13, evening: 19, night: 23 };

export type DayPhase = Exclude<TimeMode, 'auto'>;

export const PHASE_LABELS: Record<DayPhase, string> = { morning: 'Утро', day: 'День', evening: 'Вечер', night: 'Ночь' };
export const PHASE_ICONS: Record<DayPhase, string> = { morning: '🌅', day: '☀️', evening: '🌇', night: '🌙' };

export function localHour(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60;
}

export function hourFor(mode: TimeMode, now = new Date()) {
  return mode === 'auto' ? localHour(now) : MODE_HOURS[mode];
}

export function phaseOf(hour: number): DayPhase {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Тёмное время: фон почти чёрный, и подписи интерфейса поверх сцены становятся светлыми. */
/**
 * Темно ли в комнате настолько, что интерфейсу нужен светлый текст. Смотрим на яркость фона в этот час,
 * а не на часы: вечером фон темнеет плавно, и светлый текст нужен раньше, чем наступит «ночь».
 */
export function isDarkHour(hour: number) {
  const background = lightingAt(hour, probe).background.clone().convertLinearToSRGB();
  return 0.299 * background.r + 0.587 * background.g + 0.114 * background.b < 0.6;
}

/** Освещение комнаты в какой-то момент суток. */
export interface Lighting {
  background: Color;
  skyColor: Color;
  groundColor: Color;
  ambient: number;
  sunColor: Color;
  sun: number;
  /** Откуда светит солнце (или луна) — позиция направленного света. */
  sunPosition: Vector3;
  /** Небо за окном: цвет вверху и у горизонта. */
  skyTop: Color;
  skyBottom: Color;
  /** Сколько дневного света: 1 — день, 0 — ночь. От него — солнечное пятно на полу и звёзды за окном. */
  daylight: number;
}

interface Keyframe {
  hour: number;
  background: string;
  sky: string;
  ground: string;
  ambient: number;
  sunColor: string;
  sun: number;
  from: [number, number, number];
  skyTop: string;
  skyBottom: string;
  daylight: number;
}

/**
 * Опорные точки суток, между ними — плавный переход. Дневные цвета — те, что были в сцене раньше.
 * Ночью комната не чёрная, а глубоко-синяя: её освещает луна и, главное, лампы.
 */
const NIGHT: Omit<Keyframe, 'hour'> = {
  background: '#1c2233',
  sky: '#62709a',
  ground: '#2e2a35',
  // С затенением в углах (AO) и виньеткой ночная комната темнее — рассеянного света чуть больше.
  ambient: 0.75,
  sunColor: '#9fb3e8',
  sun: 0.5,
  from: [-4, 8, -3],
  skyTop: '#0b1230',
  skyBottom: '#1f2c55',
  daylight: 0,
};

const DAY: Omit<Keyframe, 'hour'> = {
  background: '#f3e7da',
  sky: '#fff4e6',
  ground: '#b59b84',
  ambient: 1,
  sunColor: '#fff1dc',
  sun: 2.4,
  from: [4, 9, 5],
  skyTop: '#6fb3e6',
  skyBottom: '#d3ebf7',
  daylight: 1,
};

const KEYFRAMES: Keyframe[] = [
  { hour: 0, ...NIGHT },
  { hour: 5, ...NIGHT },
  {
    hour: 7,
    background: '#ecd0bd',
    sky: '#ffdcc4',
    ground: '#9c8574',
    ambient: 0.85,
    sunColor: '#ffbb8c',
    sun: 1.5,
    from: [8, 4, 3],
    skyTop: '#8fa9d6',
    skyBottom: '#ffc7a3',
    daylight: 0.65,
  },
  { hour: 10, ...DAY },
  { hour: 16, ...DAY },
  {
    hour: 18.5,
    background: '#e9b892',
    sky: '#ffc9a2',
    ground: '#8f6d5a',
    ambient: 0.8,
    sunColor: '#ff9a5c',
    sun: 1.7,
    from: [-8, 3.5, 4],
    skyTop: '#5f6fae',
    skyBottom: '#ffa066',
    daylight: 0.75,
  },
  {
    hour: 20.5,
    background: '#3f3b55',
    sky: '#8783ad',
    ground: '#3b3440',
    ambient: 0.45,
    sunColor: '#8c90c8',
    sun: 0.45,
    from: [-6, 6, 2],
    skyTop: '#262c5c',
    skyBottom: '#7a5a86',
    daylight: 0.08,
  },
  { hour: 22, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const scratch = { a: new Color(), b: new Color(), to: new Vector3() };

function mix(out: Color, a: string, b: string, t: number) {
  return out.copy(scratch.a.set(a)).lerp(scratch.b.set(b), t);
}

/** Пишет в `out` освещение для часа `hour` (0–24). */
export function lightingAt(hour: number, out: Lighting): Lighting {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYFRAMES.length - 2 && KEYFRAMES[i + 1]!.hour <= h) i++;
  const a = KEYFRAMES[i]!;
  const b = KEYFRAMES[i + 1]!;
  const linear = (h - a.hour) / (b.hour - a.hour || 1);
  // Сглаживаем начало и конец перехода, чтобы рассвет и закат не «щёлкали».
  const t = linear * linear * (3 - 2 * linear);
  mix(out.background, a.background, b.background, t);
  mix(out.skyColor, a.sky, b.sky, t);
  mix(out.groundColor, a.ground, b.ground, t);
  mix(out.sunColor, a.sunColor, b.sunColor, t);
  out.ambient = a.ambient + (b.ambient - a.ambient) * t;
  out.sun = a.sun + (b.sun - a.sun) * t;
  out.sunPosition.set(...a.from).lerp(scratch.to.set(...b.from), t);
  mix(out.skyTop, a.skyTop, b.skyTop, t);
  mix(out.skyBottom, a.skyBottom, b.skyBottom, t);
  out.daylight = a.daylight + (b.daylight - a.daylight) * t;
  return out;
}

/** Сдвигает `current` к `goal` на долю k (0 — не меняем, 1 — сразу ставим goal). */
export function blendLighting(current: Lighting, goal: Lighting, k: number) {
  current.background.lerp(goal.background, k);
  current.skyColor.lerp(goal.skyColor, k);
  current.groundColor.lerp(goal.groundColor, k);
  current.sunColor.lerp(goal.sunColor, k);
  current.ambient += (goal.ambient - current.ambient) * k;
  current.sun += (goal.sun - current.sun) * k;
  current.sunPosition.lerp(goal.sunPosition, k);
  current.skyTop.lerp(goal.skyTop, k);
  current.skyBottom.lerp(goal.skyBottom, k);
  current.daylight += (goal.daylight - current.daylight) * k;
}

export function createLighting(): Lighting {
  return {
    background: new Color(),
    skyColor: new Color(),
    groundColor: new Color(),
    ambient: 0,
    sunColor: new Color(),
    sun: 0,
    sunPosition: new Vector3(),
    skyTop: new Color(),
    skyBottom: new Color(),
    daylight: 0,
  };
}

/** Для isDarkHour: чтобы не создавать объект на каждый вызов. */
const probe = createLighting();
