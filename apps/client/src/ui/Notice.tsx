import { useEffect, useState } from 'react';

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
