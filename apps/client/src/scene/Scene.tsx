import { Suspense } from 'react';
import { useWorldStore } from '../store/worldStore';
import { useEditorStore } from '../store/editorStore';
import { EditorController } from '../editor/EditorController';
import { Character } from '../character/Character';
import { CameraRig } from './CameraRig';
import { FirstPersonRig } from './FirstPersonRig';
import { useUiStore } from '../store/uiStore';
import { DayLight } from './DayLight';
import { Room } from './Room';
import { FloorPicker } from './FloorPicker';
import { PlacedObjectMesh } from './PlacedObjectMesh';

export function Scene() {
  const world = useWorldStore((s) => s.world);
  const editing = useEditorStore((s) => s.active);
  const draft = useEditorStore((s) => s.draft);
  const firstPerson = useUiStore((s) => s.firstPerson) && !editing;

  return (
    <>
      <DayLight />

      {/* Вид от первого лица сам ловит клики по полу: вы идёте туда, а не персонаж. */}
      {firstPerson ? <FirstPersonRig /> : <CameraRig />}
      <Room />
      {editing ? <EditorController /> : firstPerson ? null : <FloorPicker />}
      {world.objects.map((object) =>
        // Переносимый предмет прячем: вместо него рисуется полупрозрачный «призрак».
        object.id === draft?.sourceId ? null : <PlacedObjectMesh key={object.id} object={object} roomSize={world.room.size} />,
      )}
      {draft && (
        <PlacedObjectMesh
          object={{
            id: 'draft',
            defId: draft.defId,
            pos: draft.pos,
            rotation: draft.rotation,
            // У переносимого предмета «призрак» сохраняет вид (например, пропорции фото в рамке).
            state: world.objects.find((o) => o.id === draft.sourceId)?.state ?? {},
          }}
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
