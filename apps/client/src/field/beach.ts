import { Color } from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { CHUNK_SIZE, NATURE, chunkOf, chunkSeed, random, type Obstacle } from './terrain';

/**
 * Пляж: бесконечный морской берег. Берег тянется вдоль оси z и плавно петляет; море — в сторону +x,
 * суша — в сторону −x: полоса песка, за ней дюны с сухой травой и пальмами. Как и поле, всё выводится из «зерна»:
 * хранить ничего не нужно, и каждый раз берег тот же.
 * Уровень моря — y = 0. У берега можно зайти в воду примерно по колено.
 */

const SEED = 20261128;
const noise = new SimplexNoise({ random: random(SEED) });

/** Глубже этого в воду не зайти (вода по колено). */
export const WADE_DEPTH = 0.45;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Где проходит кромка воды на этой «широте»: x берега плавно гуляет туда-сюда — бухты и мысы. */
export function shoreX(z: number) {
  return noise.noise(z / 90, 3.1) * 10 + noise.noise(z / 26, 7.7) * 2.5;
}

/** Сколько метров до воды: больше нуля — суша, меньше — море. */
export const inland = (x: number, z: number) => shoreX(z) - x;

/** Дюны: сколько их «проступает» в этой точке суши (0 — пляж, 1 — гряда дюн). */
const duneMask = (d: number) => smoothstep(16, 34, d);

/** Высота песка и дна. */
export function heightAt(x: number, z: number) {
  const d = inland(x, z);
  // Мелкая песчаная рябь — одна и та же на суше и под водой, без ступеньки на кромке.
  const ripple = noise.noise(x / 2.5, z / 2.5) * 0.025;
  if (d < 0) {
    // Дно: пологая отмель, дальше обрыв в глубину.
    const out = -d;
    return -(out * 0.07 + Math.max(0, out - 7) * 0.22) + ripple;
  }
  const dunes = (noise.noise(x / 17, z / 17) * 0.5 + 0.5) * 2.4 + noise.noise(x / 6.5, z / 6.5) * 0.35;
  return d * 0.045 + duneMask(d) * dunes + ripple;
}

/** Где на дюнах растёт трава (0 — голый песок, 1 — густо). */
export function grassiness(x: number, z: number) {
  const d = inland(x, z);
  const patches = noise.noise(x / 9 + 50, z / 9 - 20) * 0.5 + 0.5;
  return duneMask(d) * Math.max(0, Math.min(1, (patches - 0.25) * 1.8));
}

const WET_SAND = new Color('#a98b60');
const DRY_SAND = new Color('#ead6a7');
const DUNE_SAND = new Color('#dfc792');
const DUNE_GRASS = new Color('#a9a865');
const SHALLOW_BED = new Color('#c9b48a');
const DEEP_BED = new Color('#2f5d68');

/** Цвет песка и дна: у воды — мокрый и темнее, на дюнах — с зеленью, под водой — темнеет с глубиной. */
export function groundColor(x: number, z: number, target: Color) {
  const d = inland(x, z);
  if (d < 0) return target.copy(SHALLOW_BED).lerp(DEEP_BED, smoothstep(0, 3.5, -heightAt(x, z))).lerp(WET_SAND, smoothstep(-1.2, 0, d) * 0.6);
  target.copy(WET_SAND).lerp(DRY_SAND, smoothstep(1.2, 5, d));
  target.lerp(DUNE_SAND, duneMask(d));
  return target.lerp(DUNE_GRASS, grassiness(x, z) * 0.55);
}

// --- Крупное: пальмы и камни ------------------------------------------------------------------------------

/** Пальмы — свои (palm.ts), имя модели «palm:номер варианта». */
export const PALM_VARIANTS = 3;
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];

const CELL = 11;
const PALM_TRUNK = 0.3;
/** Вокруг места, куда приходите, — свободно. */
const CLEARING = 6;

function obstaclesOf(cx: number, cz: number): Obstacle[] {
  const result: Obstacle[] = [];
  const perSide = Math.ceil(CHUNK_SIZE / CELL);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  for (let i = 0; i < perSide; i++) {
    for (let j = 0; j < perSide; j++) {
      const rnd = random(chunkSeed(cx * 13 + i * 5 + 1, cz * 17 + j * 3 - 9) ^ SEED);
      const spot = () => ({ x: ox + (i + 0.1 + rnd() * 0.8) * (CHUNK_SIZE / perSide), z: oz + (j + 0.1 + rnd() * 0.8) * (CHUNK_SIZE / perSide) });
      const nearStart = (x: number, z: number) => Math.hypot(x - BEACH_START.x, z - BEACH_START.z) < CLEARING;

      // Пальмы — над полосой прибоя и на дюнах, чаще всего у верхнего края пляжа.
      {
        const { x, z } = spot();
        const d = inland(x, z);
        const chance = d < 9 ? 0 : d < 26 ? 0.5 : 0.22;
        if (rnd() < chance && !nearStart(x, z)) {
          const scale = 0.85 + rnd() * 0.35;
          result.push({ model: `palm:${Math.floor(rnd() * PALM_VARIANTS)}`, x, z, rotation: rnd() * Math.PI * 2, scale, radius: PALM_TRUNK * scale });
        }
      }
      // Камни — у кромки воды (часть в воде) и изредка на дюнах.
      {
        const { x, z } = spot();
        const d = inland(x, z);
        const chance = d > -4 && d < 3 ? 0.3 : d > 20 ? 0.08 : 0;
        if (rnd() < chance && !nearStart(x, z)) {
          const scale = 0.6 + rnd() * 1.1;
          const model = ROCKS[Math.floor(rnd() * ROCKS.length)]!;
          result.push({ model, x, z, rotation: rnd() * Math.PI * 2, scale, radius: (NATURE[model]?.radius ?? 0.7) * 0.75 * scale });
        }
      }
    }
  }
  return result.filter((a, index) => !result.some((b, j) => j < index && Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius + 1.2));
}

const cache = new Map<string, Obstacle[]>();
const CACHE_LIMIT = 256;

export function obstaclesInChunk(cx: number, cz: number): Obstacle[] {
  const key = `${cx}:${cz}`;
  let list = cache.get(key);
  if (!list) {
    list = obstaclesOf(cx, cz);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, list);
  }
  return list;
}

/** Можно ли здесь стоять: не в пальме и не в камне, и вода не выше колена. */
export function canStandAt(x: number, z: number, radius: number) {
  if (heightAt(x, z) < -WADE_DEPTH) return false;
  const { cx, cz } = chunkOf(x, z);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const obstacle of obstaclesInChunk(cx + i, cz + j)) {
        if (Math.hypot(obstacle.x - x, obstacle.z - z) < obstacle.radius + radius) return false;
      }
    }
  }
  return true;
}

/** Откуда начинается прогулка: на песке метрах в двенадцати от воды, лицом к морю и чуть вдоль берега. */
export const BEACH_START = { x: shoreX(0) - 12, z: 0, yaw: -Math.PI / 2 + 0.55 };
