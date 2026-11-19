import type { ObjectDef } from '@interna/shared';

/**
 * Временный каталог: предметы рисуются цветными блоками.
 * На неделе 2 у каждого появится `model` с путём к .glb.
 */
export const CATALOG: Record<string, ObjectDef> = {
  bed: {
    id: 'bed',
    name: 'Кровать',
    placeholderColor: '#c9d6ea',
    footprint: { w: 3, h: 4 },
    height: 0.5,
    components: [{ type: 'seat' }, { type: 'bed' }],
  },
  bookshelf: {
    id: 'bookshelf',
    name: 'Книжный шкаф',
    placeholderColor: '#a0785a',
    footprint: { w: 2, h: 1 },
    height: 1.8,
    components: [{ type: 'container', accepts: 'book', capacity: 30 }],
  },
  desk: {
    id: 'desk',
    name: 'Письменный стол',
    placeholderColor: '#b8926a',
    footprint: { w: 2, h: 1 },
    height: 0.75,
    components: [{ type: 'container', accepts: 'note', capacity: 50 }],
  },
  armchair: {
    id: 'armchair',
    name: 'Кресло',
    placeholderColor: '#d98e73',
    footprint: { w: 2, h: 2 },
    height: 0.8,
    components: [{ type: 'seat' }],
  },
  floorLamp: {
    id: 'floorLamp',
    name: 'Торшер',
    placeholderColor: '#f2d16b',
    footprint: { w: 1, h: 1 },
    height: 1.6,
    components: [{ type: 'light' }],
  },
  plant: {
    id: 'plant',
    name: 'Растение',
    placeholderColor: '#7fae7a',
    footprint: { w: 1, h: 1 },
    height: 0.9,
    components: [{ type: 'needs', need: 'water' }],
  },
  speaker: {
    id: 'speaker',
    name: 'Колонка',
    placeholderColor: '#5d6470',
    footprint: { w: 1, h: 1 },
    height: 0.4,
    components: [{ type: 'media', kind: 'audio' }],
  },
  rug: {
    id: 'rug',
    name: 'Ковёр',
    placeholderColor: '#e8c1a0',
    footprint: { w: 4, h: 3 },
    height: 0.02,
    components: [],
  },
};
