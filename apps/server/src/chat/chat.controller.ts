import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { SessionUser } from '../auth/auth.service.js';
import { ChatService } from './chat.service.js';
import { SendChatBody } from './chat.schema.js';
import { PERSONA, describeRoom } from './prompt.js';
import { providerErrorText, type ChatUsage } from './providers.js';

/** Пока модель «думает», шлём пустые строки, чтобы прокси хостинга не закрыл молчащее соединение. */
const PING_MS = 10_000;

/** Разговор с персонажем. Ответ приходит потоком (Server-Sent Events), по кусочку. */
@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    if (!this.chat.provider) return { enabled: false, messages: [], used: 0, limit: 0 };
    const [messages, used] = await Promise.all([this.chat.history(user.id), this.chat.usedToday(user.id)]);
    return { enabled: true, messages, used, limit: this.chat.dailyLimit };
  }

  /** Начать разговор заново. */
  @Delete()
  async clear(@CurrentUser() user: SessionUser) {
    await this.chat.clear(user.id);
    return { ok: true };
  }

  /**
   * Отправить реплику. Ответ — поток событий: `delta` {text} — кусочек ответа, `done` {message, used, limit} —
   * ответ готов и сохранён, `error` {message} — не получилось (вопрос тогда не сохраняется).
   */
  @Post()
  async send(@CurrentUser() user: SessionUser, @Body() body: unknown, @Res() res: Response) {
    const provider = this.chat.provider;
    if (!provider) throw new ServiceUnavailableException('Чат пока не настроен на сервере');
    const parsed = SendChatBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Сообщение не похоже на сообщение');
    const used = await this.chat.usedToday(user.id);
    if (used >= this.chat.dailyLimit) {
      throw new HttpException('На сегодня сообщения закончились — продолжим завтра', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!this.chat.tryLock(user.id)) throw new ConflictException('Персонаж ещё отвечает на прошлое сообщение');

    const { message, context } = parsed.data;
    const askedAt = new Date();
    const started = Date.now();
    const abort = new AbortController();
    // Соединение закрылось раньше, чем мы дописали ответ: хозяин ушёл, модель можно остановить.
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const ping = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, PING_MS);

    let usage: ChatUsage | null = null;
    try {
      const turns = [...(await this.chat.turnsForModel(user.id)), { role: 'user' as const, text: message }];
      const result = await provider.chat({
        persona: PERSONA,
        room: describeRoom(context),
        turns,
        signal: abort.signal,
        onText: (text) => send('delta', { text }),
      });
      usage = result.usage;
      const answer = result.text.trim();
      if (!answer) throw new Error('Модель вернула пустой ответ');
      const reply = await this.chat.saveExchange(user.id, message, answer, askedAt);
      await this.chat.logCall(user.id, usage, Date.now() - started);
      send('done', { message: reply, used: used + 1, limit: this.chat.dailyLimit });
    } catch (error) {
      const aborted = abort.signal.aborted;
      if (!aborted) console.error('Чат: модель не ответила', error);
      await this.chat.logCall(user.id, usage, Date.now() - started, aborted ? 'aborted' : String(error));
      send('error', { message: providerErrorText(error) });
    } finally {
      clearInterval(ping);
      this.chat.unlock(user.id);
      res.end();
    }
  }
}
