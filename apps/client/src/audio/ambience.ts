import { create } from 'zustand';
import { useCharacterStore } from '../store/characterStore';
import { useWorldStore } from '../store/worldStore';
import { WALK_CLIP } from '../character/assets';
import { useUiStore } from '../store/uiStore';
import { startFieldSounds, type AudioGraph } from './fieldSounds';
import { startBeachSounds } from './beachSounds';

/**
 * Звуки комнаты: шаги персонажа, щелчок выключателя, полив, дождь за окном (по желанию). На прогулке —
 * звуки поля (fieldSounds.ts).
 * Всё синтезируется на лету через Web Audio — никаких файлов. Музыка из колонки — отдельно (audio/player.ts).
 * Браузер разрешает звук только после первого нажатия, поэтому контекст создаётся по первому жесту.
 */

interface SoundSettings {
  /** Общая громкость звуков комнаты, 0–1 (0 — выключены). */
  volume: number;
  /** Тихий дождь за окном. */
  rain: boolean;
}

const KEY = 'interna.sound';

function stored(): SoundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SoundSettings>;
    return {
      volume: typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : 0.5,
      rain: raw.rain === true,
    };
  } catch {
    return { volume: 0.5, rain: false };
  }
}

export const useSoundStore = create<SoundSettings & { set: (patch: Partial<SoundSettings>) => void }>()((set, get) => ({
  ...stored(),
  set: (patch) => {
    set(patch);
    const { volume, rain } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ volume, rain }));
    } catch {
      // Не запомнится — не беда.
    }
  },
}));

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let rain: { stop: () => void } | null = null;

/** Двухсекундный шум: из него фильтрами получаются и шаги, и дождь, и вода. */
function noiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  // «Розоватый» шум: мягче белого, меньше шипения.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.04 * white) / 1.04;
    data[i] = last * 3.5;
  }
  return buffer;
}

/** Звуковой граф, если звук уже разблокирован (было первое нажатие). */
function graph(): AudioGraph | null {
  return ctx && master && noise ? { ctx, master, noise } : null;
}

function start() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = useSoundStore.getState().volume;
  master.connect(ctx.destination);
  noise = noiseBuffer(ctx);
  syncRain();
}

/** Короткий звук из шума: полоса частот, огибающая громкости. */
function burst({ freq, q = 1, type = 'lowpass', duration, gain, attack = 0.005, delay = 0 }: {
  freq: number;
  q?: number;
  type?: BiquadFilterType;
  duration: number;
  gain: number;
  attack?: number;
  delay?: number;
}) {
  if (!ctx || !master || !noise || useSoundStore.getState().volume === 0) return;
  const at = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(env).connect(master);
  source.start(at, Math.random() * 1.5);
  source.stop(at + duration + 0.05);
}

/** Шаг: мягкий глухой стук, каждый чуть другой. */
export function playStep() {
  burst({ freq: 260 + Math.random() * 120, q: 0.8, duration: 0.09, gain: 0.35 + Math.random() * 0.1 });
}

/** Щелчок выключателя: два коротких щелчка. */
export function playSwitch() {
  burst({ freq: 3200, type: 'bandpass', q: 2, duration: 0.025, gain: 0.5 });
  burst({ freq: 2400, type: 'bandpass', q: 2, duration: 0.03, gain: 0.35, delay: 0.06 });
}

/** Полив: струйка воды около секунды. */
export function playPour() {
  burst({ freq: 1400, type: 'bandpass', q: 1.5, duration: 1.3, gain: 0.25, attack: 0.15 });
  burst({ freq: 2600, type: 'bandpass', q: 3, duration: 1.1, gain: 0.08, attack: 0.2, delay: 0.1 });
}

/** Дождь за окном: ровный шум и редкие капли. */
function startRain() {
  if (!ctx || !master || !noise) return null;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 1800;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 350;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 2);
  source.connect(low).connect(high).connect(gain).connect(master);
  source.start();
  const drops = window.setInterval(() => {
    if (Math.random() < 0.5) burst({ freq: 2500 + Math.random() * 2500, type: 'bandpass', q: 6, duration: 0.04, gain: 0.06 + Math.random() * 0.06 });
  }, 90);
  return {
    stop: () => {
      window.clearInterval(drops);
      if (!ctx) return;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      source.stop(ctx.currentTime + 1.6);
    },
  };
}

function syncRain() {
  const want = useSoundStore.getState().rain && useSoundStore.getState().volume > 0;
  if (want && !rain && ctx) rain = startRain();
  if (!want && rain) {
    rain.stop();
    rain = null;
  }
}

/** Шагов в секунду — под скорость ходьбы персонажа. */
const STEP_MS = 470;

/** Включить звуки комнаты. Возвращает функцию остановки. */
export function startAmbience() {
  // Звук — только после первого нажатия или клавиши.
  const unlock = () => {
    start();
    void ctx?.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // На прогулке — звуки места: в поле ветер, птицы, сверчки и шорох травы, на пляже прибой и чайки; дома — тишина комнаты.
  let stopField: (() => void) | null = null;
  let playing: string | null = null;
  const syncPlace = (place: string, biome: string) => {
    const want = place === 'field' ? biome : null;
    if (want === playing) return;
    stopField?.();
    stopField = want === 'beach' ? startBeachSounds(graph) : want ? startFieldSounds(graph) : null;
    playing = want;
  };
  syncPlace(useUiStore.getState().place, useUiStore.getState().biome);
  const unsubscribePlace = useUiStore.subscribe((state) => syncPlace(state.place, state.biome));

  const unsubscribeSettings = useSoundStore.subscribe((state) => {
    if (master && ctx) master.gain.setTargetAtTime(state.volume, ctx.currentTime, 0.05);
    syncRain();
  });

  // Шаги — пока персонаж идёт.
  let steps: number | undefined;
  const unsubscribeCharacter = useCharacterStore.subscribe((state, previous) => {
    const walking = state.currentClip === WALK_CLIP;
    if (walking === (previous.currentClip === WALK_CLIP)) return;
    window.clearInterval(steps);
    if (walking) {
      playStep();
      steps = window.setInterval(playStep, STEP_MS);
    }
  });

  // Свет щёлкнул, растение полили — по изменению мира.
  const unsubscribeWorld = useWorldStore.subscribe((state, previous) => {
    if (state.teleportSeq !== previous.teleportSeq || state.world === previous.world) return;
    for (const object of state.world.objects) {
      const before = previous.world.objects.find((o) => o.id === object.id);
      if (!before) continue;
      if ((before.state.light?.on ?? false) !== (object.state.light?.on ?? false)) playSwitch();
      if ((object.state.needs?.water ?? 1) === 1 && (before.state.needs?.water ?? 1) < 1) playPour();
    }
  });

  // Вкладку спрятали — звук на паузу (и дождь тоже), вернулись — дальше.
  const onVisibility = () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') void ctx.suspend();
    else void ctx.resume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    unsubscribePlace();
    stopField?.();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(steps);
    unsubscribeSettings();
    unsubscribeCharacter();
    unsubscribeWorld();
  };
}
