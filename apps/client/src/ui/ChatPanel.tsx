import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAccountStore } from '../store/accountStore';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import { useInteractionStore } from '../store/interactionStore';
import { useReaderStore } from '../store/readerStore';
import { ACTION_ICONS, actionLabel, type RoomAction } from '../chat/actions';
import { unlockAudio } from '../audio/player';

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
  }, [messages, pending, open]);

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

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    // Персонаж может включить музыку по ходу ответа, а браузеры дают звук только в ответ на нажатие.
    unlockAudio();
    const text = draft;
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
    if (window.confirm(`Начать разговор заново? ${characterName} забудет, о чём вы говорили.`)) void useChatStore.getState().clear();
  };

  return (
    <aside className="sheet chat" aria-label={`Разговор: ${characterName}`}>
      <header className="sheet-header">
        <div>
          <h2 className="sheet-title">{characterName}</h2>
          <p className="sheet-subtitle">{pending ? (pending.answer ? 'отвечает…' : 'думает…') : 'живёт в этой комнате'}</p>
        </div>
        <div className="chat-actions">
          {status === 'ready' && messages.length > 0 && (
            <button type="button" className="sheet-close" onClick={onClear} title="Начать заново" aria-label="Начать разговор заново">
              ⟲
            </button>
          )}
          <button type="button" className="sheet-close" onClick={() => useChatStore.getState().closeChat()} title="Esc" aria-label="Закрыть">
            ✕
          </button>
        </div>
      </header>

      {account !== 'signed-in' ? (
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
            {messages.map((message) => (
              <div key={message.id} className="chat-entry" data-role={message.role}>
                <p className="chat-message" data-role={message.role}>
                  {message.text}
                </p>
                <ActionNotes actions={message.actions} name={characterName} />
              </div>
            ))}
            {pending && (
              <>
                <p className="chat-message" data-role="user">
                  {pending.question}
                </p>
                <div className="chat-entry" data-role="assistant">
                  <p className="chat-message" data-role="assistant" data-pending={!pending.answer}>
                    {pending.answer || '…'}
                  </p>
                  <ActionNotes actions={pending.actions} name={characterName} />
                </div>
              </>
            )}
            {error && (
              <p className="chat-error" role="alert">
                {error}
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
              placeholder={remaining > 0 ? 'Сообщение…' : 'На сегодня сообщения закончились'}
              aria-label="Сообщение"
              rows={1}
              maxLength={2000}
              disabled={status !== 'ready' || remaining <= 0}
            />
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
