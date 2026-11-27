import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CharacterAppearance } from '@interna/shared';
import { CharacterModel } from '../character/CharacterModel';
import { IDLE_CLIP } from '../character/assets';

/**
 * Персонаж крупным планом для редактора внешности: свой маленький холст, мягкий свет, медленно вращается.
 * Можно покрутить мышью или пальцем и приблизить.
 */
export function CharacterPreview({ appearance }: { appearance: CharacterAppearance }) {
  return (
    <Canvas className="preview-canvas" dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 30, position: [0, 1.2, 3.9] }}>
      <hemisphereLight intensity={1.3} color="#fff4e6" groundColor="#b59b84" />
      <directionalLight position={[2, 4, 3]} intensity={2.2} color="#fff1dc" />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#c9d6ff" />
      <Suspense fallback={null}>
        {/* Новое тело — новый скелет: модель пересоздаётся. */}
        <CharacterModel key={appearance.body} appearance={appearance} clip={IDLE_CLIP} />
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[0.9, 48]} />
        <meshStandardMaterial color="#e9dccb" roughness={1} />
      </mesh>
      <OrbitControls
        target={[0, 0.95, 0]}
        enablePan={false}
        minDistance={1.4}
        maxDistance={4.5}
        minPolarAngle={0.6}
        maxPolarAngle={1.7}
        autoRotate
        autoRotateSpeed={0.7}
      />
    </Canvas>
  );
}
