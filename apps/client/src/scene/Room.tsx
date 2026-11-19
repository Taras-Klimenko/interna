import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { MathUtils, type Group } from 'three';
import { CELL_SIZE, WALL_HEIGHT } from '@interna/shared';
import { useWorldStore } from '../store/worldStore';
import { useUiStore } from '../store/uiStore';
import { roomDimensions } from './grid';

const WALL_THICKNESS = 0.12;
const FLOOR_THICKNESS = 0.06;
const BASE_HEIGHT = 0.35;
/** Высота «плинтуса», до которой опускается спрятанная стена. */
const CUTAWAY_HEIGHT = 0.12;

const COLORS = {
  floor: '#d9b48a',
  base: '#8a6a55',
  wall: '#f1e4d3',
  grid: '#a8835f',
};

export function Room() {
  const size = useWorldStore((s) => s.world.room.size);
  const showGrid = useUiStore((s) => s.showGrid);
  const { width, depth } = roomDimensions(size);
  const outerW = width + WALL_THICKNESS * 2;
  const outerD = depth + WALL_THICKNESS * 2;

  // Линии сетки рисуются от начала координат; при нечётном размере комнаты сдвигаем на полклетки.
  const gridOffsetX = (size.w % 2) * (CELL_SIZE / 2);
  const gridOffsetZ = (size.h % 2) * (CELL_SIZE / 2);

  return (
    <group>
      {/* Подставка диорамы */}
      <mesh position={[0, -FLOOR_THICKNESS - BASE_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[outerW + 0.2, BASE_HEIGHT, outerD + 0.2]} />
        <meshStandardMaterial color={COLORS.base} roughness={0.9} />
      </mesh>

      {/* Пол: верхняя грань на y = 0 */}
      <mesh position={[0, -FLOOR_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[outerW, FLOOR_THICKNESS, outerD]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.75} />
      </mesh>

      {showGrid && (
        <Grid
          position={[gridOffsetX, 0.003, gridOffsetZ]}
          args={[width, depth]}
          cellSize={CELL_SIZE}
          cellThickness={0.6}
          cellColor={COLORS.grid}
          sectionSize={CELL_SIZE * 5}
          sectionThickness={1}
          sectionColor={COLORS.grid}
          fadeDistance={60}
        />
      )}

      {/* Стены. inward — нормаль, смотрящая внутрь комнаты. */}
      <Wall position={[0, -depth / 2 - WALL_THICKNESS / 2]} length={outerW} alongX inward={[0, 1]} />
      <Wall position={[0, depth / 2 + WALL_THICKNESS / 2]} length={outerW} alongX inward={[0, -1]} />
      <Wall position={[-width / 2 - WALL_THICKNESS / 2, 0]} length={depth} inward={[1, 0]} />
      <Wall position={[width / 2 + WALL_THICKNESS / 2, 0]} length={depth} inward={[-1, 0]} />
    </group>
  );
}

interface WallProps {
  position: [number, number];
  length: number;
  alongX?: boolean;
  inward: [number, number];
}

/**
 * Стена, которая опускается до плинтуса, когда камера оказывается снаружи от неё,
 * чтобы не загораживать комнату (как в The Sims). Работает при любом угле камеры.
 */
function Wall({ position, length, alongX = false, inward }: WallProps) {
  const ref = useRef<Group>(null);

  useFrame(({ camera }, delta) => {
    const group = ref.current;
    if (!group) return;
    const len = Math.hypot(camera.position.x, camera.position.z) || 1;
    const facing = (camera.position.x / len) * inward[0] + (camera.position.z / len) * inward[1];
    // facing < 0: камера с внешней стороны стены.
    const hidden = facing < -0.25;
    const target = hidden ? CUTAWAY_HEIGHT / WALL_HEIGHT : 1;
    group.scale.y = MathUtils.damp(group.scale.y, target, 10, delta);
  });

  const [x, z] = position;
  const sizeX = alongX ? length : WALL_THICKNESS;
  const sizeZ = alongX ? WALL_THICKNESS : length;

  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[0, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[sizeX, WALL_HEIGHT, sizeZ]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.95} />
      </mesh>
    </group>
  );
}
