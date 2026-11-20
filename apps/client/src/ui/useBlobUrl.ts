import { useEffect, useState } from 'react';

/** Ссылка для <img> на картинку из хранилища браузера; null, пока грузится или если её нет. */
export function useBlobUrl(load: (id: string) => Promise<Blob | undefined>, id: string | undefined) {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void load(id)
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
  }, [load, id]);
  return url && url.id === id ? url.url : null;
}
