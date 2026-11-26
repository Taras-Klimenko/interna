import { create } from 'zustand';
import { ChatError, clearChat, loadChat, sendAway, sendChat, sendEvent, type ChatDone, type ChatMessage, type RoomEvent } from '../api/chat';
import { ApiError, OfflineError } from '../api/http';
import { buildChatContext } from '../chat/context';
import { applyRoomActionNow, performRoomAction, type RoomAction } from '../chat/actions';
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
  /**
   * На что персонаж сейчас отвечает (реплика хозяина или событие в комнате) и что он уже успел «сказать».
   */
  pending: { kind: 'message' | 'event'; question: string; answer: string; actions: RoomAction[] } | null;
  /** Последняя ошибка отправки — показываем в панели, текст вопроса возвращаем в поле ввода. */
  error: string | null;
  used: number;
  limit: number;
  /** Реплика над головой персонажа. */
  bubble: { text: string; until: number } | null;
  /** Персонаж сказал что-то, пока чат был закрыт: точка на кнопке «Поговорить». */
  unread: boolean;
  /** Карточка «Пока тебя не было…». */
  awayStory: { moments: string[]; hoursAway: number } | null;
  /** Для какого пользователя загружена история: после смены аккаунта грузим заново. */
  userId: string | null;
  /** Загрузить историю (если ещё не загружена). */
  ensureLoaded: () => Promise<void>;
  openChat: () => void;
  closeChat: () => void;
  /** Отправить реплику. Возвращает false, если не получилось (текст стоит вернуть в поле ввода). */
  send: (text: string) => Promise<boolean>;
  /** Что-то произошло в комнате — персонаж откликается сам. label — заметка в чате, пока ждём ответ. */
  react: (events: RoomEvent[], label: string) => Promise<boolean>;
  clear: () => Promise<void>;
  /** Хозяин вернулся после перерыва: персонаж рассказывает, что было. false — не получилось (или рано). */
  away: (hoursAway: number) => Promise<boolean>;
  closeAwayStory: () => void;
}

let controller: AbortController | null = null;
let loading: Promise<void> | null = null;

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

type Stream = (
  onDelta: (text: string) => void,
  onAction: (action: RoomAction) => void,
  signal: AbortSignal,
) => Promise<ChatDone>;

export const useChatStore = create<ChatStore>()((set, get) => {
  /** Общий путь для реплики и события: ответ потоком, действия сразу, реплика над головой. */
  async function reply(kind: 'message' | 'event', question: string, stream: Stream) {
    controller = new AbortController();
    set({ pending: { kind, question, answer: '', actions: [] }, error: null, bubble: { text: '', until: Infinity } });
    startTalking();
    try {
      const done = await stream(
        (delta) =>
          set((s) => {
            const answer = (s.pending?.answer ?? '') + delta;
            return { pending: s.pending && { ...s.pending, answer }, bubble: { text: answer, until: Infinity } };
          }),
        (action) => {
          // Персонаж берётся за дело сразу, не дожидаясь конца ответа.
          performRoomAction(action);
          set((s) => ({ pending: s.pending && { ...s.pending, actions: [...s.pending.actions, action] } }));
        },
        controller.signal,
      );
      const asked: ChatMessage = done.asked ?? {
        id: `q-${done.message.id}`,
        role: 'user',
        kind,
        text: question,
        createdAt: done.message.createdAt,
      };
      set((s) => ({
        messages: [...s.messages, asked, done.message],
        pending: null,
        used: done.used,
        limit: done.limit,
        bubble: { text: done.message.text, until: Date.now() + bubbleMs(done.message.text) },
        unread: s.unread || !s.open,
      }));
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 401) useAccountStore.getState().expire();
      const aborted = controller?.signal.aborted;
      // Событие без ответа — не беда: показывать ошибку не нужно, персонаж просто промолчал.
      set({ pending: null, bubble: null, error: aborted || kind === 'event' ? null : errorText(error) });
      return false;
    } finally {
      controller = null;
      stopTalking();
    }
  }

  return {
    open: false,
    status: 'idle',
    messages: [],
    pending: null,
    error: null,
    used: 0,
    limit: 0,
    bubble: null,
    unread: false,
    awayStory: null,
    userId: null,

    ensureLoaded: () => {
      const { token, user, status } = useAccountStore.getState();
      if (status !== 'signed-in' || !token || !user) return Promise.resolve();
      if (get().userId === user.id && (get().status === 'ready' || get().status === 'disabled')) return Promise.resolve();
      if (loading) return loading;
      set({ status: 'loading', userId: user.id, error: null });
      loading = loadChat(token)
        .then((state) =>
          set({ status: state.enabled ? 'ready' : 'disabled', messages: state.messages, used: state.used, limit: state.limit }),
        )
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) useAccountStore.getState().expire();
          set({ status: 'error', error: errorText(error) });
        })
        .finally(() => {
          loading = null;
        });
      return loading;
    },

    openChat: () => {
      // Чат и панели предметов занимают одно место на экране.
      useInteractionStore.getState().closePanel();
      set({ open: true, unread: false });
      void get().ensureLoaded();
    },

    closeChat: () => set({ open: false }),

    send: async (text) => {
      const question = text.trim();
      const { token } = useAccountStore.getState();
      if (!question || !token || get().pending) return false;
      return reply('message', question, (onDelta, onAction, signal) =>
        sendChat(token, { message: question, context: buildChatContext() }, onDelta, onAction, signal),
      );
    },

    react: async (events, label) => {
      const { token } = useAccountStore.getState();
      if (!token || get().pending || get().status !== 'ready') return false;
      return reply('event', label, (onDelta, onAction, signal) =>
        sendEvent(token, { events, context: buildChatContext() }, onDelta, onAction, signal),
      );
    },

    away: async (hoursAway) => {
      const { token } = useAccountStore.getState();
      await get().ensureLoaded();
      if (!token || get().pending || get().status !== 'ready') return false;
      set({ bubble: { text: '', until: Infinity } });
      try {
        const story = await sendAway(token, hoursAway, buildChatContext());
        // Что изменилось в комнате без хозяина — сразу, без прогулки персонажа.
        for (const action of story.actions) applyRoomActionNow(action);
        set((s) => ({
          messages: [...s.messages, story.asked, story.message],
          bubble: { text: story.message.text, until: Date.now() + bubbleMs(story.message.text) },
          awayStory: story.moments.length > 0 ? { moments: story.moments, hoursAway } : null,
          unread: s.unread || !s.open,
        }));
        return true;
      } catch {
        // Рано (уже рассказывал), нет связи — ничего страшного: без рассказа комната та же.
        set({ bubble: null });
        return false;
      }
    },

    closeAwayStory: () => set({ awayStory: null }),

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
  };
});

/** Вышли из аккаунта — разговор этого пользователя больше не показываем. */
useAccountStore.subscribe((state, previous) => {
  if (state.status !== 'signed-in' && previous.status === 'signed-in') {
    controller?.abort();
    useChatStore.setState({ status: 'idle', messages: [], pending: null, userId: null, bubble: null, error: null, unread: false, awayStory: null });
  }
});
