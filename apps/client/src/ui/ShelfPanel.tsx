import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CATALOG } from '../catalog/catalog';
import { bookCapacity } from '../interaction/actions';
import { useInteractionStore } from '../store/interactionStore';
import { useWorldStore } from '../store/worldStore';

/** Открытый книжный шкаф: ваши книги и форма, чтобы поставить новую. */
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

  // Esc закрывает шкаф, даже если курсор в поле ввода.
  useEffect(() => {
    if (!shelfId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') closeShelf();
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

  const onRemove = (bookId: string, bookTitle: string) => {
    if (window.confirm(`Убрать «${bookTitle}» с полки?`)) removeBook(shelf.id, bookId);
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
              <li key={book.id} className="book">
                <div className="book-text">
                  <span className="book-title">{book.title}</span>
                  {book.author && <span className="book-author">{book.author}</span>}
                  {book.note && <span className="book-note">{book.note}</span>}
                </div>
                <button
                  type="button"
                  className="book-remove"
                  onClick={() => onRemove(book.id, book.title)}
                  aria-label={`Убрать «${book.title}»`}
                  title="Убрать с полки"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="book-form" onSubmit={onSubmit}>
          <h3>Поставить книгу</h3>
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
