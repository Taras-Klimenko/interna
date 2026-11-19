import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { CharacterAppearance, GridPos, World } from '@interna/shared';

/** Стартовая комната, пока нет сохранения и онбординга. */
const initialWorld: World = {
  id: 'local',
  room: { size: { w: 10, h: 10 }, floor: 'oak', wall: 'cream' },
  objects: [
    { id: 'o1', defId: 'bed', pos: { x: 0, z: 0 }, rotation: 0, state: {} },
    { id: 'o2', defId: 'bookshelf', pos: { x: 4, z: 0 }, rotation: 0, state: {} },
    { id: 'o3', defId: 'desk', pos: { x: 7, z: 0 }, rotation: 0, state: {} },
    { id: 'o4', defId: 'plant', pos: { x: 9, z: 0 }, rotation: 0, state: { needs: { water: 0.6 } } },
    { id: 'o5', defId: 'speaker', pos: { x: 6, z: 0 }, rotation: 0, state: {} },
    { id: 'o6', defId: 'rug', pos: { x: 3, z: 5 }, rotation: 0, state: {} },
    { id: 'o7', defId: 'armchair', pos: { x: 7, z: 6 }, rotation: 270, state: {} },
    { id: 'o8', defId: 'floorLamp', pos: { x: 9, z: 5 }, rotation: 0, state: { light: { on: true } } },
  ],
  character: {
    id: 'c1',
    name: 'Тест',
    appearance: { body: 'female', hair: 'Hair_Long', beard: false, hairColor: '#ffffff' },
    pos: { x: 5, z: 3 },
  },
};

interface WorldStore {
  world: World;
  setAppearance: (patch: Partial<CharacterAppearance>) => void;
  setCharacterPos: (pos: GridPos) => void;
}

export const useWorldStore = create<WorldStore>()(
  immer((set) => ({
    world: initialWorld,
    setAppearance: (patch) =>
      set((s) => {
        Object.assign(s.world.character.appearance, patch);
      }),
    setCharacterPos: (pos) =>
      set((s) => {
        s.world.character.pos = pos;
      }),
  })),
);
