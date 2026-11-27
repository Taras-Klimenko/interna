import { liveLighting } from '../scene/DayLight';
import { walker } from '../field/fieldState';
import { heightAt, inland } from '../field/beach';
import { STEP_METERS, cricket, rustle, startWind, type AudioGraph } from './fieldSounds';

/**
 * Звуки пляжа: прибой (громче у воды, тише на дюнах), чайки днём, сверчки в дюнах ночью, лёгкий ветер,
 * шаги по песку и плеск, когда идёте по воде. Всё синтезируется (Web Audio), как и звуки поля.
 */

/**
 * Прибой: два слоя одного шума — низкий гул наката и шипение пены, когда волна растекается по песку.
 * Каждые 6–9 секунд — новая волна: гул нарастает и спадает, следом шипит откат. Общая громкость — от расстояния до воды.
 */
function startSurf({ ctx, master, noise }: AudioGraph) {
  const distance = ctx.createGain();
  distance.gain.value = 0;
  distance.connect(master);

  const rumbleSource = ctx.createBufferSource();
  rumbleSource.buffer = noise;
  rumbleSource.loop = true;
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 380;
  const rumble = ctx.createGain();
  rumble.gain.value = 0.04;
  rumbleSource.connect(rumbleFilter).connect(rumble).connect(distance);

  const hissSource = ctx.createBufferSource();
  hissSource.buffer = noise;
  hissSource.loop = true;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'bandpass';
  hissFilter.frequency.value = 2600;
  hissFilter.Q.value = 0.5;
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  hissSource.connect(hissFilter).connect(hiss).connect(distance);

  rumbleSource.start();
  // Второй слой — с другого места буфера, чтобы шумы не совпадали.
  hissSource.start(ctx.currentTime, 0.7);

  let timer = 0;
  const wave = () => {
    const at = ctx.currentTime;
    const size = 0.7 + Math.random() * 0.5;
    // Накат: гул поднимается за секунду и медленно спадает.
    rumble.gain.cancelScheduledValues(at);
    rumble.gain.setTargetAtTime(0.2 * size, at, 0.45);
    rumble.gain.setTargetAtTime(0.05, at + 1.3, 1.4);
    rumbleFilter.frequency.setTargetAtTime(520 + size * 200, at, 0.5);
    rumbleFilter.frequency.setTargetAtTime(330, at + 1.3, 1.5);
    // Пена растекается по песку и шипит, уходя.
    hiss.gain.cancelScheduledValues(at);
    hiss.gain.setTargetAtTime(0.09 * size, at + 0.9, 0.35);
    hiss.gain.setTargetAtTime(0, at + 2.1, 1.1);
    hissFilter.frequency.setTargetAtTime(3200, at + 0.9, 0.3);
    hissFilter.frequency.setTargetAtTime(1700, at + 2.1, 1.2);
    timer = window.setTimeout(wave, 6000 + Math.random() * 3000);
  };
  wave();

  return {
    /** Вблизи воды прибой громкий, в дюнах — далёкий шум (и глуше). */
    setDistance: (meters: number) => {
      const level = Math.max(0.12, Math.min(1, 1.15 - meters / 55));
      distance.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
    },
    stop: () => {
      window.clearTimeout(timer);
      distance.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      rumbleSource.stop(ctx.currentTime + 1.5);
      hissSource.stop(ctx.currentTime + 1.5);
    },
  };
}

/** Крик чайки: два-три «кьяу» — резкий тон, который взлетает и опадает, издалека и сбоку. */
function gull({ ctx, master }: AudioGraph, loudness: number) {
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.8 - 0.9;
  pan.connect(master);
  const pitch = 0.85 + Math.random() * 0.3;
  const calls = 2 + Math.floor(Math.random() * 3);
  let at = ctx.currentTime + 0.05;
  for (let i = 0; i < calls; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600 * pitch;
    filter.Q.value = 2.5;
    const length = 0.28 + Math.random() * 0.12;
    osc.frequency.setValueAtTime(1350 * pitch, at);
    osc.frequency.linearRampToValueAtTime(1900 * pitch, at + 0.06);
    osc.frequency.exponentialRampToValueAtTime(1000 * pitch, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.022 * loudness, at + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(filter).connect(env).connect(pan);
    osc.start(at);
    osc.stop(at + length + 0.02);
    at += length + 0.08 + Math.random() * 0.12;
  }
}

/** Шлёп по воде: шум пониже и подольше, чем шаг по песку. */
function splash({ ctx, master, noise }: AudioGraph, gain: number) {
  const at = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 700 + Math.random() * 500;
  filter.Q.value = 0.8;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.3 + Math.random() * 0.1);
  source.connect(filter).connect(env).connect(master);
  source.start(at, Math.random() * 1.5);
  source.stop(at + 0.5);
}

/** Включить звуки пляжа. graph() — звуковой граф (null, пока звук не разблокирован нажатием). */
export function startBeachSounds(graph: () => AudioGraph | null) {
  let surf: ReturnType<typeof startSurf> | null = null;
  let stopWind: (() => void) | null = null;
  let last = { x: walker.x, z: walker.z };
  let walked = 0;
  let nextLife = performance.now() + 3000;

  const tick = window.setInterval(() => {
    const audio = graph();
    if (!audio) return;
    surf ??= startSurf(audio);
    stopWind ??= startWind(audio, 0.6);
    surf.setDistance(Math.max(0, inland(walker.x, walker.z)));

    walked += Math.hypot(walker.x - last.x, walker.z - last.z);
    last = { x: walker.x, z: walker.z };
    if (walked > 5) walked = 0;
    if (walked >= STEP_METERS) {
      walked -= STEP_METERS;
      if (heightAt(walker.x, walker.z) < -0.02) splash(audio, 0.3);
      else rustle(audio, 0.2, Math.random() * 0.3 - 0.15, 900);
    }

    // Днём кричат чайки, ночью в дюнах стрекочут сверчки.
    const now = performance.now();
    if (now >= nextLife) {
      const day = liveLighting.daylight;
      const dunes = inland(walker.x, walker.z) > 15;
      if (day > 0.35 && Math.random() < day * 0.8) gull(audio, day);
      else if (day < 0.3 && dunes) cricket(audio, 1 - day);
      nextLife = now + (day < 0.3 ? 1500 + Math.random() * 2500 : 5000 + Math.random() * 9000);
    }
  }, 100);

  return () => {
    window.clearInterval(tick);
    surf?.stop();
    stopWind?.();
  };
}
