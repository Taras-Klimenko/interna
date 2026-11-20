import { create } from 'zustand';
import type { GridPos, Rotation } from '@interna/shared';
import { useWorldStore } from './worldStore';
import { useCharacterStore } from './characterStore';
import { canPlace, clampToRoom, findFreeSpot, findFreeWallSpot, footprintOf, isWallMounted, nextRotation } from '../editor/placement';

/**
 * Предмет «в руке»: новый из каталога (sourceId = null) или уже стоящий, который переносим.
 * offset — какая клетка предмета находится под курсором, чтобы он не «прыгал» при захвате.
 */
export interface Draft {
  defId: string;
  rotation: Rotation;
  pos: GridPos;
  offset: GridPos;
  sourceId: string | null;
  valid: boolean;
}

interface EditorStore {
  /** Режим расстановки включён. */
  active: boolean;
  selectedId: string | null;
  draft: Draft | null;
  /** Нажали на стоящий предмет, но ещё не сдвинули: это может быть и клик (выбор), и начало переноса. */
  grab: { id: string; cell: GridPos; clientX: number; clientY: number } | null;
  /** Короткое сообщение для пользователя («Здесь не поместится»). */
  notice: { text: string; seq: number } | null;

  setActive: (active: boolean) => void;
  select: (id: string | null) => void;
  setGrab: (grab: EditorStore['grab']) => void;
  /** Взять из каталога новый предмет. */
  startPlacing: (defId: string) => void;
  /** Начать переносить стоящий предмет, ухватив его за клетку grabCell. */
  startMoving: (id: string, grabCell: GridPos) => void;
  /** Курсор над клеткой cell — двигаем предмет в руке. Настенному предмету передаём и поворот: к какой стене он прижат. */
  moveDraftTo: (cell: GridPos, rotation?: Rotation) => void;
  /** Поставить предмет из руки. false — не поместился. */
  commit: () => boolean;
  cancel: () => void;
  rotate: () => void;
  removeSelected: () => void;
}

/** Клетки, занятые персонажем: на них мебель ставить нельзя. */
function characterCells(): GridPos[] {
  const cells = [useWorldStore.getState().world.character.pos];
  const target = useCharacterStore.getState().target;
  if (target) cells.push(target);
  return cells;
}

function centerOffset(defId: string, rotation: Rotation): GridPos {
  const fp = footprintOf(defId, rotation);
  return { x: Math.floor((fp.w - 1) / 2), z: Math.floor((fp.h - 1) / 2) };
}

function withValidity(draft: Omit<Draft, 'valid'>): Draft {
  const { world } = useWorldStore.getState();
  const valid = canPlace(
    { defId: draft.defId, pos: draft.pos, rotation: draft.rotation, ignoreId: draft.sourceId },
    world.room.size,
    world.objects,
    characterCells(),
  );
  return { ...draft, valid };
}

export const useEditorStore = create<EditorStore>()((set, get) => {
  const notify = (text: string) => set((s) => ({ notice: { text, seq: (s.notice?.seq ?? 0) + 1 } }));

  return {
    active: false,
    selectedId: null,
    draft: null,
    grab: null,
    notice: null,

    setActive: (active) => set({ active, draft: null, grab: null, selectedId: null, notice: null }),

    select: (id) => set({ selectedId: id }),
    setGrab: (grab) => set({ grab }),

    startPlacing: (defId) => {
      const { world } = useWorldStore.getState();
      if (isWallMounted(defId)) {
        const spot = findFreeWallSpot(defId, world.room.size, world.objects) ?? { pos: { x: 0, z: 0 }, rotation: 0 as Rotation };
        set({ selectedId: null, draft: withValidity({ defId, ...spot, offset: { x: 0, z: 0 }, sourceId: null }) });
        return;
      }
      const rotation: Rotation = 0;
      const fp = footprintOf(defId, rotation);
      const center = { x: Math.floor((world.room.size.w - fp.w) / 2), z: Math.floor((world.room.size.h - fp.h) / 2) };
      // Показываем предмет сразу на ближайшем свободном месте у центра, чтобы его было видно и без мыши (на телефоне).
      const pos = findFreeSpot({ defId, pos: center, rotation }, world.room.size, world.objects, characterCells()) ?? center;
      set({
        selectedId: null,
        draft: withValidity({ defId, rotation, pos, offset: centerOffset(defId, rotation), sourceId: null }),
      });
    },

    startMoving: (id, grabCell) => {
      const object = useWorldStore.getState().world.objects.find((o) => o.id === id);
      if (!object) return;
      const fp = footprintOf(object.defId, object.rotation);
      const offset = {
        x: Math.min(Math.max(grabCell.x - object.pos.x, 0), fp.w - 1),
        z: Math.min(Math.max(grabCell.z - object.pos.z, 0), fp.h - 1),
      };
      set({
        selectedId: id,
        draft: withValidity({ defId: object.defId, rotation: object.rotation, pos: object.pos, offset, sourceId: id }),
      });
    },

    moveDraftTo: (cell, rotation) => {
      const { draft } = get();
      if (!draft) return;
      const room = useWorldStore.getState().world.room.size;
      const facing = rotation ?? draft.rotation;
      const pos = clampToRoom(
        { x: cell.x - draft.offset.x, z: cell.z - draft.offset.z },
        footprintOf(draft.defId, facing),
        room,
      );
      if (pos.x === draft.pos.x && pos.z === draft.pos.z && facing === draft.rotation) return;
      set({ draft: withValidity({ ...draft, pos, rotation: facing }) });
    },

    commit: () => {
      const { draft } = get();
      if (!draft) return false;
      const checked = withValidity(draft);
      if (!checked.valid) {
        notify('Здесь не поместится');
        // Переносимый предмет возвращается на место, новый остаётся в руке — можно попробовать снова.
        if (checked.sourceId) set({ draft: null });
        else set({ draft: checked });
        return false;
      }
      const world = useWorldStore.getState();
      if (checked.sourceId) {
        world.moveObject(checked.sourceId, checked.pos, checked.rotation);
        set({ draft: null, selectedId: checked.sourceId });
      } else {
        const id = world.addObject(checked.defId, checked.pos, checked.rotation);
        set({ draft: null, selectedId: id });
      }
      return true;
    },

    cancel: () => {
      const { draft } = get();
      if (draft) set({ draft: null });
      else set({ selectedId: null });
    },

    rotate: () => {
      const { draft, selectedId } = get();
      const { world, moveObject } = useWorldStore.getState();
      const defId = draft?.defId ?? world.objects.find((o) => o.id === selectedId)?.defId;
      if (defId && isWallMounted(defId)) {
        notify('Настенный предмет смотрит в комнату — перетащите его на другую стену');
        return;
      }

      if (draft) {
        // Поворачиваем вокруг клетки под курсором.
        const pivot = { x: draft.pos.x + draft.offset.x, z: draft.pos.z + draft.offset.z };
        const rotation = nextRotation(draft.rotation);
        const offset = centerOffset(draft.defId, rotation);
        const pos = clampToRoom(
          { x: pivot.x - offset.x, z: pivot.z - offset.z },
          footprintOf(draft.defId, rotation),
          world.room.size,
        );
        set({ draft: withValidity({ ...draft, rotation, offset, pos }) });
        return;
      }

      const object = world.objects.find((o) => o.id === selectedId);
      if (!object) return;
      // Поворачиваем на месте, сохраняя центр предмета.
      const rotation = nextRotation(object.rotation);
      const before = centerOffset(object.defId, object.rotation);
      const after = centerOffset(object.defId, rotation);
      const pos = clampToRoom(
        { x: object.pos.x + before.x - after.x, z: object.pos.z + before.z - after.z },
        footprintOf(object.defId, rotation),
        world.room.size,
      );
      const ok = canPlace({ defId: object.defId, pos, rotation, ignoreId: object.id }, world.room.size, world.objects, characterCells());
      if (ok) moveObject(object.id, pos, rotation);
      else notify('Для поворота не хватает места');
    },

    removeSelected: () => {
      const { draft, selectedId } = get();
      const id = draft?.sourceId ?? (draft ? null : selectedId);
      if (draft) set({ draft: null });
      if (id) {
        useWorldStore.getState().removeObject(id);
        set({ selectedId: null });
      }
    },
  };
});
