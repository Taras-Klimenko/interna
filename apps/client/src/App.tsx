import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { Hud } from './ui/Hud';
import { CharacterPanel } from './ui/CharacterPanel';
import { EditorPanel } from './ui/EditorPanel';
import { ObjectCard } from './ui/ObjectCard';
import { ShelfPanel } from './ui/ShelfPanel';
import { MusicPanel } from './ui/MusicPanel';
import { syncPlayerWithWorld } from './audio/player';
import { useEditorStore } from './store/editorStore';
import { useInteractionStore } from './store/interactionStore';

export function App() {
  const editing = useEditorStore((s) => s.active);

  // В режиме расстановки карточки предметов и шкаф закрыты: предмет могут передвинуть или убрать.
  useEffect(() => {
    if (editing) useInteractionStore.getState().reset();
  }, [editing]);

  // Музыка останавливается, если колонку убрали; лишние файлы чистятся при запуске.
  useEffect(() => syncPlayerWithWorld(), []);

  return (
    <div className="app">
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
        </>
      )}
    </div>
  );
}
