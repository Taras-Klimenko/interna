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

function placeholder(id: string, spec: ItemSpec & Pick<ObjectDef, 'footprint' | 'height'>): ObjectDef {
  return {
    id,
    name: spec.name,
    placeholderColor: spec.color,
    footprint: spec.footprint,
    height: spec.height,
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
  // Колонки в наборе нет — пока заглушка.
  placeholder('speaker', {
    name: 'Колонка',
    color: '#5d6470',
    footprint: { w: 1, h: 1 },
    height: 0.4,
    components: [{ type: 'media', kind: 'audio' }],
  }),
  fromModel('rug', 'Carpet_1', { name: 'Ковёр', color: '#c98a6a' }),
  fromModel('rugRound', 'Carpet_Round', { name: 'Круглый ковёр', color: '#c98a6a' }),
];

/** Все предметы, которые можно поставить в комнату. Порядок — как в панели каталога. */
export const CATALOG: Record<string, ObjectDef> = Object.fromEntries(items.map((item) => [item.id, item]));
