import { RoundedBox } from '@react-three/drei';
import { CELL_SIZE, type PlacedObject, type GridSize } from '@interna/shared';
import { CATALOG } from '../catalog/placeholders';
import { footprintCenter, rotatedFootprint, rotationToRadians } from './grid';

interface Props {
  object: PlacedObject;
  roomSize: GridSize;
}

/** Заглушка предмета: скруглённый блок по размеру footprint. Заменится на glTF-модель. */
export function PlacedObjectMesh({ object, roomSize }: Props) {
  const def = CATALOG[object.defId];
  if (!def) return null;

  const occupied = rotatedFootprint(def.footprint, object.rotation);
  const center = footprintCenter(object.pos, occupied, roomSize);
  // Сам блок строится по исходному footprint и поворачивается целиком.
  const w = def.footprint.w * CELL_SIZE * 0.92;
  const d = def.footprint.h * CELL_SIZE * 0.92;
  const radius = Math.min(0.05, def.height / 2 - 0.001, w / 2, d / 2);

  const isLight = def.components.some((c) => c.type === 'light');
  const lightOn = isLight && object.state.light?.on;

  return (
    <group position={[center.x, 0, center.z]} rotation={[0, rotationToRadians(object.rotation), 0]}>
      <RoundedBox
        args={[w, def.height, d]}
        radius={Math.max(radius, 0.001)}
        smoothness={3}
        position={[0, def.height / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={def.placeholderColor} roughness={0.8} />
      </RoundedBox>

      {lightOn && (
        <>
          <mesh position={[0, def.height + 0.08, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color="#fff3c4" emissive="#ffd27a" emissiveIntensity={2} />
          </mesh>
          <pointLight position={[0, def.height + 0.1, 0]} color="#ffc983" intensity={3} distance={4} decay={2} />
        </>
      )}
    </group>
  );
}
