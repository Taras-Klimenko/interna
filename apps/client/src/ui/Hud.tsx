import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';

export function Hud() {
  const showGrid = useUiStore((s) => s.showGrid);
  const toggleGrid = useUiStore((s) => s.toggleGrid);
  const requestRotate = useUiStore((s) => s.requestRotate);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.code;
      if (key === 'KeyQ') requestRotate(-1);
      else if (key === 'KeyE') requestRotate(1);
      else if (key === 'KeyG') toggleGrid();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestRotate, toggleGrid]);

  return (
    <>
      <header className="hud-brand">
        <span className="hud-title">Interna</span>
        <span className="hud-subtitle">прототип · тестовый персонаж</span>
      </header>

      <div className="hud-toolbar" role="toolbar" aria-label="Камера">
        <button type="button" onClick={() => requestRotate(-1)} title="Повернуть влево (Q)">
          ⟲
        </button>
        <button type="button" onClick={() => requestRotate(1)} title="Повернуть вправо (E)">
          ⟳
        </button>
        <span className="hud-sep" />
        <button type="button" onClick={toggleGrid} aria-pressed={showGrid} title="Сетка (G)">
          Сетка
        </button>
      </div>

      <p className="hud-hint hud-hint-desktop">
        Клик по полу — идти · перетаскивание — вращать · колесо — приблизить · Q / E — к соседнему углу · G — сетка
      </p>
      <p className="hud-hint hud-hint-touch">Тап по полу — идти · один палец — вращать · два — приблизить</p>
    </>
  );
}
