import { Color, SRGBColorSpace } from 'three';
import type { Book } from '@interna/shared';
import { bookFiles, coverFiles, requestPersistentStorage } from '../storage/files';
import { downscaleImage } from '../storage/images';
import { newId } from '../store/worldStore';
import { BookError, parseBook } from './parseBook';

/** Обложке в списке и на корешке хватит и такой. */
const COVER_SIDE = 480;

export type ImportedBook = Pick<Book, 'id' | 'title' | 'author' | 'note' | 'file' | 'color'>;

/**
 * Книга из файла: разбираем, чтобы достать название, автора и обложку (и заодно проверить, что файл читается),
 * и сохраняем файл с обложкой в хранилище браузера. Ставит книгу на полку вызывающий.
 */
export async function importBook(file: File): Promise<ImportedBook> {
  const parsed = await parseBook(file);
  parsed.dispose();
  const id = newId();
  requestPersistentStorage();

  let color: string | undefined;
  let hasCover = false;
  if (parsed.cover) {
    try {
      const cover = await downscaleImage(parsed.cover, COVER_SIDE, 0.85);
      await coverFiles.save(id, cover.blob);
      hasCover = true;
      color = spineColor(cover.averageColor);
    } catch {
      // Битая обложка — не повод не ставить книгу.
    }
  }

  try {
    await bookFiles.save(id, file);
  } catch (error) {
    if (hasCover) void coverFiles.remove(id).catch(() => undefined);
    throw error;
  }

  return {
    id,
    title: parsed.title.slice(0, 120),
    author: parsed.author.slice(0, 120),
    note: '',
    file: { format: parsed.format, fileName: file.name, size: file.size, hasCover },
    color,
  };
}

export { forgetBookFiles } from '../storage/files';

/** Текст ошибки для пользователя. */
export function importErrorText(error: unknown) {
  if (error instanceof BookError) return error.message;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'Не хватает места в хранилище браузера';
  return 'Не получилось открыть этот файл';
}

/**
 * Цвет корешка из среднего цвета обложки: средний цвет часто бледный и сероватый,
 * поэтому делаем его насыщеннее и не даём стать слишком светлым или чёрным.
 */
function spineColor(average: string) {
  const color = new Color(average);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, SRGBColorSpace);
  color.setHSL(hsl.h, Math.min(0.65, hsl.s * 1.4 + 0.08), Math.min(0.55, Math.max(0.22, hsl.l)), SRGBColorSpace);
  return `#${color.getHexString()}`;
}
