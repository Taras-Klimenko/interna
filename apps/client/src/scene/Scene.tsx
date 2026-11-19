import { Suspense } from 'react';
import { useWorldStore } from '../store/worldStore';
import { Character } from '../character/Character';
import { CameraRig } from './CameraRig';
import { Room } from './Room';
import { FloorPicker } from './FloorPicker';
import { PlacedObjectMesh } from './PlacedObjectMesh';

export function Scene() {
  const world = useWorldStore((s) => s.world);

  return (
    <>
      <color attach="background" args={['#f3e7da']} />

      <hemisphereLight args={['#fff4e6', '#b59b84', 1.1]} />
      <directionalLight
        position={[4, 9, 5]}
        intensity={2.2}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={1}
        shadow-camera-far={25}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      <CameraRig />
      <Room />
      <FloorPicker />
      {world.objects.map((object) => (
        <PlacedObjectMesh key={object.id} object={object} roomSize={world.room.size} />
      ))}
      <Suspense fallback={null}>
        <Character />
      </Suspense>
    </>
  );
}
