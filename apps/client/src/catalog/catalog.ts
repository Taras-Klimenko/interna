import type { ComponentDef, ObjectDef } from '@interna/shared';
import furniture from './furniture.generated.json';

/** Модели мебели собирает `pnpm assets:furniture`: путь, размер в клетках и высота — из этого файла. */
type FurnitureModel = keyof typeof furniture;

interface ItemSpec {
  name: string;
  /** Цвет образца в каталоге и заглушки, пока модель грузится (или если модели нет). */
  color: string;
  components?: ComponentDef[];
}

function fromModel(id: string, model: FurnitureModel, spec: ItemSpec): ObjectDef {
  const m = furniture[model];
  return {
    id,
    name: spec.name,
    model: m.url,
    placeholderColor: spec.color,
    footprint: m.footprint,
    height: m.height,
    components: spec.components ?? [],
  };
}

function placeholder(id: string, spec: ItemSpec & Pick<ObjectDef, 'footprint' | 'height' | 'mount'>): ObjectDef {
  return {
    id,
    name: spec.name,
    placeholderColor: spec.color,
    footprint: spec.footprint,
    height: spec.height,
    mount: spec.mount,
    components: spec.components ?? [],
  };
}

const items: ObjectDef[] = [
  fromModel('bed', 'Bed_Single', { name: 'Кровать', color: '#a85b4a', components: [{ type: 'seat' }, { type: 'bed' }] }),
  fromModel('bedDouble', 'Bed_King', { name: 'Двуспальная кровать', color: '#a85b4a', components: [{ type: 'seat' }, { type: 'bed' }] }),
  fromModel('sofa', 'Couch_Medium2', { name: 'Диван', color: '#7d8a6a', components: [{ type: 'seat' }] }),
  fromModel('armchair', 'Couch_Small2', { name: 'Кресло', color: '#7d8a6a', components: [{ type: 'seat' }] }),
  fromModel('chair', 'Chair_1', { name: 'Стул', color: '#8a6a4a', components: [{ type: 'seat' }] }),
  fromModel('stool', 'Stool', { name: 'Табурет', color: '#8a6a4a', components: [{ type: 'seat' }] }),
  fromModel('table', 'Table_RoundSmall', { name: 'Круглый стол', color: '#8a6a4a' }),
  // Прямоугольного стола в наборе нет — пока заглушка.
  placeholder('desk', {
    name: 'Письменный стол',
    color: '#b8926a',
    footprint: { w: 2, h: 1 },
    height: 0.75,
    components: [{ type: 'container', accepts: 'note', capacity: 50 }],
  }),
  fromModel('bookshelf', 'Bookshelf', { name: 'Книжный шкаф', color: '#8a6a4a', components: [{ type: 'container', accepts: 'book', capacity: 30 }] }),
  fromModel('dresser', 'Drawer_1', { name: 'Комод', color: '#8a6a4a' }),
  fromModel('nightstand', 'NightStand_1', { name: 'Тумбочка', color: '#8a6a4a' }),
  fromModel('fireplace', 'Fireplace', { name: 'Камин', color: '#b9a99a' }),
  fromModel('floorLamp', 'Light_Stand1', { name: 'Торшер', color: '#e8d2a0', components: [{ type: 'light' }] }),
  fromModel('plant', 'Houseplant_8', { name: 'Растение', color: '#6f9a5f', components: [{ type: 'needs', need: 'water' }] }),
  fromModel('plantSmall', 'Houseplant_4', { name: 'Цветок в горшке', color: '#6f9a5f', components: [{ type: 'needs', need: 'water' }] }),
  fromModel('plantBush', 'Houseplant_7', { name: 'Куст', color: '#6f9a5f', components: [{ type: 'needs', need: 'water' }] }),
  // Колонки в наборе нет — она собирается из простых фигур прямо в сцене (scene/SpeakerModel).
  placeholder('speaker', {
    name: 'Колонка',
    color: '#5d6470',
    footprint: { w: 1, h: 1 },
    height: 0.86,
    components: [{ type: 'media', kind: 'audio' }],
  }),
  // Рамка тоже собирается в сцене (scene/PhotoFrame) и подстраивается под пропорции фото.
  placeholder('photoFrame', {
    name: 'Рамка с фото',
    color: '#6b4a35',
    footprint: { w: 1, h: 1 },
    height: 0.46,
    // Низ рамки — над комодом и камином, но выше шкафа её не повесить.
    mount: { kind: 'wall', bottom: 1.15 },
    components: [{ type: 'display', kind: 'image' }],
  }),
  // Окна в наборе рассчитаны на проём в стене, а наши стены сплошные — окно тоже собирается в сцене (scene/WindowModel).
  placeholder('window', {
    name: 'Окно',
    color: '#9cc7e6',
    footprint: { w: 2, h: 1 },
    height: 1.1,
    // Подоконник на уровне спинки дивана: под окном встанут диван, комод, кровать, но не шкаф и не торшер.
    mount: { kind: 'wall', bottom: 0.98 },
    components: [{ type: 'window' }],
  }),
  fromModel('rug', 'Carpet_1', { name: 'Ковёр', color: '#c98a6a' }),
  fromModel('rugRound', 'Carpet_Round', { name: 'Круглый ковёр', color: '#c98a6a' }),
];

/** Все предметы, которые можно поставить в комнату. Порядок — как в панели каталога. */
export const CATALOG: Record<string, ObjectDef> = Object.fromEntries(items.map((item) => [item.id, item]));

/** Полки, на которые ставятся книги. Размеры — в метрах, в системе координат модели (перед смотрит в +z). */
export interface ShelfLayout {
  /** Высоты верхней поверхности полок, в порядке заполнения: сначала на уровне глаз. */
  levels: number[];
  /** Внутренняя ширина полки. */
  width: number;
  /** Где задняя стенка (z), к ней книги прижимаются корешком наружу. */
  backZ: number;
  /** Свободная высота над полкой. */
  clearance: number;
  /** Сколько книг на одну полку, чтобы шкаф не выглядел забитым. */
  perShelf: number;
}

/** Детали моделей, нужные для взаимодействия. Цифры сняты с геометрии собранной модели и годятся только для неё. */
export const MODEL_DETAILS: Record<string, { shelves?: ShelfLayout; shadeMaterial?: string; procedural?: 'speaker' | 'frame' | 'window' }> = {
  bookshelf: {
    shelves: {
      levels: [0.796, 1.055, 0.536, 1.315, 0.276, 1.575, 0.019],
      width: 0.9,
      backZ: -0.14,
      clearance: 0.245,
      perShelf: 12,
    },
  },
  // Плафон торшера светится, когда свет включён.
  floorLamp: { shadeMaterial: 'White' },
  speaker: { procedural: 'speaker' },
  photoFrame: { procedural: 'frame' },
  window: { procedural: 'window' },
};
