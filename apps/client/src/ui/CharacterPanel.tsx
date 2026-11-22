import { useState } from 'react';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { ANIMATION_GROUPS, HAIR_COLORS, HAIR_OPTIONS } from '../character/assets';
import { DEFAULT_PERSONALITY, PERSONALITY_MAX, PERSONALITY_PRESETS } from '../character/personalities';

/** На узких экранах (телефоны) панель стартует свёрнутой, чтобы не закрывать комнату. */
const startCollapsed = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/** Панель персонажа: имя, внешность и (для проверки) ручной запуск любой анимации. */
export function CharacterPanel() {
  const appearance = useWorldStore((s) => s.world.character.appearance);
  const setAppearance = useWorldStore((s) => s.setAppearance);
  const name = useWorldStore((s) => s.world.character.name);
  const setCharacterName = useWorldStore((s) => s.setCharacterName);
  const personality = useWorldStore((s) => s.world.character.personality);
  const setPersonality = useWorldStore((s) => s.setPersonality);
  const currentClip = useCharacterStore((s) => s.currentClip);
  const playClip = useCharacterStore((s) => s.playClip);
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
          <h3>Имя</h3>
          <input
            className="panel-input"
            value={name}
            onChange={(e) => setCharacterName(e.target.value)}
            onBlur={() => !name.trim() && setCharacterName(DEFAULT_CHARACTER_NAME)}
            maxLength={40}
            aria-label="Имя персонажа"
            spellCheck={false}
          />
        </section>

        <section className="panel-section">
          <h3>Характер</h3>
          <div className="chip-row">
            {PERSONALITY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="chip"
                aria-pressed={personality === preset.text}
                onClick={() => setPersonality(preset.text)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <textarea
            className="panel-input panel-textarea"
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            onBlur={() => !personality.trim() && setPersonality(DEFAULT_PERSONALITY)}
            maxLength={PERSONALITY_MAX}
            rows={5}
            aria-label="Характер персонажа"
            placeholder="Какой характер, как говорит, что любит…"
          />
          <p className="panel-note">
            Своими словами: какой характер, как говорит, что любит. {name.trim() || DEFAULT_CHARACTER_NAME} прочитает это перед
            каждым разговором. Можно взять готовый вариант и дописать.
          </p>
        </section>

        <section className="panel-section">
          <h3>Тело</h3>
          <div className="chip-row">
            {(['female', 'male'] as const).map((body) => (
              <button
                key={body}
                type="button"
                className="chip"
                aria-pressed={appearance.body === body}
                onClick={() => setAppearance({ body })}
              >
                {body === 'female' ? 'Женское' : 'Мужское'}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h3>Причёска</h3>
          <div className="chip-row">
            {HAIR_OPTIONS.map((h) => (
              <button
                key={h.id}
                type="button"
                className="chip"
                aria-pressed={appearance.hair === h.id}
                onClick={() => setAppearance({ hair: h.id })}
              >
                {h.label}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={appearance.hair === null} onClick={() => setAppearance({ hair: null })}>
              Без
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={appearance.beard} onChange={(e) => setAppearance({ beard: e.target.checked })} />
            Борода
          </label>
          <div className="swatch-row" role="radiogroup" aria-label="Цвет волос">
            {HAIR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={appearance.hairColor === color}
                aria-label={color === '#ffffff' ? 'Исходный цвет' : color}
                className="swatch"
                style={{ background: color === '#ffffff' ? 'linear-gradient(135deg, #fff 50%, #d9b48a 50%)' : color }}
                onClick={() => setAppearance({ hairColor: color })}
              />
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h3>Анимации</h3>
          {ANIMATION_GROUPS.map((group) => (
            <div key={group.label} className="anim-group">
              <span className="anim-group-label">{group.label}</span>
              <div className="chip-row">
                {group.clips.map((clip) => (
                  <button
                    key={clip}
                    type="button"
                    className="chip chip-small"
                    aria-pressed={currentClip === clip}
                    onClick={() => playClip(clip)}
                  >
                    {clip.replace(/_Loop$/, '').replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="panel-note">Клик (или тап) по полу — персонаж идёт туда. Разовые анимации после окончания возвращают к ожиданию.</p>
        </section>
      </div>
    </aside>
  );
}
