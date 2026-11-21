import { z } from 'zod';

/** Длинное не отклоняем, а обрезаем: заметка к книге может оказаться длинной. */
const text = (max: number) => z.string().trim().transform((value) => value.slice(0, max));
const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).transform((items) => items.slice(0, max));

/**
 * Что сейчас в комнате — собирает клиент: он знает живое состояние (что играет, какой час, где хозяин).
 * Длины ограничены (лишнее обрезается), чтобы описание комнаты не раздуло запрос к модели.
 */
export const ChatContext = z.object({
  characterName: z.string().trim().min(1).transform((value) => value.slice(0, 40)),
  /** Час в комнате, 0–23 (с учётом выбранного времени суток). */
  hour: z.number().int().min(0).max(23),
  /** Хозяин гуляет по комнате от первого лица. */
  ownerInside: z.boolean(),
  objects: list(z.object({ name: text(60), state: text(160).optional() }), 80),
  books: list(
    z.object({
      title: text(200),
      author: text(120),
      note: text(500),
      /** Сколько прочитано, в процентах. */
      percent: z.number().min(0).max(100).optional(),
    }),
    100,
  ),
  playlist: list(text(200), 100),
  nowPlaying: text(200).optional(),
  photos: list(text(300), 30),
});
export type ChatContext = z.infer<typeof ChatContext>;

export const SendChatBody = z.object({
  message: z.string().trim().min(1).max(2000),
  context: ChatContext,
});
