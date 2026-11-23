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
import { ChatService, type MessageKind } from './chat.service.js';
import { IdleBody, SendChatBody, type ChatContext } from './chat.schema.js';
import { SendEventBody, describeEvents } from './events.js';
import { IDLE_PROMPT, PERSONA, describeCharacter, describeRoom, isSilent } from './prompt.js';
import { providerErrorText, type ChatProvider, type ChatUsage } from './providers.js';
import { buildTools, runTool, type RoomAction } from './tools.js';

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
   * Отправить реплику. Ответ — поток событий: `delta` {text} — кусочек ответа, `action` {action} — персонаж
   * что-то делает в комнате (клиент выполняет сразу), `done` {asked, message, used, limit} — ответ готов и сохранён,
   * `error` {message} — не получилось (вопрос тогда не сохраняется).
   */
  @Post()
  async send(@CurrentUser() user: SessionUser, @Body() body: unknown, @Res() res: Response) {
    const provider = this.requireProvider();
    const parsed = SendChatBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Сообщение не похоже на сообщение');
    const used = await this.chat.usedToday(user.id);
    if (used >= this.chat.dailyLimit) {
      throw new HttpException('На сегодня сообщения закончились — продолжим завтра', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!this.chat.tryLock(user.id)) throw new ConflictException('Персонаж ещё отвечает на прошлое сообщение');
    await this.reply(provider, user, res, {
      text: parsed.data.message,
      kind: 'message',
      context: parsed.data.context,
      done: { used: used + 1, limit: this.chat.dailyLimit },
    });
  }

  /**
   * Что-то произошло в комнате (вернулись после перерыва, новая книга…) — персонаж откликается сам.
   * Ответ — тот же поток, что у реплики. 429 — реакций уже хватает (слишком часто или лимит на сутки):
   * клиент просто молча пропускает событие.
   */
  @Post('event')
  async event(@CurrentUser() user: SessionUser, @Body() body: unknown, @Res() res: Response) {
    const provider = this.requireProvider();
    const parsed = SendEventBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Событие не похоже на событие');
    const [count, tooSoon] = await Promise.all([this.chat.usedToday(user.id, 'event'), this.chat.eventTooSoon(user.id)]);
    if (count >= this.chat.eventDailyLimit || tooSoon) {
      throw new HttpException('Персонаж уже откликался на события — пропускаем', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!this.chat.tryLock(user.id)) throw new ConflictException('Персонаж сейчас отвечает');
    const used = await this.chat.usedToday(user.id);
    await this.reply(provider, user, res, {
      text: describeEvents(parsed.data.events),
      kind: 'event',
      context: parsed.data.context,
      done: { used, limit: this.chat.dailyLimit },
    });
  }

  /**
   * Тихая минута: хозяин в комнате, но вы не разговариваете — персонаж сам решает, чем заняться.
   * Ответ — {say, actions}: короткая фраза себе под нос (или null) и действия в комнате.
   * В историю чата это не попадает. 429 — решений в этот час уже хватает (клиент просто ждёт дальше).
   */
  @Post('idle')
  async idle(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const provider = this.requireProvider();
    const parsed = IdleBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Комната не похожа на комнату');
    if (!(await this.chat.idleAllowed(user.id))) {
      throw new HttpException('Персонаж недавно уже решал, чем заняться', HttpStatus.TOO_MANY_REQUESTS);
    }
    // Замок разговора не берём: тихая минута ничего не пишет в историю, а если хозяин заговорит,
    // клиент просто отбросит это решение.

    const { context } = parsed.data;
    const started = Date.now();
    const tools = buildTools(context);
    const actions: RoomAction[] = [];
    let usage: ChatUsage | null = null;
    try {
      // Хватит нескольких последних реплик: решение про «сейчас», а не про весь разговор.
      const turns = (await this.chat.turnsForModel(user.id)).slice(-6);
      while (turns[0]?.role === 'assistant') turns.shift();
      const result = await provider.chat({
        persona: PERSONA,
        room: `${describeCharacter(context)}\n\n${describeRoom(context)}`,
        turns: [...turns, { role: 'user', text: IDLE_PROMPT }],
        tools,
        onToolCall: (name, args) => {
          const { result: toolResult, action } = runTool(tools, name, args, actions.length);
          if (action) actions.push(action);
          return toolResult;
        },
        signal: new AbortController().signal,
        onText: () => undefined,
      });
      usage = result.usage;
      await this.chat.logCall(user.id, usage, Date.now() - started, undefined, 'idle');
      const text = result.text.trim();
      return { say: isSilent(text) ? null : text.slice(0, 200), actions };
    } catch (error) {
      console.error('Тихая минута: модель не ответила', error);
      await this.chat.logCall(user.id, usage, Date.now() - started, String(error), 'idle');
      return { say: null, actions: [] };
    }
  }

  private requireProvider(): ChatProvider {
    if (!this.chat.provider) throw new ServiceUnavailableException('Чат пока не настроен на сервере');
    return this.chat.provider;
  }

  /** Ответ модели потоком: текст, действия в комнате, а в конце — сохранённая пара сообщений. */
  private async reply(
    provider: ChatProvider,
    user: SessionUser,
    res: Response,
    request: { text: string; kind: MessageKind; context: ChatContext; done: { used: number; limit: number } },
  ) {
    const { text, kind, context } = request;
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
    const tools = buildTools(context);
    const actions: RoomAction[] = [];
    const logKind = kind === 'event' ? 'event' : 'chat';
    try {
      const turns = [
        ...(await this.chat.turnsForModel(user.id)),
        { role: 'user' as const, text: kind === 'event' ? `Событие в комнате: ${text}` : text },
      ];
      const result = await provider.chat({
        persona: PERSONA,
        room: `${describeCharacter(context)}\n\n${describeRoom(context)}`,
        turns,
        tools,
        onToolCall: (name, args) => {
          const { result, action } = runTool(tools, name, args, actions.length);
          if (action) {
            actions.push(action);
            send('action', { action });
          }
          return result;
        },
        signal: abort.signal,
        onText: (delta) => send('delta', { text: delta }),
      });
      usage = result.usage;
      // Модель могла ответить одним действием, без слов: тогда короткое «сейчас».
      const answer = result.text.trim() || (actions.length > 0 ? 'Сейчас.' : '');
      if (!answer) throw new Error('Модель вернула пустой ответ');
      const { asked, reply } = await this.chat.saveExchange(user.id, text, answer, askedAt, actions, kind);
      await this.chat.logCall(user.id, usage, Date.now() - started, undefined, logKind);
      send('done', { asked, message: reply, ...request.done });
    } catch (error) {
      const aborted = abort.signal.aborted;
      if (!aborted) console.error('Чат: модель не ответила', error);
      await this.chat.logCall(user.id, usage, Date.now() - started, aborted ? 'aborted' : String(error), logKind);
      send('error', { message: providerErrorText(error) });
    } finally {
      clearInterval(ping);
      this.chat.unlock(user.id);
      res.end();
    }
  }
}
