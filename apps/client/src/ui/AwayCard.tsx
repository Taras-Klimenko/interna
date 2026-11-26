import { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { DEFAULT_CHARACTER_NAME, useWorldStore } from '../store/worldStore';

/** Сама закрывается через столько, если её не закрыли раньше. */
const AUTO_CLOSE_MS = 30_000;

function awayText(hours: number) {
  if (hours >= 48) return `${Math.round(hours / 24)} дн.`;
  return `${Math.max(1, Math.round(hours))} ч`;
}

/** «Пока тебя не было…»: что персонаж делал, пока хозяина не было в комнате. */
export function AwayCard() {
  const story = useChatStore((s) => s.awayStory);
  const name = useWorldStore((s) => s.world.character.name.trim()) || DEFAULT_CHARACTER_NAME;

  useEffect(() => {
    if (!story) return;
    const id = window.setTimeout(() => useChatStore.getState().closeAwayStory(), AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [story]);

  if (!story) return null;
  return (
    <aside className="away" aria-label="Пока тебя не было">
      <header className="away-header">
        <div>
          <h2 className="away-title">Пока тебя не было…</h2>
          <p className="away-subtitle">
            {name} · {awayText(story.hoursAway)}
          </p>
        </div>
        <button type="button" className="sheet-close" onClick={() => useChatStore.getState().closeAwayStory()} aria-label="Закрыть">
          ✕
        </button>
      </header>
      <ul className="away-list">
        {story.moments.map((moment, index) => (
          <li key={index}>{moment}</li>
        ))}
      </ul>
    </aside>
  );
}
