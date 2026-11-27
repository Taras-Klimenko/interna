import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAccountStore } from '../store/accountStore';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import { useInteractionStore } from '../store/interactionStore';
import { useReaderStore } from '../store/readerStore';
import { ACTION_ICONS, actionLabel, type RoomAction } from '../chat/actions';
import { unlockAudio } from '../audio/player';
import { MemoryView } from './MemoryView';
import { canListen, canSpeak, startListening, stopSpeaking, unlockSpeech, useVoiceStore } from '../audio/voice';

/** Дольше этого держали микрофон — «нажал и говори»: отпустили — отправили. Короче — нажали ещё раз, чтобы отправить. */
const HOLD_MS = 350;

/** Когда до дневного лимита остаётся столько сообщений, показываем счётчик. */
const SHOW_REMAINING_BELOW = 10;

/** Разговор с персонажем: история, ответ «печатается» по мере того, как персонаж его пишет. */
export function ChatPanel() {
  const open = useChatStore((s) => s.open);
  const status = useChatStore((s) => s.status);
  const messages = useChatStore((s) => s.messages);
  const pending = useChatStore((s) => s.pending);
  const error = useChatStore((s) => s.error);
  const used = useChatStore((s) => s.used);
  const limit = useChatStore((s) => s.limit);
  const account = useAccountStore((s) => s.status);
  const name = useWorldStore((s) => s.world.character.name);
  const [draft, setDraft] = useState('');
  const voiceReply = useVoiceStore((s) => s.reply);
  /** Слушаем микрофон — текст в поле ввода меняется по мере распознавания. */
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  /** Вместо разговора — что персонаж помнит. */
  const [showMemory, setShowMemory] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Открыли панель предмета — чат уступает ей место.
  const objectPanel = useInteractionStore((s) => s.panel);
  useEffect(() => {
    if (objectPanel) useChatStore.getState().closeChat();
  }, [objectPanel]);

  // Вошли в аккаунт с открытым чатом — подгружаем разговор.
  useEffect(() => {
    if (open && account === 'signed-in') useChatStore.getState().openChat();
  }, [open, account]);

  // Новые реплики — прокручиваем вниз.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, pending, open, showMemory]);

  useEffect(() => {
    if (!open) return;
    if (window.matchMedia('(hover: hover)').matches) inputRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !useReaderStore.getState().open) useChatStore.getState().closeChat();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || account === 'disabled') return null;

  const characterName = name.trim() || DEFAULT_CHARACTER_NAME;
  const remaining = limit - used;
  const canSend = status === 'ready' && !pending && draft.trim().length > 0 && remaining > 0;

  const canTalk = status === 'ready' && !pending && remaining > 0;

  const submit = async (e?: FormEvent, spoken?: string) => {
    e?.preventDefault();
    const text = spoken ?? draft;
    if (!canTalk || !text.trim()) return;
    // Персонаж может включить музыку по ходу ответа, а браузеры дают звук только в ответ на нажатие.
    unlockAudio();
    unlockSpeech();
    setVoiceError(null);
    setDraft('');
    const ok = await useChatStore.getState().send(text);
    // Не получилось — возвращаем текст, чтобы не набирать заново.
    if (!ok) setDraft((current) => current || text);
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter — отправить, Shift+Enter — новая строка. На телефоне Enter — просто новая строка.
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) {
      e.preventDefault();
      void submit();
    }
  };

  const onClear = () => {
    if (window.confirm(`Начать разговор заново? ${characterName} забудет, о чём вы говорили. То, что запомнено о вас, и дневник останутся — их можно посмотреть в «Памяти».`))
      void useChatStore.getState().clear();
  };

  return (
    <aside className="sheet chat" aria-label={`Разговор: ${characterName}`}>
      <header className="sheet-header">
        <div>
          <h2 className="sheet-title">{characterName}</h2>
          <p className="sheet-subtitle">
            {showMemory ? 'память и дневник' : pending ? (pending.answer ? 'отвечает…' : 'думает…') : 'живёт в этой комнате'}
          </p>
        </div>
        <div className="chat-actions">
          {status === 'ready' && (
            <button
              type="button"
              className="sheet-close"
              onClick={() => setShowMemory((shown) => !shown)}
              aria-pressed={showMemory}
              title={showMemory ? 'К разговору' : 'Память'}
              aria-label={showMemory ? 'Вернуться к разговору' : 'Что помнит персонаж'}
            >
              {showMemory ? '💬' : '🧠'}
            </button>
          )}
          {canSpeak() && (
            <button
              type="button"
              className="sheet-close"
              onClick={() => {
                unlockSpeech();
                if (voiceReply) stopSpeaking();
                useVoiceStore.getState().set({ reply: !voiceReply });
              }}
              aria-pressed={voiceReply}
              title={voiceReply ? 'Отвечает голосом — выключить' : 'Отвечать голосом'}
              aria-label={voiceReply ? 'Не отвечать голосом' : 'Отвечать голосом'}
            >
              {voiceReply ? '🔊' : '🔈'}
            </button>
          )}
          {status === 'ready' && !showMemory && messages.length > 0 && (
            <button type="button" className="sheet-close" onClick={onClear} title="Начать заново" aria-label="Начать разговор заново">
              ⟲
            </button>
          )}
          <button type="button" className="sheet-close" onClick={() => useChatStore.getState().closeChat()} title="Esc" aria-label="Закрыть">
            ✕
          </button>
        </div>
      </header>

      {account === 'signed-in' && showMemory ? (
        <div className="sheet-body">
          <MemoryView name={characterName} />
        </div>
      ) : account !== 'signed-in' ? (
        <div className="sheet-body">
          <p className="sheet-empty">
            Чтобы поговорить, нужно войти: персонаж отвечает через сервер, а без входа комната живёт только в этом браузере.
          </p>
          <button type="button" className="book-submit" onClick={() => useAccountStore.getState().showLogin()}>
            Войти
          </button>
        </div>
      ) : (
        <>
          <div className="sheet-body chat-list" ref={listRef} aria-live="polite">
            {status === 'loading' && <p className="sheet-empty">Вспоминаю разговор…</p>}
            {status === 'disabled' && <p className="sheet-empty">Разговоры пока не настроены на сервере: не задан ключ модели.</p>}
            {status === 'ready' && messages.length === 0 && !pending && (
              <p className="sheet-empty">Напишите что-нибудь — {characterName} знает, что стоит в комнате и что лежит на полках.</p>
            )}
            {messages.map((message) =>
              message.kind === 'event' ? (
                <p key={message.id} className="chat-event">
                  {message.text}
                </p>
              ) : (
                <div key={message.id} className="chat-entry" data-role={message.role}>
                  <p className="chat-message" data-role={message.role}>
                    {message.text}
                  </p>
                  <ActionNotes actions={message.actions} name={characterName} />
                </div>
              ),
            )}
            {pending && (
              <>
                {pending.kind === 'event' ? (
                  <p className="chat-event">{pending.question}</p>
                ) : (
                  <p className="chat-message" data-role="user">
                    {pending.question}
                  </p>
                )}
                <div className="chat-entry" data-role="assistant">
                  <p className="chat-message" data-role="assistant" data-pending={!pending.answer}>
                    {pending.answer || '…'}
                  </p>
                  <ActionNotes actions={pending.actions} name={characterName} />
                </div>
              </>
            )}
            {(voiceError ?? error) && (
              <p className="chat-error" role="alert">
                {voiceError ?? error}
              </p>
            )}
          </div>

          <form className="chat-form" onSubmit={(e) => void submit(e)}>
            <textarea
              ref={inputRef}
              className="chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={listening ? 'Говорите…' : remaining > 0 ? 'Сообщение…' : 'На сегодня сообщения закончились'}
              aria-label="Сообщение"
              rows={1}
              maxLength={2000}
              disabled={status !== 'ready' || remaining <= 0}
              readOnly={listening}
            />
            {canListen() && (
              <MicButton
                disabled={!canTalk}
                onListening={setListening}
                onText={setDraft}
                onDone={(text) => void submit(undefined, text)}
                onError={setVoiceError}
              />
            )}
            <button type="submit" className="chat-send" disabled={!canSend} aria-label="Отправить">
              ↑
            </button>
          </form>
          {status === 'ready' && remaining < SHOW_REMAINING_BELOW && (
            <p className="chat-limit">{remaining > 0 ? `Сегодня можно ещё ${remaining}` : 'Продолжим завтра'}</p>
          )}
        </>
      )}
    </aside>
  );
}

/**
 * Микрофон: нажмите и держите, пока говорите, — отпустили, и сказанное отправилось.
 * Или коротко нажмите, скажите и нажмите ещё раз. Пока вы говорите, персонаж замолкает.
 */
function MicButton({
  disabled,
  onListening,
  onText,
  onDone,
  onError,
}: {
  disabled: boolean;
  onListening: (listening: boolean) => void;
  onText: (text: string) => void;
  onDone: (text: string) => void;
  onError: (message: string | null) => void;
}) {
  const [active, setActive] = useState(false);
  const session = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const pressedAt = useRef(0);

  // Закрыли чат, пока слушали, — бросаем распознавание.
  useEffect(() => () => session.current?.abort(), []);

  const start = () => {
    unlockAudio();
    unlockSpeech();
    onError(null);
    setActive(true);
    onListening(true);
    let ended = false;
    const listening = startListening({
      onText,
      onEnd: (text) => {
        ended = true;
        session.current = null;
        setActive(false);
        onListening(false);
        if (text.trim()) onDone(text);
        else onText('');
      },
      onError,
    });
    // Не включился (onEnd пришёл сразу) — сессии нет.
    if (!ended) session.current = listening;
  };

  const stop = () => session.current?.stop();

  return (
    <button
      type="button"
      className="chat-mic"
      data-active={active}
      disabled={disabled && !active}
      aria-pressed={active}
      aria-label={active ? 'Закончить и отправить' : 'Сказать голосом'}
      title={active ? 'Отпустите или нажмите ещё раз — отправить' : 'Держите и говорите (или нажмите, скажите и нажмите ещё раз)'}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (session.current) {
          stop();
          return;
        }
        pressedAt.current = Date.now();
        start();
      }}
      onPointerUp={() => {
        // Держали — «нажал и говори»: отпустили, значит, всё сказали.
        if (session.current && pressedAt.current && Date.now() - pressedAt.current > HOLD_MS) stop();
        pressedAt.current = 0;
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (session.current) stop();
        else start();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      🎤
    </button>
  );
}

/** Что персонаж сделал в комнате вместе с ответом: «💡 Ева включает свет — Торшер». */
function ActionNotes({ actions, name }: { actions?: RoomAction[]; name: string }) {
  if (!actions || actions.length === 0) return null;
  return (
    <ul className="chat-actions-list">
      {actions.map((action, index) => (
        <li key={index}>
          <span aria-hidden="true">{ACTION_ICONS[action.type]}</span> {name} {actionLabel(action)}
        </li>
      ))}
    </ul>
  );
}
