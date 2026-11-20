/** Глава книги, готовая к показу в читалке. */
export interface Chapter {
  title: string;
  /** Примерная длина текста в символах: по ней считается, сколько прочитано от всей книги. */
  length: number;
  /** Собирает DOM главы. Каждый вызов — новые узлы. */
  render: () => DocumentFragment;
}

/** Разобранная книга. Картинки внутри — ссылки на blob, после закрытия книги их нужно освободить через dispose. */
export interface ParsedBook {
  format: 'fb2' | 'epub';
  title: string;
  author: string;
  /** Обложка как есть из файла (без уменьшения). */
  cover: Blob | null;
  chapters: Chapter[];
  dispose: () => void;
}

/** Файл не похож на книгу или повреждён: текст ошибки показывается пользователю. */
export class BookError extends Error {}

/** Ссылки на картинки книги: создаются при первом показе и освобождаются все разом. */
export class ImageUrls {
  private urls = new Map<string, string | null>();

  get(key: string, make: () => Blob | null): string | null {
    if (!this.urls.has(key)) {
      const blob = make();
      this.urls.set(key, blob ? URL.createObjectURL(blob) : null);
    }
    return this.urls.get(key) ?? null;
  }

  dispose() {
    for (const url of this.urls.values()) if (url) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

/** Дочерние элементы с таким локальным именем (без учёта пространства имён). */
export function kids(el: Element, name: string) {
  return Array.from(el.children).filter((c) => c.localName === name);
}

export function firstKid(el: Element | null | undefined, name: string) {
  return el ? (Array.from(el.children).find((c) => c.localName === name) ?? null) : null;
}

/** Текст элемента с нормальными пробелами. */
export function cleanText(node: Node | null | undefined) {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
