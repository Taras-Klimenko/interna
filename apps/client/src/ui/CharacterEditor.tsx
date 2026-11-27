import { useEffect, type ReactNode } from 'react';
import { useWorldStore } from '../store/worldStore';
import { useUiStore } from '../store/uiStore';
import { HAIR_COLORS, HAIR_OPTIONS, OUTFIT_COLORS, SKIN_TONES, DEFAULT_OUTFIT, DEFAULT_SKIN } from '../character/assets';
import { CharacterPreview } from './CharacterPreview';

/**
 * Редактор внешности: слева (на телефоне — сверху) персонаж крупным планом, справа — тело, кожа, причёска,
 * цвет волос, борода и одежда. Всё меняется сразу. Используется в знакомстве и из панели персонажа.
 * footer — кнопки внизу («Назад» / «Дальше» или «Готово»).
 */
export function CharacterEditor({ title, subtitle, footer }: { title: string; subtitle?: string; footer: ReactNode }) {
  const appearance = useWorldStore((s) => s.world.character.appearance);
  const setAppearance = useWorldStore((s) => s.setAppearance);
  // Редактор на весь экран: комнату под ним не рисуем, пока он открыт.
  useEffect(() => {
    useUiStore.setState({ roomCovered: true });
    return () => useUiStore.setState({ roomCovered: false });
  }, []);

  return (
    <div className="appearance" role="dialog" aria-label={title}>
      <div className="appearance-preview">
        <CharacterPreview appearance={appearance} />
        <p className="appearance-hint">Потяните, чтобы повернуть</p>
      </div>
      <div className="appearance-controls">
        <header>
          <h2 className="appearance-title">{title}</h2>
          {subtitle && <p className="appearance-subtitle">{subtitle}</p>}
        </header>

        <section className="panel-section">
          <h3>Тело</h3>
          <div className="chip-row">
            {(['female', 'male'] as const).map((body) => (
              <button key={body} type="button" className="chip" aria-pressed={appearance.body === body} onClick={() => setAppearance({ body })}>
                {body === 'female' ? 'Женское' : 'Мужское'}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <h3>Кожа</h3>
          <Swatches colors={SKIN_TONES} value={appearance.skin ?? DEFAULT_SKIN} onChange={(skin) => setAppearance({ skin })} label="Оттенок кожи" />
        </section>

        <section className="panel-section">
          <h3>Причёска</h3>
          <div className="chip-row">
            {HAIR_OPTIONS.map((h) => (
              <button key={h.id} type="button" className="chip" aria-pressed={appearance.hair === h.id} onClick={() => setAppearance({ hair: h.id })}>
                {h.label}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={appearance.hair === null} onClick={() => setAppearance({ hair: null })}>
              Без
            </button>
          </div>
          <Swatches
            colors={HAIR_COLORS}
            value={appearance.hairColor}
            onChange={(hairColor) => setAppearance({ hairColor })}
            label="Цвет волос"
            original="#ffffff"
          />
          <label className="check">
            <input type="checkbox" checked={appearance.beard} onChange={(e) => setAppearance({ beard: e.target.checked })} />
            Борода
          </label>
        </section>

        <section className="panel-section">
          <h3>Одежда</h3>
          <Swatches colors={OUTFIT_COLORS} value={appearance.outfit ?? DEFAULT_OUTFIT} onChange={(outfit) => setAppearance({ outfit })} label="Цвет одежды" />
        </section>

        <footer className="appearance-footer">{footer}</footer>
      </div>
    </div>
  );
}

/** Ряд цветных кружков. original — цвет, который означает «как в исходной текстуре» (рисуется двухцветным). */
function Swatches({
  colors,
  value,
  onChange,
  label,
  original,
}: {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  label: string;
  original?: string;
}) {
  return (
    <div className="swatch-row" role="radiogroup" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color === original ? 'Исходный цвет' : color}
          className="swatch"
          style={{ background: color === original ? 'linear-gradient(135deg, #fff 50%, #d9b48a 50%)' : color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
