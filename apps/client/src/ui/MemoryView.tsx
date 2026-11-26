import { useEffect, useState } from 'react';
import { forgetAllFacts, forgetFact, loadMemory, type MemoryItem } from '../api/chat';
import { useAccountStore } from '../store/accountStore';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

/**
 * Что персонаж помнит: факты о хозяине (каждый можно стереть) и его дневник.
 * Показывается внутри панели разговора.
 */
export function MemoryView({ name }: { name: string }) {
  const [facts, setFacts] = useState<MemoryItem[] | null>(null);
  const [diary, setDiary] = useState<MemoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const token = useAccountStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    loadMemory(token)
      .then((memory) => {
        setFacts(memory.facts);
        setDiary(memory.diary);
      })
      .catch(() => setError('Не получилось загрузить память — нет связи с сервером.'));
  }, [token]);

  const forget = async (id: string) => {
    if (!token) return;
    setFacts((current) => current?.filter((fact) => fact.id !== id) ?? null);
    await forgetFact(token, id).catch(() => setError('Не получилось стереть — попробуйте ещё раз.'));
  };

  const forgetAll = async () => {
    if (!token || !window.confirm(`Стереть всё, что ${name} знает о вас? Дневник останется.`)) return;
    setFacts([]);
    await forgetAllFacts(token).catch(() => setError('Не получилось стереть — попробуйте ещё раз.'));
  };

  if (error) return <p className="chat-error">{error}</p>;
  if (!facts) return <p className="sheet-empty">Вспоминаю…</p>;

  return (
    <div className="memory">
      <section>
        <h3 className="memory-heading">Что помнит о вас</h3>
        {facts.length === 0 ? (
          <p className="sheet-empty">Пока ничего. Расскажите о себе — важное запомнится само.</p>
        ) : (
          <>
            <ul className="memory-facts">
              {facts.map((fact) => (
                <li key={fact.id}>
                  <span>{fact.text}</span>
                  <button type="button" className="book-remove" onClick={() => void forget(fact.id)} aria-label={`Забыть: ${fact.text}`} title="Забыть">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="memory-forget-all" onClick={() => void forgetAll()}>
              Забыть всё о себе
            </button>
          </>
        )}
      </section>
      <section>
        <h3 className="memory-heading">Дневник</h3>
        {diary.length === 0 ? (
          <p className="sheet-empty">Пока пусто: записи появятся в тихие минуты и пока вас нет.</p>
        ) : (
          <ul className="memory-diary">
            {diary.map((entry) => (
              <li key={entry.id}>
                <span className="memory-date">{dateFormat.format(new Date(entry.createdAt))}</span>
                {entry.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
