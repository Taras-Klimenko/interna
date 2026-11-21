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
  /** Характер персонажа и правила — не меняется между репликами (кэшируется провайдером). */
  persona: string;
  /** Что сейчас в комнате. */
  room: string;
  turns: ChatTurn[];
  /** Сработает, если хозяин закрыл чат, не дождавшись ответа. */
  signal: AbortSignal;
  /** Кусочек ответа по мере того, как модель его пишет. */
  onText: (delta: string) => void;
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

  async chat({ persona, room, turns, signal, onText }: ChatRequest): Promise<ChatResult> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        stream_options: { include_usage: true },
        // temperature и top_p у K3 зафиксированы: их нельзя передавать.
        reasoning_effort: 'low',
        max_tokens: MAX_TOKENS,
        messages: [
          // Неизменная часть впереди: так Moonshot берёт её из кэша.
          { role: 'system', content: `${persona}\n\n${room}` },
          ...turns.map((turn) => ({ role: turn.role, content: turn.text })),
        ],
      },
      { signal },
    );

    let text = '';
    let finish: string | null = null;
    let usage: OpenAI.CompletionUsage | undefined;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta?.content;
      if (delta) {
        text += delta;
        onText(delta);
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    if (finish === 'content_filter') throw new ChatRefusal('На это я не могу ответить.');

    // Moonshot отдаёт кэш и в prompt_tokens_details.cached_tokens, и в cached_tokens на верхнем уровне.
    const extra = usage as (OpenAI.CompletionUsage & { cached_tokens?: number }) | undefined;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? extra?.cached_tokens ?? 0;
    return {
      text,
      usage: {
        inputTokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cached),
        cachedTokens: cached,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    };
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

  async chat({ persona, room, turns, signal, onText }: ChatRequest): Promise<ChatResult> {
    const withFallback = FALLBACK_MODELS.test(this.model);
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
        messages: turns.map((turn) => ({ role: turn.role, content: turn.text })),
      },
      { signal },
    );
    stream.on('text', (delta) => onText(delta));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new ChatRefusal('На это я не могу ответить.');

    const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    return {
      text,
      usage: {
        inputTokens: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
        cachedTokens: message.usage.cache_read_input_tokens ?? 0,
        outputTokens: message.usage.output_tokens,
      },
    };
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
