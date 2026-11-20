import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, type Group, type Intersection, type Raycaster } from 'three';
import type { Rotation } from '@interna/shared';
import { facingOf } from '../editor/placement';
import { isWallHidden } from './Room';

/**
 * Настенный предмет прячется вместе со своей стеной, когда её опускают, чтобы заглянуть в комнату.
 * Возвращает ref для группы предмета и raycast для его мешей: спрятанный предмет нельзя кликнуть
 * (Three.js проверяет луч и у невидимых объектов). «Призрак» в руке видно всегда.
 */
export function useHideWithWall(rotation: Rotation, ghost: boolean) {
  const group = useRef<Group>(null);
  const hidden = useRef(false);

  useFrame(({ camera }) => {
    hidden.current = !ghost && isWallHidden(camera.position, facingOf(rotation));
    if (group.current) group.current.visible = !hidden.current;
  });

  const raycast = useMemo(
    () =>
      function (this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
        if (!hidden.current) Mesh.prototype.raycast.call(this, raycaster, intersects);
      },
    [],
  );

  return { group, raycast };
}
