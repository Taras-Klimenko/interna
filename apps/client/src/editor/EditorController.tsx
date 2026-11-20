import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { CameraControlsImpl } from '@react-three/drei';
import type { GridPos, Rotation } from '@interna/shared';
import { CATALOG } from '../catalog/catalog';
import { facingOf, wallItemCenter, wallSpotAt } from './placement';
import { useEditorStore } from '../store/editorStore';
import { useWorldStore } from '../store/worldStore';
import { setCameraRotateLock } from '../scene/CameraRig';
import { worldToCell } from '../scene/grid';
import { isWallHidden } from '../scene/Room';

/** Сдвиг больше стольких пикселей — уже перетаскивание, а не клик. */
const DRAG_THRESHOLD_PX = 5;

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
/** Для настенных предметов луч ловим на высоте их центра: так курсор над стеной попадает в эту стену. */
const WALL_LEVEL = new Plane(new Vector3(0, 1, 0), 0);
const raycaster = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

/**
 * Обработка мыши и касаний в режиме расстановки.
 *
 * Слушаем события прямо на DOM, а не на 3D-объектах: предмет в руке должен
 * следовать за курсором, даже когда под курсором другой предмет. Клетку под курсором
 * считаем лучом из камеры до плоскости пола (y = 0). Настенный предмет (рамка) прижимается
 * к ближайшей к курсору стене.
 *
 * - предмет в руке: движение двигает его, отпускание кнопки/пальца над комнатой — ставит;
 * - нажатие на стоящий предмет (см. PlacedObjectMesh) выбирает его, а сдвиг начинает перенос;
 * - клик по пустому месту снимает выбор. Перетаскивание по пустому месту вращает камеру, как обычно.
 */
export function EditorController() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);

  useEffect(() => {
    const canvas = gl.domElement;
    let down: { x: number; y: number; onCanvas: boolean } | null = null;

    /** Куда под курсором встанет предмет в руке; rotation — только у настенных. */
    const spotAt = (clientX: number, clientY: number): { cell: GridPos; rotation?: Rotation } | null => {
      const { camera } = get();
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const room = useWorldStore.getState().world.room.size;
      const draftDef = CATALOG[useEditorStore.getState().draft?.defId ?? ''];
      if (draftDef?.mount) {
        WALL_LEVEL.constant = -wallItemCenter(draftDef);
        if (!raycaster.ray.intersectPlane(WALL_LEVEL, hit)) return null;
        // Вешаем только на видимые стены: на опущенной предмет спрятался бы вместе с ней.
        const spot = wallSpotAt(hit.x, hit.z, room, draftDef.footprint.w, (rotation) => !isWallHidden(camera.position, facingOf(rotation)));
        return { cell: spot.pos, rotation: spot.rotation };
      }
      if (!raycaster.ray.intersectPlane(FLOOR, hit)) return null;
      const cell = worldToCell(hit.x, hit.z, room);
      return cell && { cell };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY, onCanvas: true };
      // На телефоне нет «наведения»: предмет прыгает туда, куда коснулись.
      const editor = useEditorStore.getState();
      if (editor.draft) {
        const spot = spotAt(e.clientX, e.clientY);
        if (spot) editor.moveDraftTo(spot.cell, spot.rotation);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const editor = useEditorStore.getState();
      const { grab } = editor;
      if (grab && Math.hypot(e.clientX - grab.clientX, e.clientY - grab.clientY) > DRAG_THRESHOLD_PX) {
        editor.setGrab(null);
        editor.startMoving(grab.id, grab.cell);
      }
      // Над панелями интерфейса предмет не двигаем.
      if (e.target !== canvas || !useEditorStore.getState().draft) return;
      const spot = spotAt(e.clientX, e.clientY);
      if (spot) useEditorStore.getState().moveDraftTo(spot.cell, spot.rotation);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const start = down;
      down = null;
      const editor = useEditorStore.getState();
      const controls = get().controls as unknown as CameraControlsImpl | null;

      if (editor.grab) {
        // Нажали и отпустили, не сдвигая — это просто выбор предмета.
        editor.setGrab(null);
      } else if (editor.draft && start?.onCanvas) {
        const spot = spotAt(e.clientX, e.clientY);
        if (spot) editor.moveDraftTo(spot.cell, spot.rotation);
        // Новый предмет ставим, только если отпустили над комнатой; переносимый — в последнюю удачную точку.
        if (spot || editor.draft.sourceId) editor.commit();
      } else if (start?.onCanvas && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= DRAG_THRESHOLD_PX) {
        editor.select(null);
      }

      const { draft, grab } = useEditorStore.getState();
      if (controls) setCameraRotateLock(controls, draft !== null || grab !== null);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.body.style.cursor = '';
    };
  }, [gl, get]);

  return null;
}
