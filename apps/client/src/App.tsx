import { Canvas } from '@react-three/fiber';
import { Scene } from './scene/Scene';
import { Hud } from './ui/Hud';
import { CharacterPanel } from './ui/CharacterPanel';

export function App() {
  return (
    <div className="app">
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 100, position: [7.5, 7.5, 7.5] }}>
        <Scene />
      </Canvas>
      <Hud />
      <CharacterPanel />
    </div>
  );
}
