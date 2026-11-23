import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Языковая модель, через которую говорит персонаж. Провайдер выбирается переменной CHAT_PROVIDER:
 * kimi (Moonshot, по умолчанию) или anthropic (Claude). Остальной сервер от выбора не зависит.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatRequest {
  /** Общие правила персонажа — не меняются между репликами (кэшируется провайдером). */
  persona: string;
  /** Кто персонаж и что сейчас в комнате. */
  room: string;
  turns: ChatTurn[];
  /** Действия, которые модель может выбрать (см. tools.ts). */
  tools: ToolSpec[];
  /** Модель вызвала инструмент: вернуть ответ инструмента для неё. */
  onToolCall: (name: string, args: unknown) => string;
  /** Сработает, если хозяин закрыл чат, не дождавшись ответа. */
  signal: AbortSignal;
  /** Кусочек ответа по мере того, как модель его пишет. */
  onText: (delta: string) => void;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatUsage {
  /** Входные токены без пришедших из кэша. */
  inputTokens: number;
  cachedTokens: number;
  /** Выходные токены вместе с «размышлениями». */
  outputTokens: number;
}

export interface ChatResult {
  text: string;
  usage: ChatUsage;
}

export interface ChatProvider {
  readonly name: 'kimi' | 'anthropic';
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}

/** Модель отказалась отвечать (фильтр безопасности провайдера). Текст — для хозяина комнаты. */
export class ChatRefusal extends Error {}

/** Ответ не уместился в лимит токенов. В разговоре так быть не должно: реплики короткие. */
const MAX_TOKENS = 16_000;
/**
 * Сколько раз модель может обратиться к инструментам за один ответ. В последнем круге инструменты
 * запрещены (tool_choice none) — модель обязана ответить словами.
 */
const MAX_TOOL_ROUNDS = 3;

/** Склеивает текст нескольких кругов: между словами до и после действия нужен пробел. */
function textJoiner(onText: (delta: string) => void) {
  let text = '';
  let gap = false;
  return {
    get text() {
      return text;
    },
    /** Начался новый круг: следующий кусочек отделим от прежнего текста. */
    newRound() {
      gap = text.length > 0;
    },
    push(delta: string) {
      if (gap && delta.trim()) {
        const spacer = /\s$/.test(text) || /^\s/.test(delta) ? '' : ' ';
        text += spacer;
        if (spacer) onText(spacer);
        gap = false;
      }
      text += delta;
      onText(delta);
    },
  };
}

function addUsage(total: ChatUsage, usage: ChatUsage) {
  total.inputTokens += usage.inputTokens;
  total.cachedTokens += usage.cachedTokens;
  total.outputTokens += usage.outputTokens;
}

/** Аргументы инструмента приходят строкой JSON (у Kimi) — неразборчивые считаем пустыми. */
function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return null;
  }
}

/** Kimi через OpenAI-совместимый API Moonshot. K3 всегда «думает» перед ответом; для болтовни хватает low. */
class KimiProvider implements ChatProvider {
  readonly name = 'kimi';
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async chat({ persona, room, turns, tools, onToolCall, signal, onText }: ChatRequest): Promise<ChatResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      // Неизменная часть впереди: так Moonshot берёт её из кэша.
      { role: 'system', content: `${persona}\n\n${room}` },
      ...turns.map((turn) => ({ role: turn.role, content: turn.text })),
    ];
    const functions: OpenAI.ChatCompletionTool[] = tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
    const usage: ChatUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
    const out = textJoiner(onText);

    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      out.newRound();
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          stream_options: { include_usage: true },
          // temperature и top_p у K3 зафиксированы: их нельзя передавать.
          reasoning_effort: 'low',
          max_tokens: MAX_TOKENS,
          messages,
          ...(functions.length > 0 ? { tools: functions, tool_choice: round < MAX_TOOL_ROUNDS ? ('auto' as const) : ('none' as const) } : {}),
        },
        { signal },
      );

      let content = '';
      let reasoning = '';
      const calls: { id: string; name: string; args: string }[] = [];
      let finish: string | null = null;
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta as (OpenAI.ChatCompletionChunk.Choice.Delta & { reasoning_content?: string }) | undefined;
        if (delta?.content) {
          content += delta.content;
          out.push(delta.content);
        }
        if (delta?.reasoning_content) reasoning += delta.reasoning_content;
        for (const call of delta?.tool_calls ?? []) {
          const slot = (calls[call.index] ??= { id: '', name: '', args: '' });
          if (call.id) slot.id = call.id;
          if (call.function?.name) slot.name = call.function.name;
          if (call.function?.arguments) slot.args += call.function.arguments;
        }
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) {
          // Moonshot отдаёт кэш и в prompt_tokens_details.cached_tokens, и в cached_tokens на верхнем уровне.
          const extra = chunk.usage as OpenAI.CompletionUsage & { cached_tokens?: number };
          const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? extra.cached_tokens ?? 0;
          addUsage(usage, {
            inputTokens: Math.max(0, chunk.usage.prompt_tokens - cached),
            cachedTokens: cached,
            outputTokens: chunk.usage.completion_tokens,
          });
        }
      }
      if (finish === 'content_filter') throw new ChatRefusal('На это я не могу ответить.');
      const made = calls.filter(Boolean);
      if (finish !== 'tool_calls' || made.length === 0) break;

      // K3 хранит «размышления» между кругами: ответ модели возвращаем целиком, вместе с reasoning_content.
      messages.push({
        role: 'assistant',
        content: content || null,
        reasoning_content: reasoning,
        tool_calls: made.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.args } })),
      } as OpenAI.ChatCompletionAssistantMessageParam);
      for (const call of made) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: onToolCall(call.name, parseArgs(call.args)) });
      }
    }
    return { text: out.text, usage };
  }
}

/** Модели Claude, у которых есть запасная модель на случай отказа фильтра безопасности. */
const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5)/;

/** Claude через официальный SDK Anthropic. */
class AnthropicProvider implements ChatProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async chat({ persona, room, turns, tools, onToolCall, signal, onText }: ChatRequest): Promise<ChatResult> {
    const withFallback = FALLBACK_MODELS.test(this.model);
    const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((turn) => ({ role: turn.role, content: turn.text }));
    const definitions: Anthropic.Beta.BetaTool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Beta.BetaTool.InputSchema,
      // Входные данные инструментов приходят потоком, а проверяем их сами (zod в tools.ts).
      eager_input_streaming: true,
    }));
    const usage: ChatUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
    const out = textJoiner(onText);

    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      out.newRound();
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          // Болтовне глубокие размышления не нужны: быстрее и дешевле.
          output_config: { effort: 'low' },
          // Если фильтр безопасности откажет, ответит запасная модель, а не тишина.
          ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          system: [
            { type: 'text', text: persona, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: room },
          ],
          ...(definitions.length > 0
            ? { tools: definitions, tool_choice: round < MAX_TOOL_ROUNDS ? { type: 'auto' as const } : { type: 'none' as const } }
            : {}),
          messages,
        },
        { signal },
      );
      stream.on('text', (delta) => out.push(delta));
      const message = await stream.finalMessage();
      addUsage(usage, {
        inputTokens: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
        cachedTokens: message.usage.cache_read_input_tokens ?? 0,
        outputTokens: message.usage.output_tokens,
      });
      if (message.stop_reason === 'refusal') throw new ChatRefusal('На это я не могу ответить.');
      if (message.stop_reason !== 'tool_use') break;

      // Ответ модели возвращаем целиком (с блоками размышлений), а на каждый вызов — результат.
      messages.push({ role: 'assistant', content: message.content });
      messages.push({
        role: 'user',
        content: message.content.flatMap((block) =>
          block.type === 'tool_use'
            ? [{ type: 'tool_result' as const, tool_use_id: block.id, content: onToolCall(block.name, block.input) }]
            : [],
        ),
      });
    }
    return { text: out.text, usage };
  }
}

const DEFAULT_MODELS = { kimi: 'kimi-k3.1-pro', anthropic: 'claude-opus-5-5' } as const;

/**
 * Провайдер из переменных окружения. null — ключ не задан: чат на сервере выключен,
 * а всё остальное работает как раньше.
 */
export function createChatProvider(env: NodeJS.ProcessEnv = process.env): ChatProvider | null {
  const name = (env.CHAT_PROVIDER ?? 'kimi').trim().toLowerCase();
  const model = env.CHAT_MODEL?.trim();
  if (name === 'kimi') {
    const key = env.MOONSHOT_API_KEY?.trim();
    if (!key) return null;
    return new KimiProvider(key, model || DEFAULT_MODELS.kimi, env.MOONSHOT_BASE_URL?.trim() || 'https://api.moonshot.ai/v1');
  }
  if (name === 'anthropic') {
    const key = env.ANTHROPIC_API_KEY?.trim();
    if (!key) return null;
    return new AnthropicProvider(key, model || DEFAULT_MODELS.anthropic);
  }
  throw new Error(`Неизвестный CHAT_PROVIDER: ${name} (нужен kimi или anthropic)`);
}

/** Текст ошибки провайдера для хозяина комнаты; подробности — в логах сервера. */
export function providerErrorText(error: unknown): string {
  if (error instanceof ChatRefusal) return error.message;
  const status =
    error instanceof Anthropic.APIError ? error.status : error instanceof OpenAI.APIError ? error.status : undefined;
  if (status === 401 || status === 403) return 'Сервер не может связаться с моделью: проверьте ключ API.';
  if (status === 402) return 'На балансе аккаунта модели закончились деньги.';
  if (status === 429) return 'Модель сейчас перегружена — попробуйте через минуту.';
  return 'Не получилось ответить — попробуйте ещё раз.';
}
