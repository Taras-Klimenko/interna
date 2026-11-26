import { useEffect, useRef } from 'react';
import { useSoundStore } from '../audio/ambience';
import { QUALITY_LABELS, useGraphicsStore, useQualityTier, type QualitySetting } from '../store/graphicsStore';

const QUALITY_OPTIONS: QualitySetting[] = ['auto', 'high', 'medium', 'low'];

/** Настройки комнаты: звуки и качество графики. Открывается кнопкой ⚙ в панели внизу. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const volume = useSoundStore((s) => s.volume);
  const rain = useSoundStore((s) => s.rain);
  const setSound = useSoundStore((s) => s.set);
  const quality = useGraphicsStore((s) => s.setting);
  const setQuality = useGraphicsStore((s) => s.setSetting);
  const tier = useQualityTier();
  const ref = useRef<HTMLDivElement>(null);

  // Клик мимо панели или Esc — закрыть.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.hud-settings')) onClose();
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
    <div className="settings" ref={ref} role="dialog" aria-label="Настройки">
      <section>
        <h3 className="settings-heading">Звуки комнаты</h3>
        <label className="settings-row">
          <span>Громкость</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setSound({ volume: Number(e.target.value) })}
            aria-label="Громкость звуков комнаты"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={rain} onChange={(e) => setSound({ rain: e.target.checked })} />
          Дождь за окном
        </label>
        <p className="settings-note">Шаги, выключатель, полив. Музыка из колонки — отдельно.</p>
      </section>
      <section>
        <h3 className="settings-heading">Графика</h3>
        <div className="chip-row">
          {QUALITY_OPTIONS.map((option) => (
            <button key={option} type="button" className="chip chip-small" aria-pressed={quality === option} onClick={() => setQuality(option)}>
              {QUALITY_LABELS[option]}
            </button>
          ))}
        </div>
        {quality === 'auto' && <p className="settings-note">Сейчас: {QUALITY_LABELS[tier].toLowerCase()}. Подстраивается само, если кадров мало.</p>}
      </section>
    </div>
  );
}
