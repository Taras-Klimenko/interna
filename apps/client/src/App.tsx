import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { Hud } from './ui/Hud';
import { CharacterPanel } from './ui/CharacterPanel';
import { EditorPanel } from './ui/EditorPanel';
import { ObjectCard } from './ui/ObjectCard';
import { ShelfPanel } from './ui/ShelfPanel';
import { MusicPanel } from './ui/MusicPanel';
import { FramePanel } from './ui/FramePanel';
import { Reader } from './ui/Reader';
import { LoginScreen } from './ui/LoginScreen';
import { ChatPanel } from './ui/ChatPanel';
import { AwayCard } from './ui/AwayCard';
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
import { useEditorStore } from './store/editorStore';
import { useInteractionStore } from './store/interactionStore';

export function App() {
  const editing = useEditorStore((s) => s.active);
  const dark = isDarkHour(useRoomHour());
  const reading = useReaderStore((s) => s.open !== null);
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
      {/* Пока открыта книга, комнату не видно: не рисуем её, чтобы не тратить батарею. */}
      <Canvas frameloop={reading ? 'never' : 'always'} shadows dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 100, position: [7.5, 7.5, 7.5] }}>
        <Scene />
      </Canvas>
      <Hud />
      {editing ? (
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
      {!editing && <AwayCard />}
      <Reader />
      <LoginScreen />
    </div>
  );
}
