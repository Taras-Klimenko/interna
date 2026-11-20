import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { CELL_SIZE } from '@interna/shared';
import { useWorldStore } from '../store/worldStore';
import { useUiStore } from '../store/uiStore';
import { useInteractionStore } from '../store/interactionStore';
import { buildOccupancy, findPath, nearestWalkable } from '../character/pathfinding';
import { cellCenter, roomDimensions, worldToCell } from './grid';
import { EYE_HEIGHT, canStand, player } from './player';

const FOV = 70;
const WALK_SPEED = 1.5;
const RUN_SPEED = 2.6;
/** Поворот стрелками, рад/с. */
const TURN_SPEED = 2.2;
/** Чувствительность обзора: радиан на пиксель перетаскивания. */
const LOOK_SPEED = 0.005;
const MAX_PITCH = 1.25;
/** Больше стольких пикселей между нажатием и отпусканием — это обзор, а не клик. */
const CLICK_TOLERANCE_PX = 5;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

/**
 * Вид от первого лица: вы стоите в комнате на высоте глаз. WASD и стрелки — ходить, перетаскивание
 * мышью или пальцем — смотреть, клик по полу — дойти туда. В мебель и в персонажа не проходите.
 */
export function FirstPersonRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const room = useWorldStore((s) => s.world.room.size);
  const objects = useWorldStore((s) => s.world.objects);
  const blocked = useMemo(() => buildOccupancy(room, objects), [room, objects]);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const keys = useRef(new Set<string>());
  const stuck = useRef(0);

  // Вход: камера на высоте глаз, шире угол обзора. Выход: возвращаем как было (диорама сама поставит камеру на место).
  useEffect(() => {
    const saved = { fov: camera.fov, near: camera.near };
    camera.fov = FOV;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    if (!player.placed) placePlayer(blockedRef.current, room);
    player.active = true;
    return () => {
      player.active = false;
      player.route = [];
      camera.fov = saved.fov;
      camera.near = saved.near;
      camera.updateProjectionMatrix();
    };
    // Только при входе в режим: размер комнаты во время прогулки не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // Клавиши и обзор перетаскиванием.
  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    let drag: { id: number; x: number; y: number; touch: boolean } | null = null;

    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || !MOVE_KEYS.has(e.code)) return;
      keys.current.add(e.code);
      player.route = [];
      useUiStore.getState().setWalkGoal(null);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear();
    const onDown = (e: PointerEvent) => {
      if (drag) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      // Мышью поворачиваем голову вслед за курсором, пальцем «тянем» комнату, как фото-панораму.
      const sign = drag.touch ? 1 : -1;
      player.yaw += sign * (e.clientX - drag.x) * LOOK_SPEED;
      player.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, player.pitch + sign * (e.clientY - drag.y) * LOOK_SPEED));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      canvas.style.touchAction = previousTouchAction;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const k = keys.current;
    const pressed = (...codes: string[]) => codes.some((c) => k.has(c));
    const forward = (pressed('KeyW', 'ArrowUp') ? 1 : 0) - (pressed('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0);
    player.yaw += ((pressed('ArrowLeft') ? 1 : 0) - (pressed('ArrowRight') ? 1 : 0)) * TURN_SPEED * delta;

    let dx = 0;
    let dz = 0;
    if (forward || strafe) {
      // Камера при yaw = 0 смотрит в −z.
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      dx = -sin * forward + cos * strafe;
      dz = -cos * forward - sin * strafe;
      const len = Math.hypot(dx, dz);
      const speed = (pressed('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED) * delta;
      dx = (dx / len) * speed;
      dz = (dz / len) * speed;
    } else if (player.route.length > 0) {
      const next = player.route[0]!;
      const tx = next.x - player.x;
      const tz = next.z - player.z;
      const dist = Math.hypot(tx, tz);
      const step = WALK_SPEED * delta;
      if (dist <= step) {
        player.route.shift();
        if (player.route.length === 0) useUiStore.getState().setWalkGoal(null);
      }
      const move = Math.min(step, dist);
      if (dist > 1e-4) {
        dx = (tx / dist) * move;
        dz = (tz / dist) * move;
      }
    }

    if (dx || dz) {
      const before = { x: player.x, z: player.z };
      // По осям отдельно: упёрлись в стол — скользим вдоль него.
      if (canStand(player.x + dx, player.z, blockedRef.current, room)) player.x += dx;
      if (canStand(player.x, player.z + dz, blockedRef.current, room)) player.z += dz;
      // Маршрут упёрся (например, в персонажа) — через секунду бросаем его.
      const movedEnough = Math.hypot(player.x - before.x, player.z - before.z) > Math.hypot(dx, dz) * 0.3;
      stuck.current = movedEnough ? 0 : stuck.current + delta;
      if (stuck.current > 1 && player.route.length > 0) {
        player.route = [];
        useUiStore.getState().setWalkGoal(null);
      }
    }

    camera.position.set(player.x, EYE_HEIGHT, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  });

  return <PlayerFloorPicker blocked={blocked} />;
}

/** Ставит вас в комнату: у передней стены, ближе к углу, откуда смотрела диорама, лицом к середине. */
function placePlayer(blocked: boolean[][], room: { w: number; h: number }) {
  const cell = nearestWalkable(blocked, { x: room.w - 2, z: room.h - 2 }) ?? { x: 0, z: 0 };
  let spot = cellCenter(cell, room);
  if (!canStand(spot.x, spot.z, blocked, room)) {
    // В этой клетке стоит персонаж: берём соседнюю свободную.
    for (const [ox, oz] of [[-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]] as const) {
      const c = cellCenter({ x: cell.x + ox, z: cell.z + oz }, room);
      if (canStand(c.x, c.z, blocked, room)) {
        spot = c;
        break;
      }
    }
  }
  player.x = spot.x;
  player.z = spot.z;
  player.yaw = Math.atan2(spot.x, spot.z);
  player.pitch = -0.15;
  player.placed = true;
}

/** Клик по полу — идти туда по клеткам, обходя мебель. */
function PlayerFloorPicker({ blocked }: { blocked: boolean[][] }) {
  const room = useWorldStore((s) => s.world.room.size);
  const goal = useUiStore((s) => s.walkGoal);
  const { width, depth } = roomDimensions(room);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_TOLERANCE_PX) return;
    useInteractionStore.getState().select(null);
    const from = worldToCell(player.x, player.z, room);
    const to = worldToCell(e.point.x, e.point.z, room);
    if (!from || !to) return;
    const cells = findPath(blocked, from, to);
    if (!cells) return;
    const route = cells.map((c) => cellCenter(c, room));
    // Последняя точка — ровно туда, куда кликнули, если там можно стоять.
    if (canStand(e.point.x, e.point.z, blocked, room)) {
      if (route.length > 0) route[route.length - 1] = { x: e.point.x, z: e.point.z };
      else route.push({ x: e.point.x, z: e.point.z });
    }
    player.route = route;
    useUiStore.getState().setWalkGoal(route.at(-1) ?? null);
  };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} onClick={onClick}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {goal && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[goal.x, 0.025, goal.z]} raycast={() => null}>
          <ringGeometry args={[CELL_SIZE * 0.18, CELL_SIZE * 0.28, 32]} />
          <meshBasicMaterial color="#c9845f" transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
