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
import { photoFiles } from './storage/files';
import { useWorldStore } from './store/worldStore';
import { isDarkHour } from './scene/timeOfDay';
import { useRoomHour } from './ui/useRoomHour';
import { syncPlayerWithWorld } from './audio/player';
import { useEditorStore } from './store/editorStore';
import { useInteractionStore } from './store/interactionStore';

export function App() {
  const editing = useEditorStore((s) => s.active);
  const dark = isDarkHour(useRoomHour());

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
  }, []);

  return (
    <div className="app" data-dark={dark}>
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 100, position: [7.5, 7.5, 7.5] }}>
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
        </>
      )}
    </div>
  );
}
