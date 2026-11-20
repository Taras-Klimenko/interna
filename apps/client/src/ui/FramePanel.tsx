import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Photo } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { forgetPhotoTexture } from '../scene/photoTextures';
import { photoFiles, requestPersistentStorage } from '../storage/files';
import { useInteractionStore } from '../store/interactionStore';
import { newId, useWorldStore } from '../store/worldStore';

/** Длинная сторона фото после сжатия: для рамки на полметра больше не нужно, а фото с телефона весят мегабайты. */
const MAX_SIDE = 1280;

/** Уменьшает фото и пережимает в JPEG. Поворот из EXIF браузер применяет сам. */
async function preparePhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    // Прозрачный PNG иначе станет чёрным.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new Error('encode');
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ссылка на фото из хранилища браузера для <img>. */
function usePhotoUrl(id: string | undefined) {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void photoFiles
      .load(id)
      .catch(() => undefined)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl({ id, url: objectUrl });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url && url.id === id ? url.url : null;
}

/** Открытая рамка: какое фото висит, подпись к нему, замена и снятие. */
export function FramePanel() {
  const frameId = useInteractionStore((s) => (s.panel?.kind === 'frame' ? s.panel.id : null));
  const closePanel = useInteractionStore((s) => s.closePanel);
  const frame = useWorldStore((s) => s.world.objects.find((o) => o.id === frameId) ?? null);
  const photo = frame?.state.display?.photo;
  const previewUrl = usePhotoUrl(photo?.id);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState(photo?.caption ?? '');
  const fileInput = useRef<HTMLInputElement>(null);

  // Новое фото — своя подпись.
  useEffect(() => setCaption(photo?.caption ?? ''), [photo?.id, photo?.caption]);

  const saveCaption = () => {
    if (frame && photo && caption.trim() !== photo.caption) useWorldStore.getState().setPhotoCaption(frame.id, caption.trim());
  };

  const close = () => {
    saveCaption();
    closePanel();
  };

  // Esc закрывает рамку, даже если курсор в поле подписи (подпись при этом сохраняется).
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!frameId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frameId]);

  const def = frame ? CATALOG[frame.defId] : undefined;
  if (!frame || !def) return null;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { notify } = useInteractionStore.getState();
    setBusy(true);
    requestPersistentStorage();
    try {
      const prepared = await preparePhoto(file);
      const next: Photo = {
        id: newId(),
        kind: 'photo',
        width: prepared.width,
        height: prepared.height,
        caption: '',
        addedAt: new Date().toISOString(),
      };
      await photoFiles.save(next.id, prepared.blob);
      const previous = useWorldStore.getState().world.objects.find((o) => o.id === frame.id)?.state.display?.photo;
      useWorldStore.getState().setPhoto(frame.id, next);
      if (previous) {
        forgetPhotoTexture(previous.id);
        void photoFiles.remove(previous.id).catch(() => undefined);
      }
    } catch (error) {
      const full = error instanceof DOMException && error.name === 'QuotaExceededError';
      notify(full ? 'Не хватает места в хранилище браузера' : 'Не получилось открыть эту картинку');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = () => {
    if (!photo || !window.confirm('Снять фото из рамки? Оно удалится из браузера.')) return;
    useWorldStore.getState().setPhoto(frame.id, undefined);
    forgetPhotoTexture(photo.id);
    void photoFiles.remove(photo.id).catch(() => undefined);
  };

  return (
    <aside className="sheet" aria-label={def.name}>
      <header className="sheet-header">
        <div>
          <h2 className="sheet-title">{def.name}</h2>
          <p className="sheet-subtitle">{photo ? 'фото на стене' : 'рамка пустая'}</p>
        </div>
        <button type="button" className="sheet-close" onClick={close} title="Esc" aria-label="Закрыть">
          ✕
        </button>
      </header>

      <div className="sheet-body">
        {photo ? (
          <>
            <div className="frame-preview" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
              {previewUrl && <img src={previewUrl} alt={photo.caption || 'Фото в рамке'} />}
            </div>
            <label className="book-form frame-caption">
              <h3>Что на фото</h3>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={saveCaption}
                placeholder="Кто, где, когда — своими словами"
                maxLength={300}
                rows={2}
              />
            </label>
          </>
        ) : (
          <p className="sheet-empty">Выберите фото — оно повиснет на стене в этой рамке.</p>
        )}

        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
        <div className="frame-actions">
          <button type="button" className="book-submit" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? 'Вешаю…' : photo ? 'Заменить фото' : 'Выбрать фото'}
          </button>
          {photo && (
            <button type="button" className="chip" onClick={onRemove} disabled={busy}>
              Снять
            </button>
          )}
        </div>
        <p className="panel-note">Фото хранится только в этом браузере и никуда не загружается.</p>
      </div>
    </aside>
  );
}
