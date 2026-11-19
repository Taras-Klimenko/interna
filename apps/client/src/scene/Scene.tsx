import { Suspense } from 'react';
import { useWorldStore } from '../store/worldStore';
import { useEditorStore } from '../store/editorStore';
import { EditorController } from '../editor/EditorController';
import { Character } from '../character/Character';
import { CameraRig } from './CameraRig';
import { Room } from './Room';
import { FloorPicker } from './FloorPicker';
import { PlacedObjectMesh } from './PlacedObjectMesh';

export function Scene() {
  const world = useWorldStore((s) => s.world);
  const editing = useEditorStore((s) => s.active);
  const draft = useEditorStore((s) => s.draft);

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
      {editing ? <EditorController /> : <FloorPicker />}
      {world.objects.map((object) =>
        // Переносимый предмет прячем: вместо него рисуется полупрозрачный «призрак».
        object.id === draft?.sourceId ? null : <PlacedObjectMesh key={object.id} object={object} roomSize={world.room.size} />,
      )}
      {draft && (
        <PlacedObjectMesh
          object={{ id: 'draft', defId: draft.defId, pos: draft.pos, rotation: draft.rotation, state: {} }}
          roomSize={world.room.size}
          variant="ghost"
          valid={draft.valid}
        />
      )}
      <Suspense fallback={null}>
        <Character />
      </Suspense>
    </>
  );
}
