import { BookError, ImageUrls, cleanText, firstKid, kids, type Chapter, type ParsedBook } from './types';
import { image } from './sanitize';

/**
 * FictionBook 2: один XML-файл. Текст — в <body> из <section>, картинки — в <binary> в base64,
 * название, автор и обложка — в <description><title-info>.
 */

const XLINK = 'http://www.w3.org/1999/xlink';
/** Глава длиннее стольких символов с вложенными разделами делится на них: иначе книга из одного <section> откроется одной огромной страницей. */
const SPLIT_LENGTH = 60_000;

export function parseFb2(bytes: Uint8Array): ParsedBook {
  const doc = parseXml(decode(bytes));
  const root = doc.documentElement;
  if (root.localName !== 'FictionBook') throw new BookError('Это не fb2-файл');

  const info = firstKid(firstKid(root, 'description'), 'title-info');
  const title = cleanText(firstKid(info, 'book-title')) || 'Без названия';
  const author = (info ? kids(info, 'author') : [])
    .map((a) => {
      const name = ['first-name', 'middle-name', 'last-name'].map((n) => cleanText(firstKid(a, n))).filter(Boolean).join(' ');
      return name || cleanText(firstKid(a, 'nickname'));
    })
    .filter(Boolean)
    .join(', ');

  const binaries = new Map<string, Element>();
  for (const bin of kids(root, 'binary')) {
    const id = bin.getAttribute('id');
    if (id) binaries.set(id, bin);
  }
  const blobOf = (href: string | null): Blob | null => {
    const bin = href?.startsWith('#') ? binaries.get(href.slice(1)) : undefined;
    if (!bin) return null;
    try {
      const raw = atob((bin.textContent ?? '').replace(/\s+/g, ''));
      const data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      return new Blob([data], { type: bin.getAttribute('content-type') ?? 'image/jpeg' });
    } catch {
      return null;
    }
  };

  const coverImage = firstKid(firstKid(info, 'coverpage'), 'image');
  const cover = blobOf(coverImage ? hrefOf(coverImage) : null);

  const images = new ImageUrls();
  const imageUrl = (href: string | null) => (href ? images.get(href, () => blobOf(href)) : null);

  const bodies = kids(root, 'body');
  const main = bodies.find((b) => !b.getAttribute('name')) ?? bodies[0];
  if (!main) throw new BookError('В книге нет текста');

  const chapters: Chapter[] = [];
  /** depth — уровень для convert: -1 у вступления книги (заголовок h1), у остального заголовок главы — h2. */
  const addChapter = (title: string, nodes: Element[], depth: number) => {
    const length = nodes.reduce((sum, n) => sum + cleanText(n).length, 0);
    const hasImage = nodes.some((n) => n.localName === 'image' || n.getElementsByTagNameNS('*', 'image').length > 0);
    if (length === 0 && !hasImage) return;
    chapters.push({
      title,
      length,
      render: () => {
        const out = document.createDocumentFragment();
        for (const node of nodes) convert(node, out, depth, imageUrl);
        return out;
      },
    });
  };

  /** Раздел становится главой; большой раздел с подразделами делится на них. */
  const addSection = (section: Element, fallbackTitle: string) => {
    const sectionTitle = titleOf(section) || fallbackTitle;
    const subsections = kids(section, 'section');
    if (subsections.length > 0 && cleanText(section).length > SPLIT_LENGTH) {
      // Всё, что до подразделов (заголовок, эпиграф), — отдельной короткой главой.
      addChapter(sectionTitle, Array.from(section.children).filter((c) => c.localName !== 'section'), 0);
      subsections.forEach((sub, i) => addSection(sub, `${sectionTitle}, часть ${i + 1}`));
      return;
    }
    // Раздел внутри convert получает уровень 0, и его заголовок становится h2.
    addChapter(sectionTitle, [section], -1);
  };

  // Заголовок и эпиграф книги перед первым разделом.
  const intro = Array.from(main.children).filter((c) => c.localName !== 'section');
  addChapter(title, intro, -1);
  kids(main, 'section').forEach((section, i) => addSection(section, `Глава ${i + 1}`));

  // Примечания и комментарии — отдельными главами в конце.
  for (const body of bodies) {
    if (body === main) continue;
    addChapter(titleOf(body) || 'Примечания', Array.from(body.children), 0);
  }

  if (chapters.length === 0) throw new BookError('В книге нет текста');
  return { format: 'fb2', title, author, cover, chapters, dispose: () => images.dispose() };
}

/** Текст: кодировка — из заголовка XML (у старых fb2 часто windows-1251). */
function decode(bytes: Uint8Array) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 256));
  const encoding = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** HTML-сущности, которые встречаются в «самодельных» fb2, хотя XML их не знает. */
const ENTITIES: Record<string, string> = {
  nbsp: '#160', laquo: '#171', raquo: '#187', mdash: '#8212', ndash: '#8211', hellip: '#8230',
  copy: '#169', bdquo: '#8222', ldquo: '#8220', rdquo: '#8221', lsquo: '#8216', rsquo: '#8217', shy: '#173',
};

function parseXml(text: string) {
  const parser = new DOMParser();
  let doc = parser.parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    // Вторая попытка: чиним самые частые ошибки — HTML-сущности и одинокие &.
    const fixed = text
      .replace(/&([a-z]+);/gi, (m, name: string) => (ENTITIES[name.toLowerCase()] ? `&${ENTITIES[name.toLowerCase()]};` : m))
      .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/gi, '&amp;');
    doc = parser.parseFromString(fixed, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new BookError('Файл fb2 повреждён');
  }
  return doc;
}

function hrefOf(el: Element) {
  const direct = el.getAttributeNS(XLINK, 'href');
  if (direct) return direct;
  for (const attr of Array.from(el.attributes)) if (attr.localName === 'href') return attr.value;
  return null;
}

function titleOf(el: Element) {
  const title = firstKid(el, 'title');
  return title ? kids(title, 'p').map(cleanText).filter(Boolean).join('. ') || cleanText(title) : '';
}

/** Узел fb2 → разметка читалки. depth — вложенность раздела: от неё уровень заголовка. */
function convert(node: Node, parent: Node, depth: number, imageUrl: (href: string | null) => string | null) {
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    parent.appendChild(document.createTextNode(node.textContent ?? ''));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const into = (tag: string, className?: string, childDepth = depth) => {
    const target = document.createElement(tag);
    if (className) target.className = className;
    for (const child of Array.from(el.childNodes)) convert(child, target, childDepth, imageUrl);
    parent.appendChild(target);
    return target;
  };

  switch (el.localName) {
    case 'section':
      into('div', 'section', depth + 1);
      return;
    case 'title': {
      const heading = document.createElement(depth < 0 ? 'h1' : `h${Math.min(2 + depth, 5)}`);
      kids(el, 'p').forEach((p, i) => {
        if (i > 0) heading.appendChild(document.createElement('br'));
        for (const child of Array.from(p.childNodes)) convert(child, heading, depth, imageUrl);
      });
      if (!heading.hasChildNodes()) heading.textContent = cleanText(el);
      parent.appendChild(heading);
      return;
    }
    case 'subtitle':
      into('p', 'subtitle');
      return;
    case 'epigraph':
      into('blockquote', 'epigraph');
      return;
    case 'cite':
      into('blockquote');
      return;
    case 'poem':
      into('div', 'poem');
      return;
    case 'stanza':
      into('div', 'stanza');
      return;
    case 'v':
      into('p', 'verse');
      return;
    case 'text-author':
    case 'date':
      into('p', 'text-author');
      return;
    case 'p':
    case 'sup':
    case 'sub':
    case 'code':
    case 'table':
    case 'tr':
    case 'td':
    case 'th':
      into(el.localName);
      return;
    case 'emphasis':
      into('em');
      return;
    case 'strong':
      into('strong');
      return;
    case 'strikethrough':
      into('s');
      return;
    case 'empty-line':
      parent.appendChild(Object.assign(document.createElement('div'), { className: 'empty-line' }));
      return;
    case 'image': {
      const url = imageUrl(hrefOf(el));
      if (url) parent.appendChild(image(url, el.getAttribute('alt') ?? ''));
      return;
    }
    case 'a':
      // Сноска: номер мелко сверху. Сами примечания — в конце книги.
      if (el.getAttribute('type') === 'note') into('sup');
      else for (const child of Array.from(el.childNodes)) convert(child, parent, depth, imageUrl);
      return;
    case 'annotation':
      into('div', 'annotation');
      return;
    default:
      for (const child of Array.from(el.childNodes)) convert(child, parent, depth, imageUrl);
  }
}
