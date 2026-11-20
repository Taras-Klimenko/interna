import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Book } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { BOOK_ACCEPT } from '../books/parseBook';
import { forgetBookFiles, importBook, importErrorText } from '../books/importBook';
import { coverFiles } from '../storage/files';
import { useReaderStore } from '../store/readerStore';
import { useBlobUrl } from './useBlobUrl';
import { bookCapacity } from '../interaction/actions';
import { useInteractionStore } from '../store/interactionStore';
import { useWorldStore } from '../store/worldStore';

/** Safari на iPhone не знает расширение .fb2 и не даёт выбрать такой файл, если задан список форматов. */
const isIos = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Открытый книжный шкаф: ваши книги, загрузка книги из файла и форма, чтобы поставить книгу вручную. */
export function ShelfPanel() {
  const shelfId = useInteractionStore((s) => (s.panel?.kind === 'shelf' ? s.panel.id : null));
  const closeShelf = useInteractionStore((s) => s.closePanel);
  const shelf = useWorldStore((s) => s.world.objects.find((o) => o.id === shelfId) ?? null);
  const addBook = useWorldStore((s) => s.addBook);
  const removeBook = useWorldStore((s) => s.removeBook);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [note, setNote] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const openBook = useReaderStore((s) => s.openBook);

  // Esc закрывает шкаф, даже если курсор в поле ввода.
  useEffect(() => {
    if (!shelfId) return;
    const onKey = (e: KeyboardEvent) => {
      // Открытую поверх шкафа читалку Esc закрывает первой.
      if (e.code === 'Escape' && !useReaderStore.getState().open) closeShelf();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shelfId, closeShelf]);

  const def = shelf ? CATALOG[shelf.defId] : undefined;
  const capacity = def ? bookCapacity(def) : null;
  if (!shelf || !def || capacity === null) return null;

  const books = shelf.state.container ?? [];
  const full = books.length >= capacity;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = { title: title.trim(), author: author.trim(), note: note.trim() };
    if (!clean.title || full) return;
    addBook(shelf.id, clean);
    setTitle('');
    setAuthor('');
    setNote('');
    titleRef.current?.focus();
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const { notify } = useInteractionStore.getState();
    setImporting(true);
    let added = 0;
    try {
      for (const file of files) {
        if (books.length + added >= capacity) {
          notify('Шкаф заполнен');
          break;
        }
        try {
          addBook(shelf.id, await importBook(file));
          added++;
        } catch (error) {
          notify(`«${file.name}»: ${importErrorText(error)}`);
        }
      }
    } finally {
      setImporting(false);
    }
  };

  const onRemove = (book: Book) => {
    const what = book.file ? ' Файл книги удалится из браузера.' : '';
    if (!window.confirm(`Убрать «${book.title}» с полки?${what}`)) return;
    removeBook(shelf.id, book.id);
    if (book.file) forgetBookFiles(book.id);
  };

  return (
    <aside className="sheet" aria-label={def.name}>
      <header className="sheet-header">
        <div>
          <h2 className="sheet-title">{def.name}</h2>
          <p className="sheet-subtitle">
            {books.length} из {capacity}
          </p>
        </div>
        <button type="button" className="sheet-close" onClick={closeShelf} title="Esc" aria-label="Закрыть">
          ✕
        </button>
      </header>

      <div className="sheet-body">
        {books.length === 0 ? (
          <p className="sheet-empty">Полка пока пустая. Поставьте сюда книги, которые читаете или любите.</p>
        ) : (
          <ul className="book-list">
            {books.map((book) => (
              <BookRow key={book.id} book={book} onRead={() => openBook(shelf.id, book.id)} onRemove={() => onRemove(book)} />
            ))}
          </ul>
        )}

        <div className="book-import">
          <input
            ref={fileInput}
            type="file"
            accept={isIos ? undefined : BOOK_ACCEPT}
            multiple
            hidden
            onChange={(e) => void onFiles(e)}
          />
          <button type="button" className="book-submit" onClick={() => fileInput.current?.click()} disabled={full || importing}>
            {importing ? 'Открываю…' : full ? 'Шкаф заполнен' : 'Добавить книгу из файла'}
          </button>
          <p className="panel-note">fb2, fb2.zip или epub: название, автор и обложка заполнятся сами, а читать можно прямо здесь. Файл хранится только в этом браузере.</p>
        </div>

        <form className="book-form" onSubmit={onSubmit}>
          <h3>Или вручную</h3>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название"
            aria-label="Название"
            maxLength={120}
            required
            disabled={full}
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Автор"
            aria-label="Автор"
            maxLength={120}
            disabled={full}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка: о чём, чем зацепила, где остановились"
            aria-label="Заметка"
            maxLength={500}
            rows={2}
            disabled={full}
          />
          <button type="submit" className="book-submit" disabled={full || !title.trim()}>
            {full ? 'Шкаф заполнен' : 'Поставить на полку'}
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Книга в списке: обложка, название, сколько прочитано. */
function BookRow({ book, onRead, onRemove }: { book: Book; onRead: () => void; onRemove: () => void }) {
  const cover = useBlobUrl(coverFiles.load, book.file?.hasCover ? book.id : undefined);
  const percent = book.progress ? Math.round(book.progress.percent * 100) : null;
  return (
    <li className="book">
      {book.file && (
        <div className="book-cover" style={{ background: book.color ?? '#8a6a4a' }} aria-hidden="true">
          {cover && <img src={cover} alt="" />}
        </div>
      )}
      <div className="book-text">
        <span className="book-title">{book.title}</span>
        {book.author && <span className="book-author">{book.author}</span>}
        {book.note && <span className="book-note">{book.note}</span>}
        {book.file && (
          <span className="book-progress">{percent === null ? 'ещё не открывали' : percent >= 99 ? 'прочитана' : `прочитано ${percent}%`}</span>
        )}
        {book.file && (
          <button type="button" className="chip chip-small book-read" onClick={onRead}>
            {percent === null ? 'Читать' : 'Продолжить'}
          </button>
        )}
      </div>
      <button type="button" className="book-remove" onClick={onRemove} aria-label={`Убрать «${book.title}»`} title="Убрать с полки">
        ✕
      </button>
    </li>
  );
}
