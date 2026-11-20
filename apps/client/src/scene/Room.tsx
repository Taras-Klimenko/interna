import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { MathUtils, type Group, type Texture, type Vector3 } from 'three';
import { CELL_SIZE, WALL_HEIGHT } from '@interna/shared';
import { useWorldStore } from '../store/worldStore';
import { useUiStore } from '../store/uiStore';
import { useEditorStore } from '../store/editorStore';
import { roomDimensions } from './grid';
import { floorStyle, surfaceTexture, wallStyle, type SurfaceStyle } from './roomStyles';

const WALL_THICKNESS = 0.12;
const FLOOR_THICKNESS = 0.06;
const BASE_HEIGHT = 0.35;
/** Высота «плинтуса», до которой опускается спрятанная стена. */
const CUTAWAY_HEIGHT = 0.12;

const COLORS = {
  base: '#8a6a55',
  grid: '#a8835f',
};

/**
 * Копия общей текстуры пола или обоев с повтором под размер поверхности.
 * Картинка у копий общая, так что копия почти ничего не стоит.
 */
function useTiled(style: SurfaceStyle, width: number, height: number) {
  const texture = useMemo(() => {
    const copy = surfaceTexture(style).clone();
    copy.repeat.set(width / style.tile, height / style.tile);
    return copy;
  }, [style, width, height]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function Room() {
  const size = useWorldStore((s) => s.world.room.size);
  const floor = floorStyle(useWorldStore((s) => s.world.room.floor));
  const wall = wallStyle(useWorldStore((s) => s.world.room.wall));
  // В режиме расстановки сетка видна всегда.
  const gridToggled = useUiStore((s) => s.showGrid);
  const editing = useEditorStore((s) => s.active);
  const showGrid = gridToggled || editing;
  const { width, depth } = roomDimensions(size);
  const outerW = width + WALL_THICKNESS * 2;
  const outerD = depth + WALL_THICKNESS * 2;
  const floorMap = useTiled(floor, outerW, outerD);
  const wallMapX = useTiled(wall, outerW, WALL_HEIGHT);
  const wallMapZ = useTiled(wall, depth, WALL_HEIGHT);

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
        <meshStandardMaterial map={floorMap} roughness={0.75} />
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
      <Wall position={[0, -depth / 2 - WALL_THICKNESS / 2]} length={outerW} alongX inward={[0, 1]} map={wallMapX} />
      <Wall position={[0, depth / 2 + WALL_THICKNESS / 2]} length={outerW} alongX inward={[0, -1]} map={wallMapX} />
      <Wall position={[-width / 2 - WALL_THICKNESS / 2, 0]} length={depth} inward={[1, 0]} map={wallMapZ} />
      <Wall position={[width / 2 + WALL_THICKNESS / 2, 0]} length={depth} inward={[-1, 0]} map={wallMapZ} />
    </group>
  );
}

/**
 * Спрятана ли стена с такой внутренней нормалью: камера с её внешней стороны.
 * Тем же правилом прячутся и висящие на стене предметы.
 */
export function isWallHidden(cameraPosition: Vector3, inward: { x: number; z: number }) {
  const len = Math.hypot(cameraPosition.x, cameraPosition.z) || 1;
  const facing = (cameraPosition.x / len) * inward.x + (cameraPosition.z / len) * inward.z;
  return facing < -0.25;
}

interface WallProps {
  position: [number, number];
  length: number;
  alongX?: boolean;
  inward: [number, number];
  /** Обои с повтором под длину стены. */
  map: Texture;
}

/**
 * Стена, которая опускается до плинтуса, когда камера оказывается снаружи от неё,
 * чтобы не загораживать комнату (как в The Sims). Работает при любом угле камеры.
 */
function Wall({ position, length, alongX = false, inward, map }: WallProps) {
  const ref = useRef<Group>(null);

  useFrame(({ camera }, delta) => {
    const group = ref.current;
    if (!group) return;
    const hidden = isWallHidden(camera.position, { x: inward[0], z: inward[1] });
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
        <meshStandardMaterial map={map} roughness={0.95} />
      </mesh>
    </group>
  );
}
