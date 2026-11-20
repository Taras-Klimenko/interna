import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * Вариант пола или обоев. Текстура рисуется в canvas прямо в браузере: это пара килобайт кода
 * вместо картинок, и узор всегда совпадает с тем, что видно на образце в панели.
 */
export interface SurfaceStyle {
  id: string;
  name: string;
  /** Сколько метров занимает один повтор узора. */
  tile: number;
  draw: (ctx: CanvasRenderingContext2D, size: number, random: () => number) => void;
}

const SIZE = 256;

/** Случайность с зерном: узор одинаковый при каждом запуске. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Цвет, чуть светлее или темнее исходного: amount от -1 до 1. */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 + amount;
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

/** Лёгкий шум, чтобы однотонная поверхность не выглядела пластиковой. */
function speckle(ctx: CanvasRenderingContext2D, size: number, random: () => number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
}

/** Доски: ряды поперёк, стыки в разных местах, у каждой доски свой оттенок. Узор повторяется без шва. */
function planks(base: string, rows: number) {
  return (ctx: CanvasRenderingContext2D, size: number, random: () => number) => {
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      // Стыки досок в ряду: от одного до двух, со случайным сдвигом.
      const joints = [random() * size];
      if (random() < 0.6) joints.push((joints[0]! + size * (0.4 + random() * 0.2)) % size);
      joints.sort((a, b) => a - b);
      const starts = [...joints, joints[0]! + size];
      for (let i = 0; i < joints.length; i++) {
        ctx.fillStyle = shade(base, (random() - 0.5) * 0.14);
        const x0 = starts[i]!;
        const x1 = starts[i + 1]!;
        // Доска, которая переходит через правый край, дорисовывается слева.
        ctx.fillRect(x0, y, x1 - x0, rowH);
        ctx.fillRect(x0 - size, y, x1 - x0, rowH);
        // Волокна дерева.
        ctx.strokeStyle = 'rgba(60, 35, 15, 0.07)';
        ctx.lineWidth = 1;
        for (let g = 0; g < 3; g++) {
          const gy = y + rowH * (0.2 + random() * 0.6);
          ctx.beginPath();
          ctx.moveTo(x0, gy);
          ctx.lineTo(x1, gy + (random() - 0.5) * 3);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(50, 30, 15, 0.35)';
      ctx.fillRect(0, y, size, 1.5);
      for (const x of joints) ctx.fillRect(x, y, 1.5, rowH);
    }
  };
}

export const FLOOR_STYLES: SurfaceStyle[] = [
  { id: 'oak', name: 'Светлый дуб', tile: 1, draw: planks('#d9b48a', 5) },
  { id: 'walnut', name: 'Орех', tile: 1, draw: planks('#8f6243', 5) },
  {
    id: 'tile',
    name: 'Плитка',
    tile: 1,
    draw: (ctx, size, random) => {
      const n = 4;
      const cell = size / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          ctx.fillStyle = shade((x + y) % 2 ? '#e2d3bb' : '#f1e8da', (random() - 0.5) * 0.04);
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
      speckle(ctx, size, random, 500, 0.04);
      ctx.fillStyle = '#c4b298';
      for (let i = 0; i < n; i++) {
        ctx.fillRect(i * cell - 1, 0, 2, size);
        ctx.fillRect(0, i * cell - 1, size, 2);
      }
    },
  },
  {
    id: 'carpet',
    name: 'Ковролин',
    tile: 0.5,
    draw: (ctx, size, random) => {
      ctx.fillStyle = '#93a39a';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, random, 2500, 0.06);
    },
  },
];

export const WALL_STYLES: SurfaceStyle[] = [
  {
    id: 'cream',
    name: 'Сливочные',
    tile: 1,
    draw: (ctx, size, random) => {
      ctx.fillStyle = '#f1e4d3';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, random, 600, 0.025);
    },
  },
  {
    id: 'sage',
    name: 'Шалфей',
    tile: 1,
    draw: (ctx, size, random) => {
      ctx.fillStyle = '#cfd8c0';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, random, 600, 0.03);
    },
  },
  {
    id: 'stripes',
    name: 'Полоски',
    tile: 0.5,
    draw: (ctx, size, random) => {
      ctx.fillStyle = '#f4e7d8';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#ead0c2';
      for (let i = 0; i < 2; i++) ctx.fillRect(i * (size / 2) + size * 0.08, 0, size * 0.16, size);
      ctx.fillStyle = 'rgba(190, 140, 120, 0.35)';
      for (let i = 0; i < 2; i++) ctx.fillRect(i * (size / 2) + size * 0.34, 0, 2, size);
      speckle(ctx, size, random, 400, 0.025);
    },
  },
  {
    id: 'dots',
    name: 'Голубые в горошек',
    tile: 0.5,
    draw: (ctx, size, random) => {
      // Тёплый свет комнаты приглушает голубой, поэтому цвет насыщеннее, чем хочется видеть.
      ctx.fillStyle = '#a9c4de';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, random, 400, 0.025);
      ctx.fillStyle = '#f7f3ea';
      const step = size / 4;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          // Каждый второй ряд сдвинут на полшага: горошек в шахматном порядке.
          const cx = (x + (y % 2) * 0.5) * step + step / 4;
          const cy = y * step + step / 2;
          for (const dx of [0, -size]) {
            ctx.beginPath();
            ctx.arc(cx + dx, cy, size * 0.04, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    },
  },
];

export function floorStyle(id: string) {
  return FLOOR_STYLES.find((s) => s.id === id) ?? FLOOR_STYLES[0]!;
}

export function wallStyle(id: string) {
  return WALL_STYLES.find((s) => s.id === id) ?? WALL_STYLES[0]!;
}

const canvases = new Map<SurfaceStyle, HTMLCanvasElement>();
const textures = new Map<SurfaceStyle, CanvasTexture>();
const previews = new Map<SurfaceStyle, string>();

function canvasOf(style: SurfaceStyle) {
  let canvas = canvases.get(style);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    style.draw(canvas.getContext('2d')!, SIZE, seeded(style.id.length * 977 + 13));
    canvases.set(style, canvas);
  }
  return canvas;
}

/** Текстура варианта, одна на все поверхности. Повтор под размер стены — у копии (см. Room). */
export function surfaceTexture(style: SurfaceStyle) {
  let texture = textures.get(style);
  if (!texture) {
    texture = new CanvasTexture(canvasOf(style));
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    textures.set(style, texture);
  }
  return texture;
}

/** Картинка для образца в панели. */
export function surfacePreview(style: SurfaceStyle) {
  let url = previews.get(style);
  if (!url) {
    url = canvasOf(style).toDataURL();
    previews.set(style, url);
  }
  return url;
}
