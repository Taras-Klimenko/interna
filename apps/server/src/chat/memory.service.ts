import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { ChatProvider, ChatUsage } from './providers.js';

/** Фактов о хозяине держим не больше стольких: самые старые уходят. */
const MAX_FACTS = 60;
/** Сколько последних записей дневника персонаж «помнит» в разговоре. */
const DIARY_IN_PROMPT = 3;
/**
 * Модели уходят последние 30 реплик (см. ChatService). Когда непересказанных реплик старше них набирается
 * столько, сервер в фоне пересказывает их в сводку.
 */
const KEEP_RECENT = 30;
const SUMMARIZE_BATCH = 20;
const MAX_SUMMARY_CHARS = 1500;

export interface MemoryItem {
  id: string;
  text: string;
  createdAt: Date;
}

const SUMMARY_PROMPT = `Ты ведёшь краткие заметки о разговорах персонажа приложения Interna с хозяином комнаты. Тебе дают прежнюю сводку и новые реплики. Перепиши сводку целиком так, чтобы она включала и новое: о чём говорили, что важно хозяину, о чём договорились, какое было настроение. Пиши кратко, обычным текстом, без списков, не больше 120 слов. Не выдумывай. Ответь только текстом сводки.`;

function normalize(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Память персонажа: факты о хозяине, дневник и сводка старых разговоров. */
@Injectable()
export class MemoryService {
  /** Пользователи, для которых сводка сейчас обновляется: второй раз параллельно не запускаем. */
  private readonly summarizing = new Set<string>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(userId: string, kind: 'fact' | 'diary', take = 100): Promise<MemoryItem[]> {
    return this.prisma.memory.findMany({
      where: { userId, kind },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, text: true, createdAt: true },
    });
  }

  /** Запомнить факт. Такой же уже есть — не дублируем; фактов слишком много — забываем самые старые. */
  async addFact(userId: string, text: string) {
    const facts = await this.list(userId, 'fact', MAX_FACTS + 10);
    if (facts.some((fact) => normalize(fact.text) === normalize(text))) return;
    await this.prisma.memory.create({ data: { userId, kind: 'fact', text } });
    const extra = facts.slice(MAX_FACTS - 1);
    if (extra.length > 0) await this.prisma.memory.deleteMany({ where: { id: { in: extra.map((fact) => fact.id) } } });
  }

  async addDiary(userId: string, text: string) {
    await this.prisma.memory.create({ data: { userId, kind: 'diary', text } });
  }

  deleteFact(userId: string, id: string) {
    return this.prisma.memory.deleteMany({ where: { userId, id, kind: 'fact' } });
  }

  clearFacts(userId: string) {
    return this.prisma.memory.deleteMany({ where: { userId, kind: 'fact' } });
  }

  /** Начали разговор заново — сводка старого разговора больше не нужна. */
  clearSummary(userId: string) {
    return this.prisma.memory.deleteMany({ where: { userId, kind: 'summary' } });
  }

  /** Что персонаж помнит — текстом для модели: факты, последние записи дневника, сводка прошлых разговоров. */
  async describe(userId: string): Promise<string> {
    const [facts, diary, summary] = await Promise.all([
      this.list(userId, 'fact', MAX_FACTS),
      this.list(userId, 'diary', DIARY_IN_PROMPT),
      this.prisma.memory.findFirst({ where: { userId, kind: 'summary' }, select: { text: true } }),
    ]);
    const parts: string[] = [];
    parts.push(
      facts.length > 0
        ? `Что ты помнишь о хозяине:\n${facts
            .reverse()
            .map((fact) => `- ${fact.text}`)
            .join('\n')}`
        : 'О хозяине ты пока почти ничего не знаешь — запоминай важное (инструмент remember).',
    );
    if (summary?.text) parts.push(`О чём вы говорили раньше (кратко): ${summary.text}`);
    if (diary.length > 0) {
      parts.push(
        `Последние записи в твоём дневнике:\n${diary
          .reverse()
          .map((entry) => `- ${entry.createdAt.toISOString().slice(0, 10)}: ${entry.text}`)
          .join('\n')}`,
      );
    }
    return `Память:\n${parts.join('\n\n')}`;
  }

  /**
   * Пересказать старые реплики в сводку, если их накопилось достаточно. Запускается в фоне после ответа
   * и ошибок наружу не бросает: без сводки персонаж просто помнит только последние реплики.
   */
  async maybeSummarize(
    userId: string,
    provider: ChatProvider,
    log: (usage: ChatUsage, durationMs: number, error?: string) => Promise<void>,
  ) {
    if (this.summarizing.has(userId)) return;
    this.summarizing.add(userId);
    const started = Date.now();
    try {
      const summary = await this.prisma.memory.findFirst({ where: { userId, kind: 'summary' } });
      const since = summary?.coversUntil ?? new Date(0);
      const pending = await this.prisma.chatMessage.findMany({
        where: { userId, createdAt: { gt: since } },
        orderBy: { createdAt: 'asc' },
        select: { role: true, kind: true, text: true, createdAt: true },
      });
      // Последние реплики модель и так видит целиком — пересказываем только то, что старше них.
      const old = pending.slice(0, Math.max(0, pending.length - KEEP_RECENT));
      if (old.length < SUMMARIZE_BATCH) return;

      const transcript = old
        .map((message) =>
          message.kind === 'event'
            ? `[событие: ${message.text}]`
            : `${message.role === 'user' ? 'Хозяин' : 'Персонаж'}: ${message.text}`,
        )
        .join('\n');
      const result = await provider.chat({
        persona: SUMMARY_PROMPT,
        room: '',
        turns: [{ role: 'user', text: `Прежняя сводка: ${summary?.text || '(пока нет)'}\n\nНовые реплики:\n${transcript}` }],
        tools: [],
        onToolCall: () => '',
        signal: new AbortController().signal,
        onText: () => undefined,
      });
      const text = result.text.trim().slice(0, MAX_SUMMARY_CHARS);
      await log(result.usage, Date.now() - started);
      if (!text) return;
      const coversUntil = old.at(-1)!.createdAt;
      if (summary) await this.prisma.memory.update({ where: { id: summary.id }, data: { text, coversUntil } });
      else await this.prisma.memory.create({ data: { userId, kind: 'summary', text, coversUntil } });
    } catch (error) {
      console.warn('Не удалось обновить сводку разговора', error);
      await log({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 }, Date.now() - started, String(error)).catch(() => undefined);
    } finally {
      this.summarizing.delete(userId);
    }
  }
}
