import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookError, parseBook, type ParsedBook } from '../books/parseBook';
import { bookFiles } from '../storage/files';
import { useReaderStore } from '../store/readerStore';
import { useWorldStore } from '../store/worldStore';

type Theme = 'light' | 'sepia' | 'dark';
type Font = 'serif' | 'sans';

interface ReaderSettings {
  fontSize: number;
  theme: Theme;
  font: Font;
}

const SETTINGS_KEY = 'interna.reader';
const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 19, theme: 'sepia', font: 'serif' };
const FONT_SIZES = { min: 14, max: 30, step: 2 };
const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Светлая' },
  { id: 'sepia', label: 'Сепия' },
  { id: 'dark', label: 'Тёмная' },
];
/** Место в книге сохраняем не чаще, чем раз в столько миллисекунд: каждое сохранение пишет весь мир в localStorage. */
const SAVE_INTERVAL = 1500;

function loadSettings(): ReaderSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<ReaderSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Читалка поверх всего приложения. Книга открывается из шкафа. */
export function Reader() {
  const open = useReaderStore((s) => s.open);
  if (!open) return null;
  return <ReaderView key={open.bookId} shelfId={open.shelfId} bookId={open.bookId} />;
}

function ReaderView({ shelfId, bookId }: { shelfId: string; bookId: string }) {
  const book = useWorldStore((s) => s.world.objects.find((o) => o.id === shelfId)?.state.container?.find((b) => b.id === bookId));
  const close = useReaderStore((s) => s.close);
  const [parsed, setParsed] = useState<ParsedBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState(() => book?.progress?.chapter ?? 0);
  const [settings, setSettings] = useState(loadSettings);
  const [panel, setPanel] = useState<'toc' | 'settings' | null>(null);
  const [fraction, setFraction] = useState(0);

  const scroller = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  /** Куда прокрутить главу после показа (доля от 0 до 1). */
  const pendingOffset = useRef(book?.progress?.offset ?? 0);
  const lastSave = useRef(0);
  const position = useRef({ chapter, offset: pendingOffset.current });

  // Книга пропала с полки (убрали шкаф, сбросили комнату) — закрываемся.
  useEffect(() => {
    if (!book) close();
  }, [book, close]);

  useEffect(() => {
    let cancelled = false;
    let opened: ParsedBook | null = null;
    void (async () => {
      try {
        const file = await bookFiles.load(bookId);
        if (!file) throw new BookError('Файл книги не найден в этом браузере');
        opened = await parseBook(file);
        if (cancelled) opened.dispose();
        else {
          setChapter((c) => Math.min(c, opened!.chapters.length - 1));
          setParsed(opened);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof BookError ? e.message : 'Не получилось открыть книгу');
      }
    })();
    return () => {
      cancelled = true;
      opened?.dispose();
    };
  }, [bookId]);

  /** Сколько символов до начала каждой главы: для «прочитано N%». */
  const starts = useMemo(() => {
    const result: number[] = [];
    let total = 0;
    for (const c of parsed?.chapters ?? []) {
      result.push(total);
      total += c.length;
    }
    return { result, total: Math.max(1, total) };
  }, [parsed]);

  const percentAt = useCallback(
    (ch: number, offset: number) => {
      const length = parsed?.chapters[ch]?.length ?? 0;
      return Math.min(1, ((starts.result[ch] ?? 0) + offset * length) / starts.total);
    },
    [parsed, starts],
  );

  const save = useCallback(() => {
    if (!parsed) return;
    const { chapter: ch, offset } = position.current;
    lastSave.current = Date.now();
    useWorldStore.getState().setBookProgress(shelfId, bookId, {
      chapter: ch,
      offset: Math.round(offset * 1000) / 1000,
      percent: Math.round(percentAt(ch, offset) * 1000) / 1000,
      updatedAt: new Date().toISOString(),
    });
  }, [parsed, shelfId, bookId, percentAt]);

  const restore = () => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = pendingOffset.current * Math.max(0, el.scrollHeight - el.clientHeight);
  };

  // Показ главы: собираем её DOM и прокручиваем к сохранённому месту.
  useLayoutEffect(() => {
    const target = page.current;
    const current = parsed?.chapters[chapter];
    if (!target || !current) return;
    target.replaceChildren(current.render());
    restore();
    // Картинки догружаются и сдвигают текст: подправляем прокрутку ещё раз.
    const timer = window.setTimeout(restore, 250);
    position.current = { chapter, offset: pendingOffset.current };
    setFraction(pendingOffset.current);
    return () => window.clearTimeout(timer);
  }, [parsed, chapter]);

  // Другой размер шрифта — другая высота главы: остаёмся на том же месте.
  useLayoutEffect(() => {
    pendingOffset.current = position.current.offset;
    restore();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const offset = max > 0 ? Math.min(1, el.scrollTop / max) : 1;
    position.current = { chapter, offset };
    setFraction(offset);
    if (Date.now() - lastSave.current > SAVE_INTERVAL) save();
  };

  const goTo = (index: number) => {
    if (!parsed || index < 0 || index >= parsed.chapters.length) return;
    pendingOffset.current = 0;
    position.current = { chapter: index, offset: 0 };
    setChapter(index);
    setPanel(null);
    save();
  };

  const closeReader = useCallback(() => {
    save();
    close();
  }, [save, close]);

  // Esc закрывает сначала оглавление или настройки, потом книгу. Место сохраняем и при уходе со страницы.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (panel) setPanel(null);
      else closeReader();
    };
    const onHide = () => save();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [panel, closeReader, save]);

  const chapters = parsed?.chapters ?? [];
  const current = chapters[chapter];
  const percent = parsed ? Math.round(percentAt(chapter, fraction) * 100) : 0;
  const changeFont = (delta: number) =>
    setSettings((s) => ({ ...s, fontSize: Math.min(FONT_SIZES.max, Math.max(FONT_SIZES.min, s.fontSize + delta)) }));

  return (
    <div className="reader" data-theme={settings.theme} data-font={settings.font} role="dialog" aria-label={book?.title ?? 'Книга'}>
      <header className="reader-bar">
        <button type="button" className="reader-button" onClick={closeReader} title="Закрыть (Esc)" aria-label="Закрыть книгу">
          ✕
        </button>
        <div className="reader-heading">
          <span className="reader-book">{book?.title}</span>
          {current && current.title !== book?.title && <span className="reader-chapter">{current.title}</span>}
        </div>
        <button
          type="button"
          className="reader-button"
          aria-pressed={panel === 'toc'}
          onClick={() => setPanel((p) => (p === 'toc' ? null : 'toc'))}
          disabled={!parsed}
          title="Оглавление"
          aria-label="Оглавление"
        >
          ☰
        </button>
        <button
          type="button"
          className="reader-button"
          aria-pressed={panel === 'settings'}
          onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}
          title="Шрифт и тема"
          aria-label="Шрифт и тема"
        >
          Aa
        </button>
      </header>
      <div className="reader-progress" aria-hidden="true">
        <div style={{ width: `${percent}%` }} />
      </div>

      {panel === 'settings' && (
        <div className="reader-popover reader-settings">
          <div className="reader-row">
            <button type="button" className="reader-chip" onClick={() => changeFont(-FONT_SIZES.step)} disabled={settings.fontSize <= FONT_SIZES.min} aria-label="Мельче">
              A−
            </button>
            <span className="reader-size">{settings.fontSize}</span>
            <button type="button" className="reader-chip" onClick={() => changeFont(FONT_SIZES.step)} disabled={settings.fontSize >= FONT_SIZES.max} aria-label="Крупнее">
              A+
            </button>
          </div>
          <div className="reader-row">
            {(['serif', 'sans'] as const).map((font) => (
              <button
                key={font}
                type="button"
                className="reader-chip"
                data-font={font}
                aria-pressed={settings.font === font}
                onClick={() => setSettings((s) => ({ ...s, font }))}
              >
                {font === 'serif' ? 'С засечками' : 'Без засечек'}
              </button>
            ))}
          </div>
          <div className="reader-row">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="reader-chip reader-theme"
                data-theme={theme.id}
                aria-pressed={settings.theme === theme.id}
                onClick={() => setSettings((s) => ({ ...s, theme: theme.id }))}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === 'toc' && (
        <nav className="reader-popover reader-toc" aria-label="Оглавление">
          <ol>
            {chapters.map((c, i) => (
              <li key={i}>
                <button type="button" aria-current={i === chapter ? 'true' : undefined} onClick={() => goTo(i)}>
                  {c.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div ref={scroller} className="reader-scroll" onScroll={onScroll} style={{ fontSize: settings.fontSize }}>
        {error ? (
          <p className="reader-message">{error}</p>
        ) : !parsed ? (
          <p className="reader-message">Открываю книгу…</p>
        ) : null}
        <article ref={page} className="reader-page" lang="ru" hidden={!parsed} />
        {parsed && (
          <nav className="reader-nav" aria-label="Главы">
            <button type="button" className="reader-chip" onClick={() => goTo(chapter - 1)} disabled={chapter === 0}>
              ← Назад
            </button>
            <span>
              {chapter + 1} из {chapters.length}
            </span>
            <button type="button" className="reader-chip" onClick={() => goTo(chapter + 1)} disabled={chapter >= chapters.length - 1}>
              Дальше →
            </button>
          </nav>
        )}
      </div>
      <footer className="reader-footer">{parsed ? `${percent}%` : ''}</footer>
    </div>
  );
}
