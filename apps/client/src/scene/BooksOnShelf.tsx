import { useMemo } from 'react';
import { CanvasTexture, Color, SRGBColorSpace } from 'three';
import type { Book } from '@interna/shared';
import type { ShelfLayout } from '../catalog/catalog';

/** Приглушённые цвета корешков под общую тёплую палитру комнаты. */
const SPINE_COLORS = ['#a8574a', '#4f6d7a', '#c9a15f', '#6b8e5a', '#8a5a7a', '#d08c60', '#3f5a4a', '#b5651d', '#7a8fa6', '#9c6b4e'];

/** Небольшой детерминированный хэш: у книги всегда один и тот же цвет и размер. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface PlacedBook {
  id: string;
  title: string;
  color: string;
  size: [number, number, number];
  position: [number, number, number];
}

function layoutBooks(books: Book[], layout: ShelfLayout): PlacedBook[] {
  const result: PlacedBook[] = [];
  const left = -layout.width / 2 + 0.02;
  let cursor = left;
  books.forEach((book, i) => {
    const level = layout.levels[Math.floor(i / layout.perShelf)];
    if (level === undefined) return;
    if (i % layout.perShelf === 0) cursor = left;
    const h = hash(book.id);
    const thickness = 0.03 + ((h >>> 4) % 26) / 1000; // 3–5,5 см
    const height = Math.min(layout.clearance - 0.02, 0.16 + ((h >>> 9) % 60) / 1000);
    const depth = 0.15 + ((h >>> 15) % 40) / 1000;
    result.push({
      id: book.id,
      title: book.title,
      color: book.color ?? SPINE_COLORS[h % SPINE_COLORS.length]!,
      size: [thickness, height, depth],
      position: [cursor + thickness / 2, level + height / 2, layout.backZ + depth / 2],
    });
    cursor += thickness + 0.004;
  });
  return result;
}

/** Книги пользователя на полках шкафа: по корешку на книгу, в порядке добавления. */
export function BooksOnShelf({ books, layout }: { books: Book[]; layout: ShelfLayout }) {
  const placed = useMemo(() => layoutBooks(books, layout), [books, layout]);
  return (
    <group>
      {placed.map((b) => (
        <mesh key={b.id} position={b.position} castShadow receiveShadow raycast={() => null}>
          <boxGeometry args={b.size} />
          {/* Грани коробки: +x, −x, верх, низ, корешок (+z, к комнате), обрез у стенки. */}
          <meshStandardMaterial attach="material-0" color={b.color} roughness={0.85} />
          <meshStandardMaterial attach="material-1" color={b.color} roughness={0.85} />
          <meshStandardMaterial attach="material-2" color="#efe6d6" roughness={0.9} />
          <meshStandardMaterial attach="material-3" color="#efe6d6" roughness={0.9} />
          <meshStandardMaterial attach="material-4" map={spineTexture(b.title, b.color, b.size)} roughness={0.8} />
          <meshStandardMaterial attach="material-5" color={b.color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

const spines = new Map<string, CanvasTexture>();
/** Пикселей на метр корешка: книжка в 20 см — 256 пикселей в высоту. */
const SPINE_PX_PER_M = 1280;

/**
 * Корешок: цвет книги, тонкие полоски сверху и снизу и название снизу вверх, как на русских книгах.
 * Одна текстура на книгу (по названию, цвету и размеру), перерисовывается, только если они изменились.
 */
function spineTexture(title: string, color: string, size: [number, number, number]) {
  const key = `${title}|${color}|${size[0]}|${size[1]}`;
  const cached = spines.get(key);
  if (cached) return cached;

  const w = Math.max(16, Math.round(size[0] * SPINE_PX_PER_M));
  const h = Math.round(size[1] * SPINE_PX_PER_M);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);

  // Светлый корешок — тёмные буквы, тёмный — светлые.
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(color).getHSL(hsl, SRGBColorSpace);
  const ink = hsl.l > 0.6 ? 'rgba(40, 30, 25, 0.85)' : 'rgba(255, 246, 228, 0.9)';
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.55;
  for (const y of [h * 0.07, h * 0.93 - 3]) ctx.fillRect(0, y, w, 3);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 2);
  const fontSize = Math.round(w * 0.5);
  ctx.font = `600 ${fontSize}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, title, h * 0.74), 0, 1);
  ctx.restore();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  spines.set(key, texture);
  return texture;
}

/** Обрезает текст с многоточием, чтобы он влез в ширину. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
