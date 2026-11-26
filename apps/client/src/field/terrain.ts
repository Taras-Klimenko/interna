import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import nature from './nature.generated.json';

/** Размеры моделей природы (пишет assets/scripts/build-nature.mjs). */
export const NATURE: Record<string, { kind: string; height: number; radius: number }> = nature;

/**
 * Поле за домом: бесконечное, но одинаковое при каждом визите — всё выводится из «зерна» шумом,
 * хранить ничего не нужно. Мир нарезан на квадраты (чанки): рядом с вами они строятся, вдали — выгружаются.
 */

/** Сторона чанка в метрах. */
export const CHUNK_SIZE = 24;
/** Сколько чанков земли вокруг вас (во все стороны): 2 → 5×5. Дальше — туман. */
export const GROUND_RADIUS = 2;
/** В скольких чанках вокруг растут трава и цветы: 1 → 3×3 (вдали их всё равно не разглядеть). */
export const GRASS_RADIUS = 1;
/** Туман: с какой дистанции начинается и где мир полностью растворяется. */
export const FOG_NEAR = 22;
export const FOG_FAR = 58;

const SEED = 20261127;

/** Детерминированный генератор случайных чисел (mulberry32): одно зерно — одна и та же последовательность. */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Зерно чанка: у каждого квадрата своя, но всегда одинаковая раскладка травы и цветов. */
export function chunkSeed(cx: number, cz: number) {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ SEED) >>> 0;
}

const noise = new SimplexNoise({ random: random(SEED) });

/** Высота земли в точке: пологие холмы, у дома (около нуля) — почти ровно. */
export function heightAt(x: number, z: number) {
  const hills = noise.noise(x / 70, z / 70) * 2.4 + noise.noise(x / 23, z / 23) * 0.55 + noise.noise(x / 9, z / 9) * 0.12;
  // У дома земля ровная, дальше холмы набирают силу.
  const calm = Math.min(1, Math.hypot(x, z) / 18);
  return hills * calm;
}

/** Где растут цветы: 0 — нет, 1 — густая поляна. Поляны крупные, с мягкими краями. */
export function flowerDensity(x: number, z: number) {
  const value = noise.noise(x / 16 + 40, z / 16 - 40) * 0.7 + noise.noise(x / 5, z / 5) * 0.3;
  return Math.max(0, Math.min(1, (value - 0.05) * 1.8));
}

/** Оттенок травы: где сочнее, где суше — чтобы поле не было одноцветным. */
export function lushness(x: number, z: number) {
  return 0.5 + noise.noise(x / 30 - 13, z / 30 + 7) * 0.5;
}

/** Ключ чанка и его координаты по позиции в мире. */
export function chunkOf(x: number, z: number) {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) };
}

/**
 * Крупное в поле — деревья, кусты и камни. Ставятся редко, по «зерну» чанка, и с ними сталкиваются:
 * один и тот же список видит и Chunk (что рисовать), и canStandAt (куда нельзя пройти).
 * Модели — из nature.glb (Stylized Nature MegaKit, см. assets/scripts/build-nature.mjs).
 */
export interface Obstacle {
  /** Имя модели в nature.glb. */
  model: string;
  x: number;
  z: number;
  rotation: number;
  /** Дополнительный масштаб: деревья разного роста. */
  scale: number;
  /** Радиус для столкновений (ствол, камень, куст). */
  radius: number;
}

const TREES = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'];
const PINES = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'];
const BUSHES = ['Bush_Common_Flowers'];
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];

/** Сетка, по ячейкам которой расставляем: в каждой — максимум одно дерево. */
const TREE_CELL = 12;
const TREE_CHANCE = 0.34;
const BUSH_CHANCE = 0.45;
const ROCK_CHANCE = 0.2;
/** Стволы тонкие: сталкиваемся со стволом, а не с кроной. */
const TRUNK_RADIUS = 0.35;
/** У дома — открытая поляна. */
const CLEARING = 10;

const pick = <T>(list: T[], value: number) => list[Math.min(list.length - 1, Math.floor(value * list.length))]!;

function obstaclesOf(cx: number, cz: number): Obstacle[] {
  const result: Obstacle[] = [];
  const perSide = CHUNK_SIZE / TREE_CELL;
  for (let i = 0; i < perSide; i++) {
    for (let j = 0; j < perSide; j++) {
      const gx = cx * perSide + i;
      const gz = cz * perSide + j;
      const rnd = random(chunkSeed(gx * 7 + 3, gz * 11 - 5));
      const spot = () => ({ x: (gx + 0.15 + rnd() * 0.7) * TREE_CELL, z: (gz + 0.15 + rnd() * 0.7) * TREE_CELL });

      if (rnd() < TREE_CHANCE) {
        const { x, z } = spot();
        if (Math.hypot(x, z) >= CLEARING) {
          const scale = 0.8 + rnd() * 0.45;
          const model = rnd() < 0.35 ? pick(PINES, rnd()) : pick(TREES, rnd());
          result.push({ model, x, z, rotation: rnd() * Math.PI * 2, scale, radius: TRUNK_RADIUS * scale });
        }
      }
      if (rnd() < BUSH_CHANCE) {
        const { x, z } = spot();
        if (Math.hypot(x, z) >= CLEARING * 0.6) {
          const scale = 0.75 + rnd() * 0.5;
          const model = pick(BUSHES, rnd());
          result.push({ model, x, z, rotation: rnd() * Math.PI * 2, scale, radius: (NATURE[model]?.radius ?? 0.5) * 0.6 * scale });
        }
      }
      if (rnd() < ROCK_CHANCE) {
        const { x, z } = spot();
        if (Math.hypot(x, z) >= CLEARING * 0.6) {
          const scale = 0.6 + rnd() * 0.8;
          const model = pick(ROCKS, rnd());
          result.push({ model, x, z, rotation: rnd() * Math.PI * 2, scale, radius: (NATURE[model]?.radius ?? 0.6) * 0.75 * scale });
        }
      }
    }
  }
  // Ничего не ставим вплотную друг к другу: куст не растёт из ствола.
  return result.filter((a, index) => !result.some((b, j) => j < index && Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius + 0.6));
}

/** Раскладку считаем один раз на чанк: столкновения спрашивают её каждый кадр. */
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

/** Можно ли здесь стоять: не в стволе, не в кусте, не в камне. */
export function canStandAt(x: number, z: number, radius: number) {
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
