import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';
import { DEFAULT_PERSONALITY, PERSONALITY_MAX, PERSONALITY_PRESETS } from '../character/personalities';

/** Имя и характер персонажа — в панели персонажа и в знакомстве. */
export function PersonalityFields() {
  const name = useWorldStore((s) => s.world.character.name);
  const setCharacterName = useWorldStore((s) => s.setCharacterName);
  const personality = useWorldStore((s) => s.world.character.personality);
  const setPersonality = useWorldStore((s) => s.setPersonality);

  return (
    <>
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
            <button key={preset.id} type="button" className="chip" aria-pressed={personality === preset.text} onClick={() => setPersonality(preset.text)}>
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
          Своими словами: какой характер, как говорит, что любит. {name.trim() || DEFAULT_CHARACTER_NAME} прочитает это перед каждым
          разговором. Можно взять готовый вариант и дописать.
        </p>
      </section>
    </>
  );
}
