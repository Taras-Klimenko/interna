import { Suspense, lazy, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useGraphicsStore, useQualityTier } from './store/graphicsStore';
import { Scene } from './scene/Scene';
import { Hud } from './ui/Hud';
import { CharacterPanel } from './ui/CharacterPanel';
import { EditorPanel } from './ui/EditorPanel';
import { ObjectCard } from './ui/ObjectCard';
import { ShelfPanel } from './ui/ShelfPanel';
import { MusicPanel } from './ui/MusicPanel';
import { FramePanel } from './ui/FramePanel';
import { LoginScreen } from './ui/LoginScreen';
import { ChatPanel } from './ui/ChatPanel';
import { InteractionNotice } from './ui/Notice';
import { AwayCard } from './ui/AwayCard';
import { Onboarding } from './ui/Onboarding';
import { CharacterEditor } from './ui/CharacterEditor';
import { useAccountStore } from './store/accountStore';
import { startWorldSync } from './api/worldSync';
import { startRoomEvents } from './chat/events';
import { startIdleLife } from './chat/idle';
import { bookFiles, coverFiles, photoFiles } from './storage/files';
import { useReaderStore } from './store/readerStore';
import { useWorldStore } from './store/worldStore';
import { isDarkHour } from './scene/timeOfDay';
import { useRoomHour } from './ui/useRoomHour';
import { syncPlayerWithWorld } from './audio/player';
import { startAmbience } from './audio/ambience';
import { useEditorStore } from './store/editorStore';
import { useUiStore } from './store/uiStore';
import { useInteractionStore } from './store/interactionStore';

/** Через столько после запуска начинаем следить за частотой кадров (режим качества «Авто»). */
const MONITOR_AFTER_MS = 6_000;

/** Читалка вместе с разбором книг — отдельный кусок кода: грузится, когда открывают книгу. */
const Reader = lazy(() => import('./ui/Reader').then((module) => ({ default: module.Reader })));

export function App() {
  const editing = useEditorStore((s) => s.active);
  const outside = useUiStore((s) => s.place === 'field');
  const tier = useQualityTier();
  const autoQuality = useGraphicsStore((s) => s.setting === 'auto');
  // Первые секунды кадров мало из-за загрузки моделей — качество по ним не судим.
  const [monitoring, setMonitoring] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMonitoring(true), MONITOR_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);
  const dark = isDarkHour(useRoomHour());
  const reading = useReaderStore((s) => s.open !== null);
  const covered = useUiStore((s) => s.roomCovered);
  const appearanceEditor = useUiStore((s) => s.appearanceEditor);
  // Пока идёт знакомство, обычного интерфейса нет: только комната и шаги знакомства.
  const onboarding = useWorldStore((s) => s.world.onboarded === false);
  const userId = useAccountStore((s) => (s.status === 'signed-in' ? (s.user?.id ?? null) : null));
  const token = useAccountStore((s) => s.token);

  // Сохранённый вход проверяем при запуске; после входа мир синхронизируется с сервером.
  useEffect(() => {
    void useAccountStore.getState().init();
  }, []);
  useEffect(() => {
    if (!userId || !token) return;
    return startWorldSync(userId, token);
  }, [userId, token]);
  // Персонаж замечает, что происходит в комнате (вернулись, новая книга…), и откликается сам.
  useEffect(() => {
    if (!userId) return;
    return startRoomEvents(userId);
  }, [userId]);
  // А пока вы молчите, раз в несколько минут сам решает, чем заняться.
  useEffect(() => {
    if (!userId) return;
    return startIdleLife();
  }, [userId]);

  // В режиме расстановки карточки предметов и шкаф закрыты: предмет могут передвинуть или убрать.
  useEffect(() => {
    if (editing) useInteractionStore.getState().reset();
  }, [editing]);

  // Музыка останавливается, если колонку убрали; лишние файлы чистятся при запуске.
  useEffect(() => syncPlayerWithWorld(), []);
  // Звуки комнаты: шаги, выключатель, полив, дождь — заработают после первого нажатия.
  useEffect(() => startAmbience(), []);

  // Фото, которые больше не висят ни в одной рамке (рамку убрали, комнату сбросили), удаляем при запуске.
  useEffect(() => {
    const used = useWorldStore.getState().world.objects.flatMap((o) => o.state.display?.photo?.id ?? []);
    void photoFiles.removeUnused(new Set(used)).catch(() => undefined);
    // То же с книгами из файлов: шкаф убрали или комнату сбросили.
    const books = new Set(useWorldStore.getState().world.objects.flatMap((o) => o.state.container ?? []).filter((b) => b.file).map((b) => b.id));
    void bookFiles.removeUnused(books).catch(() => undefined);
    void coverFiles.removeUnused(books).catch(() => undefined);
  }, []);

  return (
    <div className="app" data-dark={dark}>
      {/* Пока открыта книга или редактор внешности, комнату не видно: не рисуем её, чтобы не тратить батарею. */}
      <Canvas
        frameloop={reading || covered ? 'never' : 'always'}
        shadows
        dpr={tier === 'high' ? [1, 2] : tier === 'medium' ? [1, 1.5] : 1}
        camera={{ fov: 30, near: 0.1, far: 100, position: [7.5, 7.5, 7.5] }}
      >
        {/* В режиме «Авто» качество подстраивается под устройство: мало кадров — эффекты попроще. */}
        {autoQuality && monitoring && (
          <PerformanceMonitor
            onDecline={() => useGraphicsStore.getState().degrade()}
            onIncline={() => useGraphicsStore.getState().improve()}
            flipflops={3}
          />
        )}
        <Scene />
      </Canvas>
      {onboarding ? (
        <Onboarding />
      ) : appearanceEditor ? (
        <CharacterEditor
          title="Внешность"
          footer={
            <button type="button" className="book-submit" onClick={() => useUiStore.getState().setAppearanceEditor(false)}>
              Готово
            </button>
          }
        />
      ) : (
        <Hud />
      )}
      {onboarding || appearanceEditor ? null : outside ? (
        // На прогулке комнатных панелей нет — только разговор и уведомления.
        <>
          <ChatPanel />
          <InteractionNotice />
        </>
      ) : editing ? (
        <EditorPanel />
      ) : (
        <>
          <CharacterPanel />
          <ObjectCard />
          <ShelfPanel />
          <MusicPanel />
          <FramePanel />
          <ChatPanel />
        </>
      )}
      {!editing && !onboarding && <AwayCard />}
      {reading && (
        <Suspense fallback={null}>
          <Reader />
        </Suspense>
      )}
      <LoginScreen />
    </div>
  );
}
