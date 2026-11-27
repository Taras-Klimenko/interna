import { useEffect, useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { useUiStore, type Biome } from '../store/uiStore';
import { BIOME_LABELS, TERRAINS } from '../field/biomes';
import { PHASE_ICONS, PHASE_LABELS, phaseOf } from '../scene/timeOfDay';
import { useRoomHour } from './useRoomHour';
import { useEditorStore } from '../store/editorStore';
import { AccountBadge } from './AccountBadge';
import { useChatStore } from '../store/chatStore';
import { useAccountStore } from '../store/accountStore';
import { useInteractionStore } from '../store/interactionStore';
import { callCompanion, resetWalk } from '../field/fieldState';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';

/** Взять персонажа на прогулку или отпустить домой. Позвали посреди прогулки — он догоняет. */
function toggleCompanion() {
  const { walkTogether, setWalkTogether } = useUiStore.getState();
  const { name, appearance } = useWorldStore.getState().world.character;
  const who = name.trim() || DEFAULT_CHARACTER_NAME;
  const female = appearance.body === 'female';
  if (walkTogether) {
    setWalkTogether(false);
    useInteractionStore.getState().notify(`${who} ${female ? 'пошла' : 'пошёл'} домой — можно переписываться`);
  } else {
    callCompanion();
    setWalkTogether(true);
    useInteractionStore.getState().notify(`${who} догоняет вас`);
  }
}

/** На прогулку — в поле за домом или на пляж. Из комнаты или прямо с другой прогулки: персонаж (если гуляет с вами) — рядом. */
function goOutside(biome: Biome) {
  useEditorStore.getState().setActive(false);
  useUiStore.getState().setFirstPerson(false);
  useInteractionStore.getState().reset();
  useUiStore.getState().setBiome(biome);
  resetWalk(TERRAINS[biome].start);
  useUiStore.getState().setPlace('field');
}

const BIOMES: Biome[] = ['meadow', 'beach'];

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
  const outside = useUiStore((s) => s.place === 'field');
  const biome = useUiStore((s) => s.biome);
  /** Открыт выбор, куда пойти гулять. */
  const [walkMenu, setWalkMenu] = useState(false);
  const walkTogether = useUiStore((s) => s.walkTogether);
  const characterName = useWorldStore((s) => s.world.character.name.trim()) || DEFAULT_CHARACTER_NAME;
  const chatOpen = useChatStore((s) => s.open);
  const chatUnread = useChatStore((s) => s.unread);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Без сервера (сборка без VITE_API_URL) разговаривать не через кого.
  const chatAvailable = useAccountStore((s) => s.status !== 'disabled');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.code;
      const inside = useUiStore.getState().firstPerson;
      const field = useUiStore.getState().place === 'field';
      // На прогулке комнатные клавиши ни к чему: только время суток и разговор.
      if (field && key !== 'KeyT' && key !== 'KeyC') return;
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
        <span className="hud-subtitle">прототип</span>
        <AccountBadge />
      </header>

      <div className="hud-toolbar" role="toolbar" aria-label="Камера">
        {outside && (
          <button type="button" className="hud-inside" onClick={() => useUiStore.getState().setPlace('room')} title="Вернуться в комнату">
            <span aria-hidden="true">⌂</span>
            <span className="hud-time-label">Домой</span>
          </button>
        )}
        {outside && (
          <button
            type="button"
            className="hud-inside"
            onClick={toggleCompanion}
            aria-pressed={walkTogether}
            title={walkTogether ? `${characterName} гуляет с вами — отпустить домой` : 'Позвать с собой на прогулку'}
          >
            <span aria-hidden="true">{walkTogether ? '👫' : '🚶'}</span>
            <span className="hud-time-label">{walkTogether ? 'Вдвоём' : 'Один'}</span>
          </button>
        )}
        {!firstPerson && !outside && (
          <>
            <button type="button" className="hud-rotate" onClick={() => requestRotate(-1)} title="Повернуть влево (Q)">
              ⟲
            </button>
            <button type="button" className="hud-rotate" onClick={() => requestRotate(1)} title="Повернуть вправо (E)">
              ⟳
            </button>
            <span className="hud-sep hud-rotate" />
            <button type="button" className="hud-grid" onClick={toggleGrid} aria-pressed={showGrid || editing} disabled={editing} title="Сетка (G)">
              Сетка
            </button>
          </>
        )}
        {!editing && (
          <button
            type="button"
            className="hud-inside hud-walk"
            onClick={() => setWalkMenu((open) => !open)}
            aria-pressed={walkMenu}
            aria-haspopup="menu"
            title={outside ? 'Пойти в другое место' : 'На прогулку'}
          >
            <span aria-hidden="true">{outside ? '🧭' : '🌼'}</span>
            <span className="hud-time-label">{outside ? 'Куда' : 'Гулять'}</span>
          </button>
        )}
        {!editing && !outside && (
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
        <button
          type="button"
          className="hud-settings"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-pressed={settingsOpen}
          aria-label="Настройки: звук и графика"
          title="Звук и графика"
        >
          ⚙
        </button>
        {!outside && <span className="hud-sep" />}
        {!outside && (
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
        )}
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {walkMenu && (
        <WalkMenu
          current={outside ? biome : null}
          onPick={(next) => {
            setWalkMenu(false);
            goOutside(next);
          }}
          onClose={() => setWalkMenu(false)}
        />
      )}

      {outside ? (
        <>
          <p className="hud-hint hud-hint-desktop">
            WASD или стрелки — идти · Shift — бегом · тяните мышью — смотреть · клик по земле — дойти туда · C — поговорить · T — время суток
          </p>
          <p className="hud-hint hud-hint-touch">Тап по земле — идти · потяните — осмотреться</p>
        </>
      ) : editing ? (
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

/** Куда пойти гулять: поле или пляж. На прогулке текущее место отмечено, выбрать его ещё раз — вернуться к началу. */
function WalkMenu({ current, onPick, onClose }: { current: Biome | null; onPick: (biome: Biome) => void; onClose: () => void }) {
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!target.closest?.('.walk-menu') && !target.closest?.('.hud-walk')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="walk-menu" role="menu" aria-label="Куда пойти">
      {BIOMES.map((item) => (
        <button key={item} type="button" role="menuitem" className="walk-option" aria-current={current === item} onClick={() => onPick(item)}>
          <span className="walk-icon" aria-hidden="true">
            {BIOME_LABELS[item].icon}
          </span>
          <span>
            <span className="walk-label">{BIOME_LABELS[item].label}</span>
            <span className="walk-title">{current === item ? 'Вы здесь — вернуться к началу' : BIOME_LABELS[item].title}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
