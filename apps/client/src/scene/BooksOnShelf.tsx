import { useMemo } from 'react';
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
      color: SPINE_COLORS[h % SPINE_COLORS.length]!,
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
          <meshStandardMaterial color={b.color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
