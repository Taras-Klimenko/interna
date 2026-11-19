import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { useEditorStore } from '../store/editorStore';

export function Hud() {
  const showGrid = useUiStore((s) => s.showGrid);
  const toggleGrid = useUiStore((s) => s.toggleGrid);
  const requestRotate = useUiStore((s) => s.requestRotate);
  const editing = useEditorStore((s) => s.active);
  const setEditing = useEditorStore((s) => s.setActive);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.code;
      if (key === 'KeyQ') requestRotate(-1);
      else if (key === 'KeyE') requestRotate(1);
      else if (key === 'KeyG') toggleGrid();
      else if (key === 'KeyB') setEditing(!useEditorStore.getState().active);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestRotate, toggleGrid, setEditing]);

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
        <button type="button" onClick={toggleGrid} aria-pressed={showGrid || editing} disabled={editing} title="Сетка (G)">
          Сетка
        </button>
        <span className="hud-sep" />
        <button type="button" className="hud-mode" onClick={() => setEditing(!editing)} aria-pressed={editing} title="Режим расстановки (B)">
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
      ) : (
        <>
          <p className="hud-hint hud-hint-desktop">
            Клик по полу — идти · перетаскивание — вращать · колесо — приблизить · Q / E — к соседнему углу · G — сетка · B — обставить
          </p>
          <p className="hud-hint hud-hint-touch">Тап по полу — идти · один палец — вращать · два — приблизить</p>
        </>
      )}
    </>
  );
}
