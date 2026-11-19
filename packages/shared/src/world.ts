/** Размер одной клетки сетки в метрах. Все модели подгоняются под этот масштаб. */
export const CELL_SIZE = 0.5;

/** Высота стен комнаты в метрах. */
export const WALL_HEIGHT = 2.6;

export type Rotation = 0 | 90 | 180 | 270;

/** Клетка на сетке пола. В 3D «вверх» — это ось y, поэтому пол — плоскость x/z. */
export interface GridPos {
  x: number;
  z: number;
}

export interface GridSize {
  w: number;
  h: number;
}

export type ComponentDef =
  | { type: 'container'; accepts: 'book' | 'note'; capacity: number }
  | { type: 'media'; kind: 'audio' }
  | { type: 'display'; kind: 'image' }
  | { type: 'light' }
  | { type: 'seat' }
  | { type: 'bed' }
  | { type: 'needs'; need: 'water' }
  | { type: 'window' };

/** Описание типа предмета в каталоге (статично, в коде). */
export interface ObjectDef {
  id: string;
  name: string;
  /** Путь к .glb. Пока моделей нет, предмет рисуется заглушкой. */
  model?: string;
  /** Цвет заглушки, пока нет модели. */
  placeholderColor: string;
  footprint: GridSize;
  /** Высота в метрах. */
  height: number;
  components: ComponentDef[];
}

export interface ObjectState {
  light?: { on: boolean };
  needs?: { water: number };
}

/** Предмет, поставленный в комнату. */
export interface PlacedObject {
  id: string;
  defId: string;
  pos: GridPos;
  rotation: Rotation;
  state: ObjectState;
}

export interface RoomConfig {
  /** Размер комнаты в клетках. */
  size: GridSize;
  floor: string;
  wall: string;
}

export type BodyType = 'male' | 'female';

export interface CharacterAppearance {
  body: BodyType;
  /** Имя причёски из набора (например, 'Hair_Long') или null — без волос. */
  hair: string | null;
  beard: boolean;
  /** Цвет, на который умножается текстура волос. '#ffffff' — исходный цвет. */
  hairColor: string;
}

export interface Character {
  id: string;
  name: string;
  appearance: CharacterAppearance;
  /** Последняя клетка, где персонаж стоял. */
  pos: GridPos;
}

export interface World {
  id: string;
  room: RoomConfig;
  objects: PlacedObject[];
  character: Character;
}
