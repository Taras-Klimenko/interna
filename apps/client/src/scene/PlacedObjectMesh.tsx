import { RoundedBox } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { CameraControlsImpl } from '@react-three/drei';
import { CELL_SIZE, type PlacedObject, type GridSize } from '@interna/shared';
import { CATALOG } from '../catalog/placeholders';
import { useEditorStore } from '../store/editorStore';
import { footprintCenter, rotatedFootprint, rotationToRadians, worldToCell } from './grid';
import { setCameraRotateLock } from './CameraRig';

const COLORS = {
  selected: '#c9845f',
  valid: '#6fbf73',
  invalid: '#d9665b',
};

interface Props {
  object: PlacedObject;
  roomSize: GridSize;
  /** normal — обычный предмет, ghost — полупрозрачный предмет «в руке». */
  variant?: 'normal' | 'ghost';
  /** Для ghost: помещается ли он здесь. */
  valid?: boolean;
}

/** Заглушка предмета: скруглённый блок по размеру footprint. Заменится на glTF-модель. */
export function PlacedObjectMesh({ object, roomSize, variant = 'normal', valid = true }: Props) {
  const editing = useEditorStore((s) => s.active);
  const selected = useEditorStore((s) => s.selectedId === object.id && variant === 'normal');
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;

  const def = CATALOG[object.defId];
  if (!def) return null;

  const ghost = variant === 'ghost';
  const occupied = rotatedFootprint(def.footprint, object.rotation);
  const center = footprintCenter(object.pos, occupied, roomSize);
  // Сам блок строится по исходному footprint и поворачивается целиком.
  const w = def.footprint.w * CELL_SIZE * 0.92;
  const d = def.footprint.h * CELL_SIZE * 0.92;
  const radius = Math.min(0.05, def.height / 2 - 0.001, w / 2, d / 2);

  const isLight = def.components.some((c) => c.type === 'light');
  const lightOn = !ghost && isLight && object.state.light?.on;

  const markerColor = ghost ? (valid ? COLORS.valid : COLORS.invalid) : COLORS.selected;
  const showMarker = ghost || selected;

  // В режиме расстановки нажатие на предмет выбирает его, а сдвиг — начинает перенос (см. EditorController).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!e.nativeEvent.isPrimary) return;
    const editor = useEditorStore.getState();
    if (editor.draft) return;
    e.stopPropagation();
    const cell = worldToCell(e.point.x, e.point.z, roomSize) ?? object.pos;
    editor.select(object.id);
    editor.setGrab({ id: object.id, cell, clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY });
    // Камера иначе начнёт вращаться тем же движением.
    if (controls) setCameraRotateLock(controls, true);
  };

  const interactive = editing && !ghost;

  return (
    <group>
      <group position={[center.x, 0, center.z]} rotation={[0, rotationToRadians(object.rotation), 0]}>
        <RoundedBox
          args={[w, def.height, d]}
          radius={Math.max(radius, 0.001)}
          smoothness={3}
          position={[0, def.height / 2, 0]}
          castShadow={!ghost}
          receiveShadow={!ghost}
          onPointerDown={interactive ? onPointerDown : undefined}
          onPointerOver={interactive ? () => (document.body.style.cursor = 'grab') : undefined}
          onPointerOut={interactive ? () => (document.body.style.cursor = '') : undefined}
        >
          <meshStandardMaterial
            color={def.placeholderColor}
            roughness={0.8}
            transparent={ghost}
            opacity={ghost ? 0.6 : 1}
            depthWrite={!ghost}
            emissive={ghost || selected ? markerColor : '#000000'}
            emissiveIntensity={ghost ? 0.45 : selected ? 0.25 : 0}
          />
        </RoundedBox>

        {lightOn && (
          <>
            <mesh position={[0, def.height + 0.08, 0]} raycast={() => null}>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshStandardMaterial color="#fff3c4" emissive="#ffd27a" emissiveIntensity={2} />
            </mesh>
            <pointLight position={[0, def.height + 0.1, 0]} color="#ffc983" intensity={3} distance={4} decay={2} />
          </>
        )}
      </group>

      {/* Занимаемые клетки на полу: у выбранного предмета и у предмета в руке. */}
      {showMarker && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0.03, center.z]} raycast={() => null} renderOrder={1}>
          <planeGeometry args={[occupied.w * CELL_SIZE, occupied.h * CELL_SIZE]} />
          <meshBasicMaterial color={markerColor} transparent opacity={ghost ? 0.45 : 0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
