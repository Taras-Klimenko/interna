import { useEffect, useState } from 'react';
import { CELL_SIZE, type GridSize } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { useEditorStore } from '../store/editorStore';
import { useWorldStore } from '../store/worldStore';

const NARROW = '(max-width: 767px)';
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches;

const meters = (cells: number) => (cells * CELL_SIZE).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const sizeLabel = (fp: GridSize) => `${meters(fp.w)} × ${meters(fp.h)} м`;

const CATALOG_ITEMS = Object.values(CATALOG);

/** Панель режима расстановки: каталог предметов и действия с выбранным предметом. */
export function EditorPanel() {
  const draft = useEditorStore((s) => s.draft);
  const selectedId = useEditorStore((s) => s.selectedId);
  const notice = useEditorStore((s) => s.notice);
  const { startPlacing, rotate, removeSelected, cancel } = useEditorStore.getState();
  const selected = useWorldStore((s) => s.world.objects.find((o) => o.id === selectedId) ?? null);
  const resetRoom = useWorldStore((s) => s.resetRoom);
  const [collapsed, setCollapsed] = useState(isNarrow);

  // Клавиши режима расстановки.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const editor = useEditorStore.getState();
      if (e.code === 'KeyR') editor.rotate();
      else if (e.code === 'Delete' || e.code === 'Backspace') editor.removeSelected();
      else if (e.code === 'Escape') editor.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (defId: string) => {
    startPlacing(defId);
    // На телефоне панель закрывает полкомнаты: сворачиваем, чтобы было видно, куда ставить.
    if (isNarrow()) setCollapsed(true);
  };

  const onReset = () => {
    if (window.confirm('Вернуть стартовую расстановку? Текущая расстановка пропадёт.')) {
      cancel();
      useEditorStore.getState().select(null);
      resetRoom();
    }
  };

  const activeDefId = draft?.defId ?? selected?.defId ?? null;
  const activeDef = activeDefId ? CATALOG[activeDefId] : undefined;
  const canRemove = draft ? draft.sourceId !== null : selected !== null;

  return (
    <>
      <aside className="panel" data-collapsed={collapsed} aria-label="Расстановка">
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={!collapsed}
          aria-controls="editor-panel-body"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="panel-title">Расстановка</span>
          <span className="panel-chevron" aria-hidden="true">
            ▾
          </span>
        </button>

        <div id="editor-panel-body" className="panel-body" hidden={collapsed}>
          <section className="panel-section">
            <h3>Каталог</h3>
            <ul className="catalog">
              {CATALOG_ITEMS.map((def) => (
                <li key={def.id}>
                  <button
                    type="button"
                    className="catalog-item"
                    aria-pressed={draft?.defId === def.id && draft.sourceId === null}
                    onClick={() => pick(def.id)}
                  >
                    <span className="catalog-swatch" style={{ background: def.placeholderColor }} aria-hidden="true" />
                    <span className="catalog-name">{def.name}</span>
                    <span className="catalog-size">{sizeLabel(def.footprint)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel-section">
            <h3>Комната</h3>
            <button type="button" className="chip" onClick={onReset}>
              Сбросить комнату
            </button>
            <p className="panel-note">Расстановка сохраняется в этом браузере автоматически.</p>
          </section>
        </div>
      </aside>

      {/* Действия с предметом — внизу, рядом с пальцем и курсором, и видны даже при свёрнутой панели. */}
      {activeDef && (
        <div className="object-bar" role="toolbar" aria-label={`Предмет: ${activeDef.name}`}>
          <span className="object-bar-name">
            {activeDef.name}
            {draft && <span className={draft.valid ? 'object-bar-ok' : 'object-bar-bad'}>{draft.valid ? ' · можно поставить' : ' · не помещается'}</span>}
          </span>
          <button type="button" onClick={rotate} title="Повернуть (R)">
            Повернуть
          </button>
          {canRemove && (
            <button type="button" onClick={removeSelected} title="Убрать из комнаты (Del)">
              Убрать
            </button>
          )}
          <button type="button" onClick={cancel} title="Esc">
            {draft ? 'Отмена' : 'Снять выбор'}
          </button>
        </div>
      )}

      <Notice notice={notice} />
    </>
  );
}

/** Всплывающее сообщение на пару секунд. Новое сообщение (новый seq) показывается заново. */
function Notice({ notice }: { notice: { text: string; seq: number } | null }) {
  const [visibleSeq, setVisibleSeq] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    setVisibleSeq(notice.seq);
    const timer = window.setTimeout(() => setVisibleSeq(null), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice || visibleSeq !== notice.seq) return null;
  return (
    <div className="notice" role="status">
      {notice.text}
    </div>
  );
}
