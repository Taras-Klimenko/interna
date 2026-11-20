/**
 * Перенос HTML из EPUB в читалку по белому списку. Книга — чужой файл: из неё не берём ни скрипты,
 * ни стили, ни атрибуты (кроме пары безопасных), ни внешние ссылки на картинки. Узлы создаются
 * заново через document.createElement, так что в страницу не попадает ничего, кроме текста и разметки.
 */

/** Выбрасываем вместе с содержимым. */
const DROP = new Set([
  'script', 'style', 'head', 'title', 'link', 'meta', 'base', 'iframe', 'frame', 'object', 'embed', 'applet',
  'form', 'input', 'button', 'select', 'textarea', 'video', 'audio', 'source', 'track', 'canvas', 'noscript',
  'template', 'math', 'map',
]);

/** Переносим как есть. */
const SAME = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'strong', 'u', 's', 'sup', 'sub', 'small', 'br', 'hr',
  'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'pre', 'code',
  'figure', 'figcaption', 'dl', 'dt', 'dd',
]);

/** Переносим под другим именем. */
const RENAME: Record<string, string> = {
  b: 'strong',
  i: 'em',
  cite: 'em',
  var: 'em',
  dfn: 'em',
  strike: 's',
  del: 's',
  ins: 'u',
  tt: 'code',
  kbd: 'code',
  samp: 'code',
  body: 'div',
  div: 'div',
  section: 'div',
  article: 'div',
  aside: 'div',
  header: 'div',
  footer: 'div',
  main: 'div',
  nav: 'div',
  center: 'div',
  hgroup: 'div',
  address: 'div',
};

const XLINK = 'http://www.w3.org/1999/xlink';
const MAX_DEPTH = 120;

/** resolveImage: путь картинки из книги → blob-ссылка или null (картинки нет или она внешняя). */
export function sanitizeHtml(source: Element, resolveImage: (src: string) => string | null): DocumentFragment {
  const out = document.createDocumentFragment();
  for (const child of Array.from(source.childNodes)) copy(child, out, resolveImage, 0);
  return out;
}

function copy(node: Node, parent: Node, resolveImage: (src: string) => string | null, depth: number) {
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    parent.appendChild(document.createTextNode(node.textContent ?? ''));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const name = el.localName.toLowerCase();
  if (DROP.has(name)) return;

  const children = (target: Node) => {
    if (depth >= MAX_DEPTH) {
      target.appendChild(document.createTextNode(el.textContent ?? ''));
      return;
    }
    for (const child of Array.from(el.childNodes)) copy(child, target, resolveImage, depth + 1);
  };

  if (name === 'img' || name === 'image') {
    const src = el.getAttribute('src') ?? el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href');
    const url = src ? resolveImage(src) : null;
    if (url) parent.appendChild(image(url, el.getAttribute('alt') ?? ''));
    return;
  }
  if (name === 'svg') {
    // SVG целиком не переносим (в нём могут быть скрипты), но обложки часто сделаны как <svg><image>.
    for (const img of Array.from(el.getElementsByTagNameNS('*', 'image'))) copy(img, parent, resolveImage, depth + 1);
    return;
  }

  const tag = SAME.has(name) ? name : RENAME[name];
  if (!tag) {
    // Незнакомый тег (a, span, font и т. п.): оставляем только содержимое.
    children(parent);
    return;
  }
  const target = document.createElement(tag);
  if (tag === 'td' || tag === 'th') {
    for (const attr of ['colspan', 'rowspan']) {
      const value = Number(el.getAttribute(attr));
      if (Number.isInteger(value) && value > 1 && value < 100) target.setAttribute(attr, String(value));
    }
  }
  if (tag === 'ol') {
    const start = Number(el.getAttribute('start'));
    if (Number.isInteger(start)) target.setAttribute('start', String(start));
  }
  children(target);
  parent.appendChild(target);
}

export function image(url: string, alt: string) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}
