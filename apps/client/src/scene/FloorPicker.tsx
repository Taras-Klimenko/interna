import { useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { CELL_SIZE, type GridPos, type GridSize } from '@interna/shared';
import { useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { buildOccupancy, findPath, isWalkable } from '../character/pathfinding';
import { cellCenter, roomDimensions, worldToCell } from './grid';

/** Больше стольких пикселей между нажатием и отпусканием — это вращение камеры, а не клик. */
const CLICK_TOLERANCE_PX = 5;

/**
 * Невидимая плоскость над полом: подсвечивает клетку под курсором,
 * по клику строит маршрут для персонажа.
 */
export function FloorPicker() {
  const room = useWorldStore((s) => s.world.room);
  const objects = useWorldStore((s) => s.world.objects);
  const target = useCharacterStore((s) => s.target);
  const walk = useCharacterStore((s) => s.walk);
  const [hover, setHover] = useState<GridPos | null>(null);

  const blocked = useMemo(() => buildOccupancy(room.size, objects), [room.size, objects]);
  const { width, depth } = roomDimensions(room.size);

  const cellAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => worldToCell(e.point.x, e.point.z, room.size);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_TOLERANCE_PX) return;
    const goal = cellAt(e);
    if (!goal) return;
    const start = useWorldStore.getState().world.character.pos;
    const path = findPath(blocked, start, goal);
    if (path && path.length > 0) walk(path, goal);
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onPointerMove={(e) => setHover(cellAt(e))}
        onPointerOut={() => setHover(null)}
        onClick={onClick}
      >
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {hover && <CellMarker cell={hover} roomSize={room.size} color={isWalkable(blocked, hover) ? '#6fbf73' : '#d9665b'} opacity={0.35} />}
      {target && <CellMarker cell={target} roomSize={room.size} color="#c9845f" opacity={0.6} ring />}
    </group>
  );
}

interface CellMarkerProps {
  cell: GridPos;
  roomSize: GridSize;
  color: string;
  opacity: number;
  ring?: boolean;
}

function CellMarker({ cell, roomSize, color, opacity, ring = false }: CellMarkerProps) {
  const c = cellCenter(cell, roomSize);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[c.x, 0.012, c.z]} raycast={() => null}>
      {ring ? (
        <ringGeometry args={[CELL_SIZE * 0.25, CELL_SIZE * 0.4, 32]} />
      ) : (
        <planeGeometry args={[CELL_SIZE * 0.92, CELL_SIZE * 0.92]} />
      )}
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
