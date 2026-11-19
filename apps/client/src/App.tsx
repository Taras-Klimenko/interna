import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { Hud } from './ui/Hud';
import { CharacterPanel } from './ui/CharacterPanel';
import { EditorPanel } from './ui/EditorPanel';
import { useEditorStore } from './store/editorStore';

export function App() {
  const editing = useEditorStore((s) => s.active);
  return (
    <div className="app">
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 100, position: [7.5, 7.5, 7.5] }}>
        <Scene />
      </Canvas>
      <Hud />
      {editing ? <EditorPanel /> : <CharacterPanel />}
    </div>
  );
}
