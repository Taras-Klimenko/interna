import { useEffect, useState } from 'react';
import { useInteractionStore } from '../store/interactionStore';

/** Всплывающее сообщение на пару секунд. Новое сообщение (новый seq) показывается заново. */
export function Notice({ notice }: { notice: { text: string; seq: number } | null }) {
  const [visibleSeq, setVisibleSeq] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    setVisibleSeq(notice.seq);
    const timer = window.setTimeout(() => setVisibleSeq(null), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice || visibleSeq !== notice.seq) return null;
  return (
    <div className="notice" role="status">
      {notice.text}
    </div>
  );
}

/** Общие уведомления (персонаж пошёл домой, комната загружена…) там, где нет карточки предмета, — например, на прогулке. */
export function InteractionNotice() {
  const notice = useInteractionStore((s) => s.notice);
  return <Notice notice={notice} />;
}
