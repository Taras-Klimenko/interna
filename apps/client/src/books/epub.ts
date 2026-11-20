import { BookError, ImageUrls, cleanText, type Chapter, type ParsedBook } from './types';
import { sanitizeHtml } from './sanitize';

/**
 * EPUB: zip-архив. META-INF/container.xml указывает на OPF-файл, в нём — название и автор (metadata),
 * список файлов (manifest) и порядок глав (spine). Оглавление — в nav-документе (EPUB 3) или NCX (EPUB 2).
 */

export type ZipFiles = Record<string, Uint8Array>;

interface ManifestItem {
  id: string;
  path: string;
  type: string;
  properties: string;
}

const utf8 = new TextDecoder('utf-8');

export function isEpub(files: ZipFiles) {
  return 'META-INF/container.xml' in files;
}

export function parseEpub(files: ZipFiles): ParsedBook {
  const read = (path: string) => files[path] ?? files[safeDecode(path)] ?? files[encodeURI(path)];

  const container = xml(read('META-INF/container.xml'));
  const opfPath = container?.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path');
  const opf = opfPath ? xml(read(opfPath)) : null;
  if (!opfPath || !opf) throw new BookError('Файл epub повреждён');
  const opfDir = dirOf(opfPath);

  const metadata = opf.getElementsByTagNameNS('*', 'metadata')[0];
  const title = cleanText(metadata?.getElementsByTagNameNS('*', 'title')[0]) || 'Без названия';
  const author = Array.from(metadata?.getElementsByTagNameNS('*', 'creator') ?? [])
    .map(cleanText)
    .filter(Boolean)
    .join(', ');

  const manifest = new Map<string, ManifestItem>();
  const byPath = new Map<string, ManifestItem>();
  for (const item of Array.from(opf.getElementsByTagNameNS('*', 'item'))) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (!id || !href) continue;
    const entry = {
      id,
      path: resolvePath(opfDir, href) ?? href,
      type: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    };
    manifest.set(id, entry);
    byPath.set(entry.path, entry);
  }

  const blobAt = (path: string): Blob | null => {
    const data = read(path);
    if (!data) return null;
    const type = byPath.get(path)?.type || imageType(path);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type });
  };

  // Обложка: по properties="cover-image" (EPUB 3) или <meta name="cover"> (EPUB 2).
  const coverId = Array.from(opf.getElementsByTagNameNS('*', 'meta')).find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  const coverItem =
    [...manifest.values()].find((i) => i.properties.split(/\s+/).includes('cover-image')) ??
    (coverId ? manifest.get(coverId) : undefined);
  const cover = coverItem?.type.startsWith('image/') ? blobAt(coverItem.path) : null;

  const tocLabels = readToc(opf, manifest, read);

  const images = new ImageUrls();
  const chapters: Chapter[] = [];
  const spine = opf.getElementsByTagNameNS('*', 'spine')[0];
  for (const ref of Array.from(spine?.getElementsByTagNameNS('*', 'itemref') ?? [])) {
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (!item) continue;
    const doc = html(read(item.path));
    const body = doc?.getElementsByTagNameNS('*', 'body')[0] ?? doc?.documentElement;
    if (!body) continue;
    const length = cleanText(body).length;
    const hasImage = body.getElementsByTagNameNS('*', 'img').length + body.getElementsByTagNameNS('*', 'image').length > 0;
    if (length === 0 && !hasImage) continue;
    const dir = dirOf(item.path);
    const heading = body.querySelector('h1, h2, h3');
    chapters.push({
      title: tocLabels.get(item.path) ?? (cleanText(heading) || `Глава ${chapters.length + 1}`),
      length,
      render: () =>
        sanitizeHtml(body, (src) => {
          const path = resolvePath(dir, src);
          return path ? images.get(path, () => blobAt(path)) : null;
        }),
    });
  }

  if (chapters.length === 0) throw new BookError('В книге нет текста');
  return { format: 'epub', title, author, cover, chapters, dispose: () => images.dispose() };
}

/** Названия глав из оглавления: путь файла → подпись (первая ссылка на файл). */
function readToc(opf: Document, manifest: Map<string, ManifestItem>, read: (path: string) => Uint8Array | undefined) {
  const labels = new Map<string, string>();
  const add = (base: string, href: string | null, label: string) => {
    const path = href ? resolvePath(base, href) : null;
    if (path && label && !labels.has(path)) labels.set(path, label);
  };

  const nav = [...manifest.values()].find((i) => i.properties.split(/\s+/).includes('nav'));
  if (nav) {
    const doc = html(read(nav.path));
    const navs = Array.from(doc?.getElementsByTagNameNS('*', 'nav') ?? []);
    const toc = navs.find((n) => n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') === 'toc' || n.getAttribute('epub:type') === 'toc') ?? navs[0];
    for (const a of Array.from(toc?.getElementsByTagNameNS('*', 'a') ?? [])) add(dirOf(nav.path), a.getAttribute('href'), cleanText(a));
  }
  if (labels.size === 0) {
    const ncxId = opf.getElementsByTagNameNS('*', 'spine')[0]?.getAttribute('toc');
    const ncx = (ncxId ? manifest.get(ncxId) : undefined) ?? [...manifest.values()].find((i) => i.type === 'application/x-dtbncx+xml');
    const doc = ncx ? xml(read(ncx.path)) : null;
    for (const point of Array.from(doc?.getElementsByTagNameNS('*', 'navPoint') ?? [])) {
      const label = cleanText(point.getElementsByTagNameNS('*', 'navLabel')[0]);
      const src = point.getElementsByTagNameNS('*', 'content')[0]?.getAttribute('src') ?? null;
      add(dirOf(ncx!.path), src, label);
    }
  }
  return labels;
}

function xml(data: Uint8Array | undefined) {
  if (!data) return null;
  const doc = new DOMParser().parseFromString(utf8.decode(data), 'application/xml');
  return doc.getElementsByTagName('parsererror').length > 0 ? null : doc;
}

/** XHTML главы; если он не строгий XML — разбираем как обычный HTML. */
function html(data: Uint8Array | undefined) {
  if (!data) return null;
  const text = utf8.decode(data);
  const strict = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  if (strict.getElementsByTagName('parsererror').length === 0) return strict;
  return new DOMParser().parseFromString(text, 'text/html');
}

function dirOf(path: string) {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(0, slash + 1) : '';
}

function safeDecode(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Путь внутри архива относительно папки base. Внешние ссылки (http:, data: и т. п.) — null: из сети ничего не грузим. */
function resolvePath(base: string, href: string) {
  const clean = safeDecode(href.split('#')[0] ?? '');
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  const parts: string[] = [];
  for (const part of (clean.startsWith('/') ? clean.slice(1) : base + clean).split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

function imageType(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}
