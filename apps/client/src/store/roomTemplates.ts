import type { GridPos, PlacedObject } from '@interna/shared';

/**
 * Готовые комнаты для знакомства: с чего начать обставлять. Дальше всё можно переставить в режиме расстановки.
 * Комната 10×10 клеток; позиция предмета — его левая-верхняя клетка, поворот 0 — «лицом» к +z (в комнату от задней стены).
 * Настенные предметы (рамка, окно) висят над мебелью ниже своей высоты подвеса.
 */
export interface RoomTemplate {
  id: string;
  label: string;
  description: string;
  floor: string;
  wall: string;
  objects: PlacedObject[];
  /** Где персонаж стоит вначале (свободная клетка). */
  character: GridPos;
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 'bedroom',
    label: 'Уютная спальня',
    description: 'Кровать у окна, книжный шкаф, диван с ковром и торшер.',
    floor: 'oak',
    wall: 'cream',
    character: { x: 5, z: 3 },
    objects: [
      // Вдоль задней стены (z = 0): кровать изголовьем к стене, тумбочка, растение, шкаф, колонка, комод.
      { id: 'o1', defId: 'bed', pos: { x: 0, z: 0 }, rotation: 0, state: {} },
      { id: 'o2', defId: 'nightstand', pos: { x: 2, z: 0 }, rotation: 0, state: {} },
      { id: 'o3', defId: 'plant', pos: { x: 3, z: 0 }, rotation: 0, state: { needs: { water: 0.6 } } },
      { id: 'o4', defId: 'bookshelf', pos: { x: 4, z: 0 }, rotation: 0, state: {} },
      { id: 'o5', defId: 'speaker', pos: { x: 6, z: 0 }, rotation: 0, state: {} },
      { id: 'o6', defId: 'dresser', pos: { x: 7, z: 0 }, rotation: 0, state: {} },
      // Гостиная зона: диван у левой стены лицом в комнату, ковёр, кресло напротив, торшер и куст в углу.
      { id: 'o7', defId: 'sofa', pos: { x: 0, z: 5 }, rotation: 270, state: {} },
      { id: 'o8', defId: 'rugRound', pos: { x: 3, z: 5 }, rotation: 0, state: {} },
      { id: 'o9', defId: 'armchair', pos: { x: 7, z: 6 }, rotation: 90, state: {} },
      { id: 'o10', defId: 'floorLamp', pos: { x: 9, z: 5 }, rotation: 0, state: { light: { on: true } } },
      { id: 'o11', defId: 'plantBush', pos: { x: 9, z: 9 }, rotation: 0, state: {} },
      // Пустая рамка над тумбочкой: ждёт ваше фото. Окно над комодом.
      { id: 'o12', defId: 'photoFrame', pos: { x: 2, z: 0 }, rotation: 0, state: {} },
      { id: 'o13', defId: 'window', pos: { x: 7, z: 0 }, rotation: 0, state: {} },
    ],
  },
  {
    id: 'reading',
    label: 'Читальный уголок',
    description: 'Два книжных шкафа, стол у окна, кресло с торшером на ковре.',
    floor: 'walnut',
    wall: 'sage',
    character: { x: 4, z: 3 },
    objects: [
      { id: 'o1', defId: 'bookshelf', pos: { x: 0, z: 0 }, rotation: 0, state: {} },
      { id: 'o2', defId: 'bookshelf', pos: { x: 2, z: 0 }, rotation: 0, state: {} },
      { id: 'o3', defId: 'photoFrame', pos: { x: 4, z: 0 }, rotation: 0, state: {} },
      { id: 'o4', defId: 'desk', pos: { x: 5, z: 0 }, rotation: 0, state: {} },
      { id: 'o5', defId: 'window', pos: { x: 5, z: 0 }, rotation: 0, state: {} },
      { id: 'o6', defId: 'chair', pos: { x: 5, z: 1 }, rotation: 180, state: {} },
      { id: 'o7', defId: 'nightstand', pos: { x: 7, z: 0 }, rotation: 0, state: {} },
      { id: 'o8', defId: 'bed', pos: { x: 8, z: 0 }, rotation: 0, state: {} },
      { id: 'o9', defId: 'rugRound', pos: { x: 2, z: 5 }, rotation: 0, state: {} },
      { id: 'o10', defId: 'armchair', pos: { x: 0, z: 5 }, rotation: 270, state: {} },
      { id: 'o11', defId: 'floorLamp', pos: { x: 0, z: 7 }, rotation: 0, state: { light: { on: true } } },
      { id: 'o12', defId: 'plant', pos: { x: 9, z: 5 }, rotation: 0, state: { needs: { water: 0.7 } } },
      { id: 'o13', defId: 'speaker', pos: { x: 9, z: 9 }, rotation: 0, state: {} },
      { id: 'o14', defId: 'plantSmall', pos: { x: 6, z: 9 }, rotation: 0, state: { needs: { water: 0.8 } } },
    ],
  },
  {
    id: 'studio',
    label: 'Светлая студия',
    description: 'Большая кровать, диван со столиком, колонка и много зелени.',
    floor: 'tile',
    wall: 'stripes',
    character: { x: 6, z: 4 },
    objects: [
      { id: 'o1', defId: 'bedDouble', pos: { x: 0, z: 0 }, rotation: 0, state: {} },
      { id: 'o2', defId: 'nightstand', pos: { x: 3, z: 0 }, rotation: 0, state: {} },
      { id: 'o3', defId: 'window', pos: { x: 4, z: 0 }, rotation: 0, state: {} },
      { id: 'o4', defId: 'dresser', pos: { x: 7, z: 0 }, rotation: 0, state: {} },
      { id: 'o5', defId: 'photoFrame', pos: { x: 8, z: 0 }, rotation: 0, state: {} },
      { id: 'o6', defId: 'sofa', pos: { x: 3, z: 8 }, rotation: 180, state: {} },
      { id: 'o7', defId: 'table', pos: { x: 4, z: 5 }, rotation: 0, state: {} },
      { id: 'o8', defId: 'floorLamp', pos: { x: 8, z: 8 }, rotation: 0, state: { light: { on: true } } },
      { id: 'o9', defId: 'plantBush', pos: { x: 0, z: 9 }, rotation: 0, state: {} },
      { id: 'o10', defId: 'plant', pos: { x: 9, z: 3 }, rotation: 0, state: { needs: { water: 0.6 } } },
      { id: 'o11', defId: 'plantSmall', pos: { x: 6, z: 0 }, rotation: 0, state: { needs: { water: 0.9 } } },
      { id: 'o12', defId: 'speaker', pos: { x: 9, z: 6 }, rotation: 90, state: {} },
      { id: 'o13', defId: 'bookshelf', pos: { x: 0, z: 5 }, rotation: 270, state: {} },
    ],
  },
];

export const DEFAULT_TEMPLATE = ROOM_TEMPLATES[0]!;
