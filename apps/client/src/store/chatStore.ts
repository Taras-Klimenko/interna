import { create } from 'zustand';
import { ChatError, clearChat, loadChat, sendChat, type ChatMessage } from '../api/chat';
import { ApiError, OfflineError } from '../api/http';
import { buildChatContext } from '../chat/context';
import { useAccountStore } from './accountStore';
import { useCharacterStore } from './characterStore';
import { useInteractionStore } from './interactionStore';

/** Анимация, пока персонаж отвечает. */
export const TALK_CLIP = 'Idle_Talking_Loop';
/** Сколько реплика висит над головой после ответа: зависит от длины, но в разумных пределах. */
const bubbleMs = (text: string) => Math.min(14_000, Math.max(5_000, text.length * 70));

/**
 * loading — грузим историю; disabled — на сервере не настроена модель; ready — можно говорить;
 * error — не загрузили историю (нет связи).
 */
export type ChatStatus = 'idle' | 'loading' | 'disabled' | 'ready' | 'error';

interface ChatStore {
  open: boolean;
  status: ChatStatus;
  messages: ChatMessage[];
  /** Вопрос, на который персонаж сейчас отвечает, и то, что он уже успел «сказать». */
  pending: { question: string; answer: string } | null;
  /** Последняя ошибка отправки — показываем в панели, текст вопроса возвращаем в поле ввода. */
  error: string | null;
  used: number;
  limit: number;
  /** Реплика над головой персонажа. */
  bubble: { text: string; until: number } | null;
  /** Для какого пользователя загружена история: после смены аккаунта грузим заново. */
  userId: string | null;
  openChat: () => void;
  closeChat: () => void;
  /** Отправить реплику. Возвращает false, если не получилось (текст стоит вернуть в поле ввода). */
  send: (text: string) => Promise<boolean>;
  clear: () => Promise<void>;
}

let controller: AbortController | null = null;

function errorText(error: unknown) {
  if (error instanceof ChatError) return error.message;
  if (error instanceof OfflineError) return 'Нет связи с сервером — попробуйте ещё раз.';
  if (error instanceof ApiError) return error.body.message ?? 'Не получилось';
  return 'Не получилось — попробуйте ещё раз.';
}

/** Персонаж ничем не занят — можно «говорить» анимацией. Дела и прогулки не прерываем. */
function startTalking() {
  const character = useCharacterStore.getState();
  if (!character.task && !character.target && !character.manualClip) useCharacterStore.setState({ manualClip: TALK_CLIP });
}

function stopTalking() {
  if (useCharacterStore.getState().manualClip === TALK_CLIP) useCharacterStore.setState({ manualClip: null });
}

export const useChatStore = create<ChatStore>()((set, get) => ({
  open: false,
  status: 'idle',
  messages: [],
  pending: null,
  error: null,
  used: 0,
  limit: 0,
  bubble: null,
  userId: null,

  openChat: () => {
    // Чат и панели предметов занимают одно место на экране.
    useInteractionStore.getState().closePanel();
    set({ open: true });
    const { token, user, status } = useAccountStore.getState();
    if (status !== 'signed-in' || !token || !user) return;
    if (get().userId === user.id && get().status !== 'error' && get().status !== 'idle') return;
    set({ status: 'loading', userId: user.id, error: null });
    loadChat(token)
      .then((state) =>
        set({ status: state.enabled ? 'ready' : 'disabled', messages: state.messages, used: state.used, limit: state.limit }),
      )
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) useAccountStore.getState().expire();
        set({ status: 'error', error: errorText(error) });
      });
  },

  closeChat: () => set({ open: false }),

  send: async (text) => {
    const question = text.trim();
    const { token } = useAccountStore.getState();
    if (!question || !token || get().pending) return false;
    controller = new AbortController();
    set({ pending: { question, answer: '' }, error: null, bubble: { text: '', until: Infinity } });
    startTalking();
    try {
      const done = await sendChat(
        token,
        { message: question, context: buildChatContext() },
        (delta) =>
          set((s) => {
            const answer = (s.pending?.answer ?? '') + delta;
            return { pending: s.pending && { ...s.pending, answer }, bubble: { text: answer, until: Infinity } };
          }),
        controller.signal,
      );
      const asked: ChatMessage = { id: `q-${done.message.id}`, role: 'user', text: question, createdAt: done.message.createdAt };
      set((s) => ({
        messages: [...s.messages, asked, done.message],
        pending: null,
        used: done.used,
        limit: done.limit,
        bubble: { text: done.message.text, until: Date.now() + bubbleMs(done.message.text) },
      }));
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 401) useAccountStore.getState().expire();
      const aborted = controller?.signal.aborted;
      set({ pending: null, bubble: null, error: aborted ? null : errorText(error) });
      return false;
    } finally {
      controller = null;
      stopTalking();
    }
  },

  clear: async () => {
    const { token } = useAccountStore.getState();
    if (!token) return;
    controller?.abort();
    try {
      await clearChat(token);
      set({ messages: [], error: null, bubble: null });
    } catch (error) {
      set({ error: errorText(error) });
    }
  },
}));

/** Вышли из аккаунта — разговор этого пользователя больше не показываем. */
useAccountStore.subscribe((state, previous) => {
  if (state.status !== 'signed-in' && previous.status === 'signed-in') {
    controller?.abort();
    useChatStore.setState({ status: 'idle', messages: [], pending: null, userId: null, bubble: null, error: null });
  }
});
