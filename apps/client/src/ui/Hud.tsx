import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { PHASE_ICONS, PHASE_LABELS, phaseOf } from '../scene/timeOfDay';
import { useRoomHour } from './useRoomHour';
import { useEditorStore } from '../store/editorStore';
import { AccountBadge } from './AccountBadge';
import { useChatStore } from '../store/chatStore';
import { useAccountStore } from '../store/accountStore';

export function Hud() {
  const showGrid = useUiStore((s) => s.showGrid);
  const toggleGrid = useUiStore((s) => s.toggleGrid);
  const requestRotate = useUiStore((s) => s.requestRotate);
  const editing = useEditorStore((s) => s.active);
  const setEditing = useEditorStore((s) => s.setActive);
  const timeMode = useUiStore((s) => s.timeMode);
  const cycleTimeMode = useUiStore((s) => s.cycleTimeMode);
  const phase = phaseOf(useRoomHour());
  const firstPerson = useUiStore((s) => s.firstPerson) && !editing;
  const setFirstPerson = useUiStore((s) => s.setFirstPerson);
  const chatOpen = useChatStore((s) => s.open);
  const chatUnread = useChatStore((s) => s.unread);
  // Без сервера (сборка без VITE_API_URL) разговаривать не через кого.
  const chatAvailable = useAccountStore((s) => s.status !== 'disabled');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.code;
      const inside = useUiStore.getState().firstPerson;
      // Изнутри Q/E и G ни к чему: камеры-диорамы и сетки там нет.
      if (key === 'KeyQ' && !inside) requestRotate(-1);
      else if (key === 'KeyE' && !inside) requestRotate(1);
      else if (key === 'KeyG' && !inside) toggleGrid();
      else if (key === 'KeyB') {
        setFirstPerson(false);
        setEditing(!useEditorStore.getState().active);
      } else if (key === 'KeyF' && !useEditorStore.getState().active) setFirstPerson(!inside);
      else if (key === 'KeyT') cycleTimeMode();
      else if (key === 'KeyC' && !useEditorStore.getState().active && useAccountStore.getState().status !== 'disabled') {
        const chat = useChatStore.getState();
        if (chat.open) chat.closeChat();
        else chat.openChat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestRotate, toggleGrid, setEditing, cycleTimeMode, setFirstPerson]);

  return (
    <>
      <header className="hud-brand">
        <span className="hud-title">Interna</span>
        <span className="hud-subtitle">прототип · тестовый персонаж</span>
        <AccountBadge />
      </header>

      <div className="hud-toolbar" role="toolbar" aria-label="Камера">
        {!firstPerson && (
          <>
            <button type="button" onClick={() => requestRotate(-1)} title="Повернуть влево (Q)">
              ⟲
            </button>
            <button type="button" onClick={() => requestRotate(1)} title="Повернуть вправо (E)">
              ⟳
            </button>
            <span className="hud-sep" />
            <button type="button" onClick={toggleGrid} aria-pressed={showGrid || editing} disabled={editing} title="Сетка (G)">
              Сетка
            </button>
          </>
        )}
        {!editing && (
          <button
            type="button"
            className="hud-inside"
            onClick={() => setFirstPerson(!firstPerson)}
            aria-pressed={firstPerson}
            title={firstPerson ? 'Вернуться к виду сверху (F)' : 'Войти в комнату (F)'}
          >
            <span aria-hidden="true">{firstPerson ? '⌂' : '🚶'}</span>
            <span className="hud-time-label">{firstPerson ? 'Выйти' : 'Войти'}</span>
          </button>
        )}
        {!editing && chatAvailable && (
          <button
            type="button"
            className="hud-inside"
            onClick={() => (chatOpen ? useChatStore.getState().closeChat() : useChatStore.getState().openChat())}
            aria-pressed={chatOpen}
            title="Поговорить (C)"
          >
            <span aria-hidden="true">💬</span>
            <span className="hud-time-label">Поговорить</span>
            {chatUnread && !chatOpen && <span className="hud-unread" aria-label="есть новая реплика" />}
          </button>
        )}
        <button
          type="button"
          className="hud-time"
          onClick={cycleTimeMode}
          title={`Время суток (T): ${timeMode === 'auto' ? 'как на ваших часах' : PHASE_LABELS[phase].toLowerCase()}`}
          aria-label={`Время суток: ${timeMode === 'auto' ? `как сейчас, ${PHASE_LABELS[phase].toLowerCase()}` : PHASE_LABELS[phase]}`}
        >
          <span aria-hidden="true">{PHASE_ICONS[phase]}</span>
          <span className="hud-time-label">{timeMode === 'auto' ? 'Сейчас' : PHASE_LABELS[phase]}</span>
        </button>
        <span className="hud-sep" />
        <button
          type="button"
          className="hud-mode"
          onClick={() => {
            setFirstPerson(false);
            setEditing(!editing);
          }}
          aria-pressed={editing}
          title="Режим расстановки (B)"
        >
          {editing ? 'Готово' : 'Обставить'}
        </button>
      </div>

      {editing ? (
        <>
          <p className="hud-hint hud-hint-desktop">
            Выберите предмет в каталоге и кликните по полу · перетащите предмет, чтобы передвинуть · R — повернуть · Del — убрать · Esc — отмена
          </p>
          <p className="hud-hint hud-hint-touch">Выберите предмет и коснитесь пола · потяните предмет, чтобы передвинуть</p>
        </>
      ) : firstPerson ? (
        <>
          <p className="hud-hint hud-hint-desktop">
            WASD или стрелки — идти · Shift — быстрее · тяните мышью — смотреть · клик по полу — дойти туда · клик по предмету — действия, рядом с ним вы делаете всё сами · F — выйти
          </p>
          <p className="hud-hint hud-hint-touch">Тап по полу — идти · потяните — осмотреться · тап по предмету — действия</p>
        </>
      ) : (
        <>
          <p className="hud-hint hud-hint-desktop">
            Клик по полу — идти · по лампе, колонке, растению, шкафу или рамке — действия · по персонажу или C — поговорить · перетаскивание — вращать · колесо — приблизить · Q / E — к соседнему углу · T — время суток · F — войти в комнату · B — обставить
          </p>
          <p className="hud-hint hud-hint-touch">Тап по полу — идти · по предмету — действия · один палец — вращать · два — приблизить</p>
        </>
      )}
    </>
  );
}
