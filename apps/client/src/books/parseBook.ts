import { unzip } from 'fflate';
import { isEpub, parseEpub, type ZipFiles } from './epub';
import { parseFb2 } from './fb2';
import { BookError, type ParsedBook } from './types';

export { BookError } from './types';
export type { Chapter, ParsedBook } from './types';

/** Больше — скорее всего не книга (или книга с огромными картинками, которая будет тормозить в телефоне). */
export const MAX_BOOK_SIZE = 40 * 1024 * 1024;

/** Форматы для выбора файла. На iPhone список не задаём: Safari не знает .fb2 и не даст его выбрать. */
export const BOOK_ACCEPT = '.fb2,.epub,.zip,application/epub+zip,application/x-fictionbook+xml,application/zip';

/** Разбирает fb2, fb2.zip или epub. Формат узнаём по содержимому, а не по расширению. */
export async function parseBook(file: Blob): Promise<ParsedBook> {
  if (file.size > MAX_BOOK_SIZE) throw new BookError('Файл слишком большой для книги');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return parseFb2(bytes);

  const files = await unzipFiles(bytes);
  if (isEpub(files)) return parseEpub(files);
  const fb2 = Object.keys(files).find((name) => name.toLowerCase().endsWith('.fb2'));
  if (fb2) return parseFb2(files[fb2]!);
  throw new BookError('В архиве нет книги fb2 или epub');
}

function unzipFiles(bytes: Uint8Array): Promise<ZipFiles> {
  return new Promise((resolve, reject) =>
    unzip(bytes, (error, files) => (error ? reject(new BookError('Архив повреждён')) : resolve(files))),
  );
}
