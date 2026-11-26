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
import { MemoryService } from './memory.service.js';
import { AwayBody, IdleBody, SendChatBody, type ChatContext } from './chat.schema.js';
import { SendEventBody, describeEvent, describeEvents } from './events.js';
import { AWAY_PROMPT, IDLE_PROMPT, PERSONA, describeCharacter, describeRoom, isSilent } from './prompt.js';
import { providerErrorText, type ChatProvider, type ChatTurn, type ChatUsage } from './providers.js';
import { buildTools, isRoomAction, runTool, type RoomAction, type ToolOptions } from './tools.js';

/** Пока модель «думает», шлём пустые строки, чтобы прокси хостинга не закрыл молчащее соединение. */
const PING_MS = 10_000;
/** В карточке «Пока тебя не было…» — не больше стольких моментов. */
const MAX_MOMENTS = 4;
/** Инструменты обычного разговора: все действия в комнате, память и дневник. */
const CHAT_TOOLS: ToolOptions = { remember: true, diary: true };

interface ModelRun {
  text: string;
  usage: ChatUsage;
  actions: RoomAction[];
  moments: string[];
}

/** Разговор с персонажем. Ответ приходит потоком (Server-Sent Events), по кусочку. */
@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(MemoryService) private readonly memory: MemoryService,
  ) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    if (!this.chat.provider) return { enabled: false, messages: [], used: 0, limit: 0 };
    const [messages, used] = await Promise.all([this.chat.history(user.id), this.chat.usedToday(user.id)]);
    return { enabled: true, messages, used, limit: this.chat.dailyLimit };
  }

  /** Начать разговор заново. Факты о хозяине и дневник остаются (их стирают отдельно, в «Памяти»). */
  @Delete()
  async clear(@CurrentUser() user: SessionUser) {
    await Promise.all([this.chat.clear(user.id), this.memory.clearSummary(user.id)]);
    return { ok: true };
  }

  /**
   * Отправить реплику. Ответ — поток событий: `delta` {text} — кусочек ответа, `action` {action} — персонаж
   * что-то делает в комнате или запоминает (клиент выполняет сразу), `done` {asked, message, used, limit} —
   * ответ готов и сохранён, `error` {message} — не получилось (вопрос тогда не сохраняется).
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
   * Что-то произошло в комнате (новая книга…) — персонаж откликается сам.
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
   * «Пока тебя не было…»: хозяин вернулся после перерыва. Одним запросом модель придумывает несколько моментов
   * за это время (и делает то, что они меняют в комнате: поливает, выключает свет), пишет в дневник
   * и здоровается. Ответ — {moments, actions, asked, message}; действия клиент применяет сразу, без прогулки.
   */
  @Post('away')
  async away(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const provider = this.requireProvider();
    const parsed = AwayBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Возвращение не похоже на возвращение');
    if (!(await this.chat.awayAllowed(user.id))) {
      throw new HttpException('Персонаж уже рассказывал, что было без вас', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!this.chat.tryLock(user.id)) throw new ConflictException('Персонаж сейчас отвечает');

    const { hoursAway, context } = parsed.data;
    const text = describeEvent({ type: 'visit', hoursAway }) + '.';
    const askedAt = new Date();
    const started = Date.now();
    try {
      const run = await this.runModel(provider, user.id, context, {
        turns: await this.chat.turnsForModel(user.id),
        prompt: `Событие в комнате: ${text}\n\n${AWAY_PROMPT}`,
        tools: { only: ['water_plant', 'set_light'], diary: true, moments: true },
      });
      await this.chat.logCall(user.id, run.usage, Date.now() - started, undefined, 'away');
      const greeting = run.text.trim() || 'С возвращением!';
      const { asked, reply } = await this.chat.saveExchange(user.id, text, greeting, askedAt, run.actions, 'event');
      this.afterReply(provider, user.id);
      return { moments: run.moments.slice(0, MAX_MOMENTS), actions: run.actions, asked, message: reply };
    } catch (error) {
      console.error('Пока тебя не было: модель не ответила', error);
      await this.chat.logCall(user.id, null, Date.now() - started, String(error), 'away');
      throw new ServiceUnavailableException(providerErrorText(error));
    } finally {
      this.chat.unlock(user.id);
    }
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
    const started = Date.now();
    try {
      // Хватит нескольких последних реплик: решение про «сейчас», а не про весь разговор.
      const turns = (await this.chat.turnsForModel(user.id)).slice(-6);
      const run = await this.runModel(provider, user.id, parsed.data.context, {
        turns,
        prompt: IDLE_PROMPT,
        tools: { diary: true },
      });
      await this.chat.logCall(user.id, run.usage, Date.now() - started, undefined, 'idle');
      const text = run.text.trim();
      return { say: isSilent(text) ? null : text.slice(0, 200), actions: run.actions };
    } catch (error) {
      console.error('Тихая минута: модель не ответила', error);
      await this.chat.logCall(user.id, null, Date.now() - started, String(error), 'idle');
      return { say: null, actions: [] };
    }
  }

  private requireProvider(): ChatProvider {
    if (!this.chat.provider) throw new ServiceUnavailableException('Чат пока не настроен на сервере');
    return this.chat.provider;
  }

  /**
   * Один ответ модели с инструментами. Записи в память (remember, write_diary) сохраняются здесь же,
   * действия в комнате и моменты возвращаются вызывающему.
   */
  private async runModel(
    provider: ChatProvider,
    userId: string,
    context: ChatContext,
    request: {
      turns: ChatTurn[];
      prompt: string;
      tools: ToolOptions;
      signal?: AbortSignal;
      onText?: (delta: string) => void;
      onAction?: (action: RoomAction) => void;
    },
  ): Promise<ModelRun> {
    const tools = buildTools(context, request.tools);
    const actions: RoomAction[] = [];
    const moments: string[] = [];
    const turns = [...request.turns];
    while (turns[0]?.role === 'assistant') turns.shift();
    const result = await provider.chat({
      persona: PERSONA,
      room: [describeCharacter(context), await this.memory.describe(userId), describeRoom(context)].join('\n\n'),
      turns: [...turns, { role: 'user', text: request.prompt }],
      tools,
      onToolCall: (name, args) => {
        const { result: toolResult, action, moment } = runTool(tools, name, args, actions.filter(isRoomAction).length);
        if (moment && moments.length < MAX_MOMENTS) moments.push(moment);
        if (action) {
          actions.push(action);
          request.onAction?.(action);
        }
        return toolResult;
      },
      signal: request.signal ?? new AbortController().signal,
      onText: request.onText ?? (() => undefined),
    });
    // Запомнить и записать в дневник — сразу, не дожидаясь хозяина.
    for (const action of actions) {
      if (action.type === 'remember') await this.memory.addFact(userId, action.text);
      if (action.type === 'diary') await this.memory.addDiary(userId, action.text);
    }
    return { text: result.text, usage: result.usage, actions, moments };
  }

  /** После ответа: в фоне пересказать старые реплики в сводку, если их накопилось достаточно. */
  private afterReply(provider: ChatProvider, userId: string) {
    void this.memory.maybeSummarize(userId, provider, (usage, durationMs, error) =>
      this.chat.logCall(userId, usage, durationMs, error, 'summary'),
    );
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

    const logKind = kind === 'event' ? 'event' : 'chat';
    try {
      const run = await this.runModel(provider, user.id, context, {
        turns: await this.chat.turnsForModel(user.id),
        prompt: kind === 'event' ? `Событие в комнате: ${text}` : text,
        tools: CHAT_TOOLS,
        signal: abort.signal,
        onText: (delta) => send('delta', { text: delta }),
        onAction: (action) => send('action', { action }),
      });
      // Модель могла ответить одним действием, без слов: тогда короткое «сейчас».
      const answer = run.text.trim() || (run.actions.some(isRoomAction) ? 'Сейчас.' : '');
      if (!answer) throw new Error('Модель вернула пустой ответ');
      const { asked, reply } = await this.chat.saveExchange(user.id, text, answer, askedAt, run.actions, kind);
      await this.chat.logCall(user.id, run.usage, Date.now() - started, undefined, logKind);
      send('done', { asked, message: reply, ...request.done });
      this.afterReply(provider, user.id);
    } catch (error) {
      const aborted = abort.signal.aborted;
      if (!aborted) console.error('Чат: модель не ответила', error);
      await this.chat.logCall(user.id, null, Date.now() - started, aborted ? 'aborted' : String(error), logKind);
      send('error', { message: providerErrorText(error) });
    } finally {
      clearInterval(ping);
      this.chat.unlock(user.id);
      res.end();
    }
  }
}
