import { useState } from 'react';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { useUiStore } from '../store/uiStore';
import { ANIMATION_GROUPS } from '../character/assets';
import { PersonalityFields } from './PersonalityFields';

/** На узких экранах (телефоны) панель стартует свёрнутой, чтобы не закрывать комнату. */
const startCollapsed = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/** Ручной запуск анимаций — только для разработки: откройте приложение с ?debug в адресе. */
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

/** Панель персонажа: имя, характер и кнопка редактора внешности. */
export function CharacterPanel() {
  const name = useWorldStore((s) => s.world.character.name);
  const [collapsed, setCollapsed] = useState(startCollapsed);

  return (
    <aside className="panel" data-collapsed={collapsed} aria-label="Персонаж">
      <button
        type="button"
        className="panel-toggle"
        aria-expanded={!collapsed}
        aria-controls="character-panel-body"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="panel-title">{name.trim() || DEFAULT_CHARACTER_NAME}</span>
        <span className="panel-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      <div id="character-panel-body" className="panel-body" hidden={collapsed}>
        <section className="panel-section">
          <button type="button" className="book-submit" onClick={() => useUiStore.getState().setAppearanceEditor(true)}>
            Изменить внешность
          </button>
        </section>
        <PersonalityFields />
        {DEBUG && <AnimationTester />}
      </div>
    </aside>
  );
}

/** Для разработки: запустить любую анимацию персонажа. */
function AnimationTester() {
  const currentClip = useCharacterStore((s) => s.currentClip);
  const playClip = useCharacterStore((s) => s.playClip);
  return (
    <section className="panel-section">
      <h3>Анимации</h3>
      {ANIMATION_GROUPS.map((group) => (
        <div key={group.label} className="anim-group">
          <span className="anim-group-label">{group.label}</span>
          <div className="chip-row">
            {group.clips.map((clip) => (
              <button key={clip} type="button" className="chip chip-small" aria-pressed={currentClip === clip} onClick={() => playClip(clip)}>
                {clip.replace(/_Loop$/, '').replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
