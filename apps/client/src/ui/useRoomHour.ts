import { useEffect, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { hourFor } from '../scene/timeOfDay';

/** Который час в комнате (0–24) — для интерфейса. В режиме «авто» обновляется раз в минуту. */
export function useRoomHour() {
  const mode = useUiStore((s) => s.timeMode);
  const [, tick] = useState(0);
  useEffect(() => {
    if (mode !== 'auto') return;
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [mode]);
  return hourFor(mode);
}
