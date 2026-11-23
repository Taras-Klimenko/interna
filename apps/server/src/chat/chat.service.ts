import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { createChatProvider, type ChatProvider, type ChatTurn, type ChatUsage } from './providers.js';
import type { RoomAction } from './tools.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Сколько последних реплик отправляем модели: этого хватает, чтобы держать нить разговора. */
const HISTORY_FOR_MODEL = 30;
/** Сколько реплик показываем при открытии чата. */
const HISTORY_FOR_CLIENT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Реакции на события не чаще, чем раз в столько: десять книг подряд — одна реакция, а не десять. */
const EVENT_GAP_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;
/** Решения «чем заняться» не чаще, чем раз в столько. */
const IDLE_GAP_MS = 3 * 60_000;

export type MessageKind = 'message' | 'event';

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  /** event — не слова хозяина, а событие в комнате (показывается тихой заметкой). */
  kind: MessageKind;
  text: string;
  /** Что персонаж сделал вместе с этим ответом. */
  actions: RoomAction[];
  createdAt: Date;
}

const VIEW = { id: true, role: true, kind: true, text: true, actions: true, createdAt: true } as const;

function toView(row: { id: string; role: string; kind: string; text: string; actions: unknown; createdAt: Date }): ChatMessageView {
  return {
    ...row,
    role: row.role === 'user' ? 'user' : 'assistant',
    kind: row.kind === 'event' ? 'event' : 'message',
    actions: Array.isArray(row.actions) ? (row.actions as RoomAction[]) : [],
  };
}

@Injectable()
export class ChatService {
  /** null — ключ API не задан: чат выключен. */
  readonly provider: ChatProvider | null = createChatProvider();
  /** Сколько сообщений хозяин может отправить за сутки (защита от счёта за модель). */
  readonly dailyLimit = Number(process.env.CHAT_DAILY_LIMIT ?? 100);
  /** Сколько раз за сутки персонаж может откликнуться на события сам. */
  readonly eventDailyLimit = Number(process.env.CHAT_EVENT_DAILY_LIMIT ?? 30);
  /** Сколько раз в час персонаж может сам решить, чем заняться (без разговора). 0 — выключено. */
  readonly idleHourlyLimit = Number(process.env.CHAT_IDLE_HOURLY_LIMIT ?? 8);
  /** Пользователи, которым персонаж прямо сейчас отвечает: второй вопрос ждёт первого ответа. */
  private readonly busy = new Set<string>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async history(userId: string, take = HISTORY_FOR_CLIENT): Promise<ChatMessageView[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: VIEW,
    });
    return rows.reverse().map(toView);
  }

  /** История для модели: начинается с реплики хозяина (так требуют API). */
  async turnsForModel(userId: string): Promise<ChatTurn[]> {
    // Событие модель видит как отдельное сообщение — не слова хозяина (см. правила в prompt.ts).
    const turns = (await this.history(userId, HISTORY_FOR_MODEL)).map(({ role, kind, text }) => ({
      role,
      text: kind === 'event' ? `Событие в комнате: ${text}` : text,
    }));
    while (turns[0]?.role === 'assistant') turns.shift();
    return turns;
  }

  /** Сколько сообщений хозяин отправил за последние сутки (или событий, на которые персонаж откликнулся). */
  usedToday(userId: string, kind: MessageKind = 'message') {
    return this.prisma.chatMessage.count({
      where: { userId, role: 'user', kind, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
  }

  /** Персонаж откликался на событие меньше минуты назад — новое пропускаем. */
  async eventTooSoon(userId: string) {
    const last = await this.prisma.chatMessage.findFirst({
      where: { userId, kind: 'event' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return !!last && Date.now() - last.createdAt.getTime() < EVENT_GAP_MS;
  }

  /**
   * Можно ли сейчас спросить модель, чем персонажу заняться: не чаще раза в IDLE_GAP_MS
   * и не больше idleHourlyLimit раз в час. Считаем по журналу вызовов модели.
   */
  async idleAllowed(userId: string) {
    if (this.idleHourlyLimit <= 0) return false;
    const since = new Date(Date.now() - HOUR_MS);
    const [count, last] = await Promise.all([
      this.prisma.llmCall.count({ where: { userId, kind: 'idle', createdAt: { gte: since } } }),
      this.prisma.llmCall.findFirst({ where: { userId, kind: 'idle' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    if (count >= this.idleHourlyLimit) return false;
    return !last || Date.now() - last.createdAt.getTime() >= IDLE_GAP_MS;
  }

  tryLock(userId: string) {
    if (this.busy.has(userId)) return false;
    this.busy.add(userId);
    return true;
  }

  unlock(userId: string) {
    this.busy.delete(userId);
  }

  /** Вопрос и ответ сохраняются вместе, когда ответ готов: в истории не остаётся вопросов без ответа. */
  async saveExchange(
    userId: string,
    question: string,
    answer: string,
    askedAt: Date,
    actions: RoomAction[] = [],
    kind: MessageKind = 'message',
  ) {
    const [asked, reply] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({ data: { userId, role: 'user', kind, text: question, createdAt: askedAt }, select: VIEW }),
      this.prisma.chatMessage.create({
        data: {
          userId,
          role: 'assistant',
          text: answer,
          actions: actions.length > 0 ? (actions as unknown as Prisma.InputJsonValue) : undefined,
          createdAt: new Date(Math.max(Date.now(), askedAt.getTime() + 1)),
        },
        select: VIEW,
      }),
    ]);
    return { asked: toView(asked), reply: toView(reply) };
  }

  clear(userId: string) {
    return this.prisma.chatMessage.deleteMany({ where: { userId } });
  }

  /** Журнал вызовов модели: токены и время — по нему видно, во что обходится персонаж. */
  async logCall(userId: string, usage: ChatUsage | null, durationMs: number, error?: string, kind = 'chat') {
    if (!this.provider) return;
    try {
      await this.prisma.llmCall.create({
        data: {
          userId,
          kind,
          provider: this.provider.name,
          model: this.provider.model,
          inputTokens: usage?.inputTokens ?? 0,
          cachedTokens: usage?.cachedTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          durationMs,
          error: error?.slice(0, 500),
        },
      });
    } catch (logError) {
      console.warn('Не удалось записать вызов модели', logError);
    }
  }
}
