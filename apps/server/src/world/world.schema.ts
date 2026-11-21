import { z } from 'zod';

/**
 * Проверка мира от клиента. Подробное устройство мира (состояние предметов, книги, плейлисты) знает клиент,
 * а сервер проверяет каркас: что это действительно мир, а не что попало, и что он не раздут.
 * Неизвестные поля сохраняются как есть, чтобы новая версия клиента не теряла данные на старом сервере.
 */
const Cell = z.object({ x: z.number().int().min(0).max(200), z: z.number().int().min(0).max(200) });

export const WorldSchema = z.looseObject({
  id: z.string().max(100),
  room: z.looseObject({
    size: z.object({ w: z.number().int().min(1).max(100), h: z.number().int().min(1).max(100) }),
    floor: z.string().max(50),
    wall: z.string().max(50),
  }),
  objects: z
    .array(
      z.looseObject({
        id: z.string().max(100),
        defId: z.string().max(100),
        pos: Cell,
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
        state: z.record(z.string(), z.unknown()),
      }),
    )
    .max(500),
  character: z.looseObject({ id: z.string().max(100), name: z.string().max(100), pos: Cell }),
});

export const SaveWorldBody = z.object({
  world: WorldSchema,
  /** Версия, от которой клиент менял мир; null — мира на сервере ещё нет, это первая загрузка. */
  baseVersion: z.number().int().min(1).nullable(),
});
