import { useEffect, useState } from 'react';
import { SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { photoFiles } from '../storage/files';

/** Текстуры фото по id: одна на фото, даже если рамку переносят и она рисуется заново. */
const cache = new Map<string, Promise<Texture | null>>();
const loader = new TextureLoader();

function loadPhotoTexture(id: string): Promise<Texture | null> {
  let pending = cache.get(id);
  if (!pending) {
    pending = (async () => {
      const blob = await photoFiles.load(id).catch(() => undefined);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      try {
        const texture = await loader.loadAsync(url);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        return texture;
      } catch {
        return null;
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
    cache.set(id, pending);
    // Не получилось — не запоминаем, попробуем в следующий раз.
    void pending.then((texture) => {
      if (!texture) cache.delete(id);
    });
  }
  return pending;
}

/** Фото убрали из рамки: освобождаем видеопамять. */
export function forgetPhotoTexture(id: string) {
  void cache.get(id)?.then((texture) => texture?.dispose());
  cache.delete(id);
}

/** Текстура фото из хранилища браузера; null, пока грузится или если файла нет. */
export function usePhotoTexture(id: string | undefined): Texture | null {
  const [texture, setTexture] = useState<{ id: string; texture: Texture | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadPhotoTexture(id).then((loaded) => {
      if (!cancelled) setTexture({ id, texture: loaded });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return texture && texture.id === id ? texture.texture : null;
}
