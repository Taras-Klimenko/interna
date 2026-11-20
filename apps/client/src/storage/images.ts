/** Картинка после уменьшения: JPEG и его размер в пикселях, плюс средний цвет. */
export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Средний цвет картинки, '#rrggbb'. */
  averageColor: string;
}

/**
 * Уменьшает картинку до maxSide по длинной стороне и пережимает в JPEG.
 * Поворот из EXIF браузер применяет сам. Фото с телефона весят мегабайты, а в комнате столько не нужно.
 */
export async function downscaleImage(file: Blob, maxSide: number, quality = 0.86): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
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
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('encode');
    return { blob, width, height, averageColor: averageColor(canvas) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Средний цвет: сжимаем картинку до 8×8 и усредняем пиксели. */
function averageColor(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#8a6a4a';
  ctx.drawImage(source, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  const n = data.length / 4;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
