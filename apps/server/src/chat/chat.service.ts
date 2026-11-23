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

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Что персонаж сделал вместе с этим ответом. */
  actions: RoomAction[];
  createdAt: Date;
}

const VIEW = { id: true, role: true, text: true, actions: true, createdAt: true } as const;

function toView(row: { id: string; role: string; text: string; actions: unknown; createdAt: Date }): ChatMessageView {
  return {
    ...row,
    role: row.role === 'user' ? 'user' : 'assistant',
    actions: Array.isArray(row.actions) ? (row.actions as RoomAction[]) : [],
  };
}

@Injectable()
export class ChatService {
  /** null — ключ API не задан: чат выключен. */
  readonly provider: ChatProvider | null = createChatProvider();
  /** Сколько сообщений хозяин может отправить за сутки (защита от счёта за модель). */
  readonly dailyLimit = Number(process.env.CHAT_DAILY_LIMIT ?? 100);
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
    const turns = (await this.history(userId, HISTORY_FOR_MODEL)).map(({ role, text }) => ({ role, text }));
    while (turns[0]?.role === 'assistant') turns.shift();
    return turns;
  }

  /** Сколько сообщений хозяин отправил за последние сутки. */
  usedToday(userId: string) {
    return this.prisma.chatMessage.count({
      where: { userId, role: 'user', createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
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
  async saveExchange(userId: string, question: string, answer: string, askedAt: Date, actions: RoomAction[] = []) {
    const [, reply] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({ data: { userId, role: 'user', text: question, createdAt: askedAt } }),
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
    return toView(reply);
  }

  clear(userId: string) {
    return this.prisma.chatMessage.deleteMany({ where: { userId } });
  }

  /** Журнал вызовов модели: токены и время — по нему видно, во что обходится персонаж. */
  async logCall(userId: string, usage: ChatUsage | null, durationMs: number, error?: string) {
    if (!this.provider) return;
    try {
      await this.prisma.llmCall.create({
        data: {
          userId,
          kind: 'chat',
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
