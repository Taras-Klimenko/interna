import { z } from 'zod';
import { ChatContext } from './chat.schema.js';

/**
 * События в комнате, на которые персонаж откликается сам, без вопроса хозяина: хозяин вернулся после перерыва,
 * поставил книгу, повесил фото… Замечает их клиент, а текст для модели собирается здесь —
 * из проверенных полей, а не из произвольной строки.
 */

const text = (max: number) => z.string().trim().transform((value) => value.slice(0, max));
const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).transform((items) => items.slice(0, max));

export const RoomEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visit'), hoursAway: z.number().min(0).max(24 * 365) }),
  z.object({ type: z.literal('newBooks'), books: list(z.object({ title: text(200), author: text(120) }), 10) }),
  z.object({ type: z.literal('newPhoto'), caption: text(300) }),
  z.object({ type: z.literal('newTracks'), titles: list(text(200), 10) }),
  z.object({ type: z.literal('newObjects'), names: list(text(60), 10) }),
  z.object({ type: z.literal('silence'), minutes: z.number().int().min(0).max(100_000) }),
]);
export type RoomEvent = z.infer<typeof RoomEvent>;

export const SendEventBody = z.object({
  events: z.array(RoomEvent).min(1).max(6),
  context: ChatContext,
});

const quote = (items: string[]) => items.map((item) => `«${item}»`).join(', ');

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function hoursText(hours: number) {
  if (hours >= 48) {
    const days = Math.round(hours / 24);
    return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
  }
  const rounded = Math.max(1, Math.round(hours));
  return `${rounded} ${plural(rounded, 'час', 'часа', 'часов')}`;
}

/** Событие словами. Этот же текст видит хозяин в истории чата, поэтому без «хозяина» в третьем лице. */
export function describeEvent(event: RoomEvent): string {
  switch (event.type) {
    case 'visit':
      return `Возвращение после перерыва: прошло около ${hoursText(event.hoursAway)}`;
    case 'newBooks':
      return `На полке ${event.books.length > 1 ? 'новые книги' : 'новая книга'}: ${event.books
        .map((book) => `«${book.title}»${book.author ? ` — ${book.author}` : ''}`)
        .join(', ')}`;
    case 'newPhoto':
      return event.caption ? `На стене новое фото: «${event.caption}»` : 'На стене новое фото (без подписи)';
    case 'newTracks':
      return `В плейлисте ${event.titles.length > 1 ? 'новые треки' : 'новый трек'}: ${quote(event.titles)}`;
    case 'newObjects':
      return `В комнате ${event.names.length > 1 ? 'новые вещи' : 'новая вещь'}: ${event.names.join(', ')}`;
    case 'silence':
      return `Давно тихо: ${event.minutes} мин без разговора`;
  }
}

/** «Вернулись» — первым: остальное хозяин мог сделать уже после возвращения. */
export function describeEvents(events: RoomEvent[]) {
  const ordered = [...events].sort((a, b) => Number(b.type === 'visit') - Number(a.type === 'visit'));
  return ordered.map(describeEvent).join('. ') + '.';
}
