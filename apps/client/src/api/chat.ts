import { API_URL, OfflineError, api } from './http';
import type { RoomAction } from '../chat/actions';

/** Что сейчас в комнате — сервер превращает это в описание для модели (см. apps/server/src/chat). */
export interface ChatContext {
  characterName: string;
  personality: string;
  gender: 'female' | 'male';
  hour: number;
  place: 'room' | 'field';
  /** Где гуляете: поле или пляж. */
  biome: 'meadow' | 'beach';
  /** На прогулке: персонаж с вами (иначе дома, и вы переписываетесь). */
  together: boolean;
  ownerInside: boolean;
  objects: { id: string; name: string; state?: string; can: ('light' | 'water' | 'music' | 'books')[]; on?: boolean; tracks: string[] }[];
  books: { title: string; author: string; shelfId: string; note: string; percent?: number }[];
  playlist: string[];
  nowPlaying?: string;
  photos: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** event — не слова хозяина, а событие в комнате, на которое персонаж откликнулся сам. */
  kind?: 'message' | 'event';
  text: string;
  /** Что персонаж сделал в комнате вместе с этим ответом. */
  actions?: RoomAction[];
  createdAt: string;
}

export interface ChatState {
  /** false — на сервере не задан ключ модели. */
  enabled: boolean;
  messages: ChatMessage[];
  /** Сколько сообщений отправлено за сутки и сколько можно. */
  used: number;
  limit: number;
}

/** Событие в комнате, на которое персонаж откликается сам (см. apps/server/src/chat/events.ts). */
export type RoomEvent =
  | { type: 'visit'; hoursAway: number }
  | { type: 'newBooks'; books: { title: string; author: string }[] }
  | { type: 'newPhoto'; caption: string }
  | { type: 'newTracks'; titles: string[] }
  | { type: 'newObjects'; names: string[] }
  | { type: 'silence'; minutes: number }
  | { type: 'meeting' };

export interface ChatDone {
  /** Сохранённая реплика хозяина (или событие). */
  asked?: ChatMessage;
  message: ChatMessage;
  used: number;
  limit: number;
}

/** Сервер не смог ответить; текст — для человека. */
export class ChatError extends Error {}

export const loadChat = (token: string) => api<ChatState>('/chat', { token });

export const clearChat = (token: string) => api<{ ok: boolean }>('/chat', { method: 'DELETE', token });

/** «Пока тебя не было…»: что персонаж делал без хозяина, что изменилось в комнате и приветствие. */
export interface AwayStory {
  moments: string[];
  actions: RoomAction[];
  asked: ChatMessage;
  message: ChatMessage;
}

export const sendAway = (token: string, hoursAway: number, context: ChatContext) =>
  api<AwayStory>('/chat/away', { method: 'POST', token, body: { hoursAway, context } });

export interface MemoryItem {
  id: string;
  text: string;
  createdAt: string;
}

/** Что персонаж помнит: факты о хозяине и свой дневник. */
export const loadMemory = (token: string) => api<{ facts: MemoryItem[]; diary: MemoryItem[] }>('/memory', { token });
export const forgetFact = (token: string, id: string) =>
  api<{ ok: boolean }>(`/memory/facts/${encodeURIComponent(id)}`, { method: 'DELETE', token });
export const forgetAllFacts = (token: string) => api<{ ok: boolean }>('/memory/facts', { method: 'DELETE', token });

/**
 * Отправить реплику и читать ответ по мере того, как персонаж его «пишет» (Server-Sent Events).
 * onDelta получает кусочки ответа, onAction — действия персонажа в комнате (выполнять сразу);
 * итог — сохранённое сообщение персонажа.
 */
export function sendChat(
  token: string,
  body: { message: string; context: ChatContext },
  onDelta: (text: string) => void,
  onAction: (action: RoomAction) => void,
  signal?: AbortSignal,
): Promise<ChatDone> {
  return streamReply('/chat', token, body, onDelta, onAction, signal);
}

/** Сообщить о событии в комнате: персонаж откликнется так же, потоком. */
export function sendEvent(
  token: string,
  body: { events: RoomEvent[]; context: ChatContext },
  onDelta: (text: string) => void,
  onAction: (action: RoomAction) => void,
  signal?: AbortSignal,
): Promise<ChatDone> {
  return streamReply('/chat/event', token, body, onDelta, onAction, signal);
}

async function streamReply(
  path: string,
  token: string,
  body: unknown,
  onDelta: (text: string) => void,
  onAction: (action: RoomAction) => void,
  signal?: AbortSignal,
): Promise<ChatDone> {
  if (!API_URL) throw new OfflineError('API не настроен');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new OfflineError('Нет связи с сервером');
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    const text = await response.text().catch(() => '');
    // 503 с сообщением — сервер жив, но чат на нём не настроен.
    const message = parseMessage(text);
    if (message) throw new ChatError(message);
    throw new OfflineError('Сервер не отвечает');
  }
  if (!response.ok || !response.body) {
    const message = parseMessage(await response.text().catch(() => ''));
    throw Object.assign(new ChatError(message ?? 'Не получилось отправить сообщение'), { status: response.status });
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    // События разделены пустой строкой.
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = parseEvent(raw);
      if (!event) continue;
      if (event.type === 'delta') onDelta(String(event.data.text ?? ''));
      else if (event.type === 'action' && event.data.action) onAction(event.data.action as RoomAction);
      else if (event.type === 'done') return event.data as unknown as ChatDone;
      else if (event.type === 'error') throw new ChatError(String(event.data.message ?? 'Не получилось ответить'));
    }
  }
  throw new OfflineError('Связь оборвалась, пока персонаж отвечал');
}

function parseEvent(raw: string): { type: string; data: Record<string, unknown> } | null {
  let type = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null; // ping от сервера
  try {
    return { type, data: JSON.parse(data) as Record<string, unknown> };
  } catch {
    return null;
  }
}

function parseMessage(text: string): string | null {
  try {
    const message = (JSON.parse(text) as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  } catch {
    return null;
  }
}
