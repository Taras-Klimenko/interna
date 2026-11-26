import { liveLighting } from '../scene/DayLight';
import { walker } from '../field/fieldState';

/**
 * Звуки поля: ветер с порывами, птицы днём, сверчки ночью, шуршание травы под ногами.
 * Как и звуки комнаты, всё синтезируется на лету (Web Audio) и идёт через общую громкость звуков комнаты.
 */

export interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

/** Шаг по траве — каждые столько метров (бегом шаги чаще сами собой). */
const STEP_METERS = 0.75;

/** Короткий шорох травы: высокий шум с быстрым спадом, в каждой стороне чуть по-своему. */
function rustle({ ctx, master, noise }: AudioGraph, gain: number, pan: number) {
  const at = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800 + Math.random() * 1600;
  filter.Q.value = 0.9;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.16 + Math.random() * 0.06);
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  source.connect(filter).connect(env).connect(panner).connect(master);
  source.start(at, Math.random() * 1.5);
  source.stop(at + 0.3);
}

/** Птичья трель: несколько быстрых свистов-глиссандо с одной стороны. */
function birdSong({ ctx, master }: AudioGraph, loudness: number) {
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(master);
  const base = 2200 + Math.random() * 1800;
  const notes = 2 + Math.floor(Math.random() * 5);
  let at = ctx.currentTime + 0.05;
  for (let i = 0; i < notes; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const from = base * (0.85 + Math.random() * 0.3);
    const to = from * (Math.random() < 0.5 ? 1.35 : 0.75);
    const length = 0.06 + Math.random() * 0.1;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.05 * loudness, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(env).connect(pan);
    osc.start(at);
    osc.stop(at + length + 0.02);
    at += length + 0.03 + Math.random() * 0.08;
  }
}

/** Стрёкот сверчка: высокий тон, который быстро «щёлкает» несколькими пачками. */
function cricket({ ctx, master }: AudioGraph, loudness: number) {
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.8 - 0.9;
  pan.connect(master);
  const freq = 4200 + Math.random() * 900;
  let at = ctx.currentTime + 0.05;
  const bursts = 2 + Math.floor(Math.random() * 3);
  for (let b = 0; b < bursts; b++) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.value = 0;
    // Пачка из 4–6 «щелчков» по 25 мс.
    const clicks = 4 + Math.floor(Math.random() * 3);
    for (let c = 0; c < clicks; c++) {
      const t = at + c * 0.028;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.03 * loudness, t + 0.006);
      env.gain.linearRampToValueAtTime(0, t + 0.02);
    }
    osc.connect(env).connect(pan);
    osc.start(at);
    osc.stop(at + clicks * 0.028 + 0.03);
    at += clicks * 0.028 + 0.18 + Math.random() * 0.12;
  }
}

/** Ветер: ровный низкий шум, громкость и тембр которого медленно «гуляют» — порывы. */
function startWind({ ctx, master, noise }: AudioGraph) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(master);
  source.start();
  // Порывы: раз в несколько секунд новая громкость и «высота» ветра, плавный переход.
  const gust = () => {
    const night = 1 - liveLighting.daylight;
    const level = (0.07 + Math.random() * 0.1) * (1 - night * 0.45);
    gain.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
    filter.frequency.setTargetAtTime(300 + Math.random() * 500, ctx.currentTime, 1.5);
  };
  gust();
  const timer = window.setInterval(gust, 3500);
  return () => {
    window.clearInterval(timer);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    source.stop(ctx.currentTime + 1.5);
  };
}

/** Включить звуки поля. graph() — доступ к звуковому графу (null, пока звук не разблокирован нажатием). */
export function startFieldSounds(graph: () => AudioGraph | null) {
  let stopWind: (() => void) | null = null;
  let last = { x: walker.x, z: walker.z };
  let walked = 0;
  let nextLife = performance.now() + 1500;

  const tick = window.setInterval(() => {
    const audio = graph();
    if (!audio) return;
    if (!stopWind) stopWind = startWind(audio);

    // Шаги: по пройденному расстоянию.
    walked += Math.hypot(walker.x - last.x, walker.z - last.z);
    last = { x: walker.x, z: walker.z };
    if (walked > 5) walked = 0; // телепорт или переезд — не «топаем» очередью
    if (walked >= STEP_METERS) {
      walked -= STEP_METERS;
      rustle(audio, 0.32, Math.random() * 0.3 - 0.15);
    }

    // Птицы днём, сверчки ночью — время от времени, с разных сторон.
    const now = performance.now();
    if (now >= nextLife) {
      const day = liveLighting.daylight;
      if (day > 0.35 && Math.random() < day) birdSong(audio, day);
      else if (day < 0.3) for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) cricket(audio, 1 - day);
      nextLife = now + (day < 0.3 ? 900 + Math.random() * 1800 : 2500 + Math.random() * 5000);
    }
  }, 100);

  return () => {
    window.clearInterval(tick);
    stopWind?.();
  };
}
