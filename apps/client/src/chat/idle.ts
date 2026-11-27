import { api } from '../api/http';
import type { ChatContext } from '../api/chat';
import { buildChatContext } from './context';
import { performRoomAction, type RoomAction } from './actions';
import { useAccountStore } from '../store/accountStore';
import { useChatStore } from '../store/chatStore';
import { useCharacterStore } from '../store/characterStore';
import { useEditorStore } from '../store/editorStore';
import { useReaderStore } from '../store/readerStore';
import { useUiStore } from '../store/uiStore';
import { useWorldStore } from '../store/worldStore';

/**
 * Тихие минуты: пока вы в комнате и не разговариваете, персонаж раз в несколько минут сам решает,
 * чем заняться — полить растение, включить свет, когда стемнело, поставить музыку или просто побыть рядом.
 * Решает модель (POST /api/chat/idle), а сервер ограничивает частоту: не чаще раза в 3 минуты и не больше
 * CHAT_IDLE_HOURLY_LIMIT раз в час.
 */

/** Между решениями — случайно от MIN до MAX минут, чтобы не выглядело как по часам. */
const MIN_MINUTES = 4;
const MAX_MINUTES = 8;
/** После разговора не встреваем столько: вы могли просто задуматься над ответом. */
const AFTER_TALK_MS = 2 * 60_000;
const CHECK_MS = 30_000;
/** Сколько висит фраза «себе под нос». */
const SAY_MS = 6_000;

interface IdleDecision {
  say: string | null;
  actions: RoomAction[];
}

const nextDelay = () => (MIN_MINUTES + Math.random() * (MAX_MINUTES - MIN_MINUTES)) * 60_000;

/** Спросить модель прямо сейчас и выполнить решение. Возвращает решение (или null, если спросить нельзя). */
export async function decideNow(): Promise<IdleDecision | null> {
  const { token } = useAccountStore.getState();
  if (!token || useChatStore.getState().status !== 'ready' || useChatStore.getState().pending) return null;
  let decision: IdleDecision;
  try {
    decision = await api<IdleDecision>('/chat/idle', { method: 'POST', token, body: { context: buildChatContext() satisfies ChatContext } });
  } catch {
    // 429 (уже решал недавно), нет связи — ничего страшного, попробуем в следующий раз.
    return null;
  }
  // Пока модель думала, вы могли заговорить или попросить персонажа о чём-то — тогда решение уже ни к чему.
  if (useChatStore.getState().pending || isBusy()) return decision;
  for (const action of decision.actions) performRoomAction(action);
  if (decision.say) useChatStore.getState().say(decision.say, SAY_MS);
  return decision;
}

/** Персонаж чем-то занят: идёт, делает дело, играет анимацию. */
function isBusy() {
  const character = useCharacterStore.getState();
  return !!(character.task || character.target || character.manualClip);
}

/** Запустить тихие минуты для вошедшего пользователя. Возвращает функцию остановки. */
export function startIdleLife() {
  let nextAt = Date.now() + nextDelay();
  let lastTalk = Date.now();
  let deciding = false;

  const unsubscribeChat = useChatStore.subscribe((state, previous) => {
    if (state.messages.length !== previous.messages.length || (state.pending && !previous.pending)) lastTalk = Date.now();
  });

  const tick = window.setInterval(() => {
    const now = Date.now();
    if (deciding || now < nextAt) return;
    const present = document.visibilityState === 'visible' && document.hasFocus();
    const quiet =
      now - lastTalk >= AFTER_TALK_MS &&
      !useChatStore.getState().pending &&
      !useChatStore.getState().bubble &&
      !isBusy() &&
      !useEditorStore.getState().active &&
      !useReaderStore.getState().open &&
      // Во время знакомства и в редакторе внешности — не до своих дел.
      useWorldStore.getState().world.onboarded !== false &&
      !useUiStore.getState().appearanceEditor;
    // Гуляете один — персонажа рядом нет, тихих минут тоже.
    const alone = useUiStore.getState().place === 'field' && !useUiStore.getState().walkTogether;
    if (!present || !quiet || alone) return;
    deciding = true;
    nextAt = now + nextDelay();
    void decideNow().finally(() => {
      deciding = false;
    });
  }, CHECK_MS);

  return () => {
    window.clearInterval(tick);
    unsubscribeChat();
  };
}
