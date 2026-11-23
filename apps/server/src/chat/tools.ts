import { z } from 'zod';
import type { ChatContext } from './chat.schema.js';

/**
 * Действия персонажа в комнате как «инструменты» модели. Модель только выбирает действие,
 * а выполняет его игра на клиенте: персонаж идёт к предмету и играет анимацию.
 * Инструменты собираются из того, что сейчас есть в комнате, а id предметов перечислены в схеме:
 * модель не может придумать несуществующий предмет.
 */

export type RoomAction =
  | { type: 'light'; objectId: string; on: boolean }
  | { type: 'water'; objectId: string }
  | { type: 'music'; objectId: string; track?: string }
  | { type: 'stopMusic'; objectId: string }
  | { type: 'goTo'; objectId: string }
  | { type: 'takeBook'; objectId: string; title: string };

export interface ChatTool {
  name: string;
  description: string;
  /** JSON Schema параметров. */
  parameters: Record<string, unknown>;
  /** Проверить аргументы и решить, что делать. result — ответ инструмента для модели. */
  run: (args: unknown) => { result: string; action?: RoomAction };
}

/** Больше действий за один ответ не нужно: персонаж выполняет их по очереди, а хозяин ждёт. */
export const MAX_ACTIONS_PER_REPLY = 3;

const schema = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const idOf = (objects: { id: string }[]) => ({ type: 'string', enum: objects.map((object) => object.id) });

function refuse(error: z.ZodError) {
  const field = error.issues[0]?.path.join('.') || 'параметры';
  return { result: `Не получилось: неверное значение «${field}» — такого предмета или варианта в комнате нет. Ничего не сделано.` };
}

export function buildTools(context: ChatContext): ChatTool[] {
  const tools: ChatTool[] = [];
  const named = new Map(context.objects.map((object) => [object.id, object.name]));
  const lights = context.objects.filter((object) => object.can.includes('light'));
  const plants = context.objects.filter((object) => object.can.includes('water'));
  const speakers = context.objects.filter((object) => object.can.includes('music') && object.tracks.length > 0);
  const ids = (list: { id: string }[]) => z.enum(list.map((object) => object.id) as [string, ...string[]]);

  if (lights.length > 0) {
    const Args = z.object({ objectId: ids(lights), on: z.boolean() });
    tools.push({
      name: 'set_light',
      description: 'Подойти к лампе или торшеру и включить или выключить свет.',
      parameters: schema({ objectId: idOf(lights), on: { type: 'boolean', description: 'true — включить, false — выключить' } }, ['objectId', 'on']),
      run: (args) => {
        const parsed = Args.safeParse(args);
        if (!parsed.success) return refuse(parsed.error);
        const { objectId, on } = parsed.data;
        const lamp = lights.find((object) => object.id === objectId)!;
        if (lamp.on === on) return { result: `${lamp.name} уже ${on ? 'горит' : 'выключен'} — делать ничего не нужно.` };
        return { result: `Ты идёшь ${on ? 'включить' : 'выключить'} ${lamp.name}.`, action: { type: 'light', objectId, on } };
      },
    });
  }

  if (plants.length > 0) {
    const Args = z.object({ objectId: ids(plants) });
    tools.push({
      name: 'water_plant',
      description: 'Подойти к растению и полить его.',
      parameters: schema({ objectId: idOf(plants) }, ['objectId']),
      run: (args) => {
        const parsed = Args.safeParse(args);
        if (!parsed.success) return refuse(parsed.error);
        return { result: `Ты идёшь поливать ${named.get(parsed.data.objectId)}.`, action: { type: 'water', objectId: parsed.data.objectId } };
      },
    });
  }

  if (speakers.length > 0) {
    const titles = [...new Set(speakers.flatMap((speaker) => speaker.tracks))];
    const Args = z.object({ objectId: ids(speakers), track: z.enum(titles as [string, ...string[]]).optional() });
    tools.push({
      name: 'play_music',
      description: 'Подойти к колонке и включить музыку: конкретный трек из её плейлиста или просто продолжить плейлист.',
      parameters: schema(
        {
          objectId: idOf(speakers),
          track: { type: 'string', enum: titles, description: 'Название трека; не указывай, чтобы просто включить плейлист' },
        },
        ['objectId'],
      ),
      run: (args) => {
        const parsed = Args.safeParse(args);
        if (!parsed.success) return refuse(parsed.error);
        const { objectId, track } = parsed.data;
        const speaker = speakers.find((object) => object.id === objectId)!;
        if (track && !speaker.tracks.includes(track)) return { result: `В плейлисте этой колонки нет «${track}». Ничего не сделано.` };
        return {
          result: track ? `Ты идёшь включить «${track}».` : 'Ты идёшь включить музыку.',
          action: { type: 'music', objectId, ...(track ? { track } : {}) },
        };
      },
    });
  }

  if (context.nowPlaying && speakers.length > 0) {
    const Args = z.object({ objectId: ids(speakers) });
    tools.push({
      name: 'stop_music',
      description: 'Подойти к колонке и выключить музыку, которая сейчас играет.',
      parameters: schema({ objectId: idOf(speakers) }, ['objectId']),
      run: (args) => {
        const parsed = Args.safeParse(args);
        if (!parsed.success) return refuse(parsed.error);
        return { result: 'Ты идёшь выключить музыку.', action: { type: 'stopMusic', objectId: parsed.data.objectId } };
      },
    });
  }

  const shelved = context.books.filter((book) => book.shelfId && named.has(book.shelfId));
  if (shelved.length > 0) {
    const titles = [...new Set(shelved.map((book) => book.title))];
    const Args = z.object({ title: z.enum(titles as [string, ...string[]]) });
    tools.push({
      name: 'take_book',
      description: 'Подойти к книжному шкафу и взять с полки книгу, например чтобы полистать её или показать хозяину.',
      parameters: schema({ title: { type: 'string', enum: titles } }, ['title']),
      run: (args) => {
        const parsed = Args.safeParse(args);
        if (!parsed.success) return refuse(parsed.error);
        const book = shelved.find((item) => item.title === parsed.data.title)!;
        return { result: `Ты идёшь к шкафу за «${book.title}».`, action: { type: 'takeBook', objectId: book.shelfId, title: book.title } };
      },
    });
  }

  if (context.objects.length > 0) {
    const Args = z.object({ objectId: ids(context.objects) });
    tools.push({
      name: 'go_to',
      description: 'Подойти к предмету в комнате (например, к окну или к дивану), ничего с ним не делая.',
      parameters: schema({ objectId: idOf(context.objects) }, ['objectId']),
      run: (args) => {
        const parsed = Args.safeParse(args);
        if (!parsed.success) return refuse(parsed.error);
        return { result: `Ты идёшь к предмету «${named.get(parsed.data.objectId)}».`, action: { type: 'goTo', objectId: parsed.data.objectId } };
      },
    });
  }

  return tools;
}

/** Выполнить вызов инструмента: неизвестное имя или лишние действия — ответ модели, а не ошибка. */
export function runTool(tools: ChatTool[], name: string, args: unknown, actionsSoFar: number) {
  const tool = tools.find((item) => item.name === name);
  if (!tool) return { result: `Такого действия нет: ${name}. Ничего не сделано.` };
  if (actionsSoFar >= MAX_ACTIONS_PER_REPLY) return { result: 'На этот раз хватит дел — остальное потом. Ничего не сделано.' };
  return tool.run(args);
}
