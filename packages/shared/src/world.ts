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
  /**
   * Предмет висит на стене (рамка): стоит в клетке у стены и смотрит в комнату.
   * Не мешает ходить, а под ним можно поставить мебель ниже `bottom` метров.
   */
  mount?: { kind: 'wall'; bottom: number };
  components: ComponentDef[];
}

/** Книга пользователя на полке. */
export interface Book {
  id: string;
  kind: 'book';
  title: string;
  author: string;
  /** Заметка: чем понравилась, о чём, где остановился. */
  note: string;
  /** ISO-время, когда книгу поставили на полку. */
  addedAt: string;
  /** Книга загружена из файла: её можно читать. Сам файл лежит в хранилище браузера под id книги. */
  file?: BookFile;
  /** Цвет корешка (с обложки). Без него цвет выбирается по id. */
  color?: string;
  /** Где остановились в читалке. */
  progress?: ReadingProgress;
}

export interface BookFile {
  format: 'fb2' | 'epub';
  fileName: string;
  /** Размер файла в байтах. */
  size: number;
  /** Есть ли обложка (лежит в хранилище браузера под id книги). */
  hasCover: boolean;
}

export interface ReadingProgress {
  /** Номер главы, с нуля. */
  chapter: number;
  /** Насколько прокручена глава: 0 — начало, 1 — конец. */
  offset: number;
  /** Сколько прочитано от всей книги, 0–1. */
  percent: number;
  /** ISO-время, когда читали в последний раз. */
  updatedAt: string;
}

/** То, что может лежать в предмете-контейнере. Позже добавятся заметки. */
export type ContainerItem = Book;

/** Трек пользователя. Сам файл лежит в хранилище браузера (IndexedDB) под тем же id. */
export interface Track {
  id: string;
  kind: 'track';
  title: string;
  fileName: string;
  /** Размер файла в байтах. */
  size: number;
  addedAt: string;
}

/** Фото пользователя в рамке. Сама картинка лежит в хранилище браузера (IndexedDB) под тем же id. */
export interface Photo {
  id: string;
  kind: 'photo';
  /** Размер картинки в пикселях: по нему рамка подстраивает пропорции. */
  width: number;
  height: number;
  /** Что на фото — своими словами. Позже это будет знать персонаж. */
  caption: string;
  addedAt: string;
}

export interface ObjectState {
  light?: { on: boolean };
  /** 0 — совсем сухо, 1 — только что полили. */
  needs?: { water: number };
  container?: ContainerItem[];
  /** Плейлист колонки. Играет ли она сейчас — состояние плеера, оно не сохраняется. */
  media?: { playlist: Track[]; current?: string };
  /** Что висит в рамке. */
  display?: { photo?: Photo };
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
