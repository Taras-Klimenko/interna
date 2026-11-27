import { BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, Vector3 } from 'three';
import { random } from './terrain';

/**
 * Пальма из простой геометрии (в наборе природы пальм нет): изогнутый ствол кольцами, веер из листьев-перьев,
 * пара кокосов. Цвета — в вершинах, поэтому весь вариант — одна геометрия и один материал (рисуется экземплярами).
 * Ствол растёт из (0, 0, 0) вверх, клонясь к +x. Варианты отличаются ростом, наклоном и числом листьев.
 */

const TRUNK_DARK = new Color('#6e5338');
const TRUNK_LIGHT = new Color('#9a7a55');
const LEAF_BASE = new Color('#3f7a2c');
const LEAF_TIP = new Color('#8fbf4a');
const COCONUT = new Color('#5a4126');

interface Builder {
  positions: number[];
  colors: number[];
  indices: number[];
}

const vertex = (b: Builder, p: Vector3, c: Color) => {
  b.positions.push(p.x, p.y, p.z);
  b.colors.push(c.r, c.g, c.b);
  return b.positions.length / 3 - 1;
};

/** Точка на изогнутом стволе: t от 0 (земля) до 1 (макушка). */
function trunkPoint(t: number, height: number, lean: number, target: Vector3) {
  // Ствол клонится сильнее к макушке — как у пальм на ветру.
  return target.set(lean * t * t, height * t, 0);
}

function addTrunk(b: Builder, height: number, lean: number) {
  const rings = 14;
  const sides = 7;
  const center = new Vector3();
  const color = new Color();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    trunkPoint(t, height, lean, center);
    const radius = 0.2 * (1 - t * 0.45);
    // Кольца-«чешуя»: каждое второе светлее.
    color.copy(r % 2 ? TRUNK_LIGHT : TRUNK_DARK);
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      vertex(b, new Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius), color);
    }
  }
  const first = b.positions.length / 3 - (rings + 1) * sides;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sides; s++) {
      const a = first + r * sides + s;
      const bIndex = first + r * sides + ((s + 1) % sides);
      b.indices.push(a, a + sides, bIndex, bIndex, a + sides, bIndex + sides);
    }
  }
}

/** Лист-перо: от макушки наружу и вниз, со сгибом по средней жилке. */
function addLeaf(b: Builder, top: Vector3, angle: number, length: number, droop: number, lift: number) {
  const segments = 7;
  const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  const side = new Vector3(-dir.z, 0, dir.x);
  const color = new Color();
  const start = b.positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Сначала вверх-наружу, потом свисает.
    const spine = top
      .clone()
      .addScaledVector(dir, t * length)
      .add(new Vector3(0, lift * t - droop * t * t, 0));
    const width = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.42 * (1 - t * 0.3);
    color.copy(LEAF_BASE).lerp(LEAF_TIP, t);
    // Три вершины поперёк: край, жилка (чуть выше — лист сложен «домиком»), край.
    vertex(b, spine.clone().addScaledVector(side, -width).add(new Vector3(0, -width * 0.35, 0)), color);
    vertex(b, spine, color);
    vertex(b, spine.clone().addScaledVector(side, width).add(new Vector3(0, -width * 0.35, 0)), color);
  }
  for (let i = 0; i < segments; i++) {
    const a = start + i * 3;
    b.indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
}

function addCoconuts(b: Builder, top: Vector3, rnd: () => number) {
  const count = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < count; i++) {
    const angle = rnd() * Math.PI * 2;
    const ball = new IcosahedronGeometry(0.11, 0);
    const offset = new Vector3(Math.cos(angle) * 0.17, -0.15 - rnd() * 0.08, Math.sin(angle) * 0.17).add(top);
    const position = ball.getAttribute('position');
    const index = ball.getIndex();
    const base = b.positions.length / 3;
    for (let v = 0; v < position.count; v++) vertex(b, new Vector3().fromBufferAttribute(position, v).add(offset), COCONUT);
    if (index) for (let k = 0; k < index.count; k++) b.indices.push(base + index.getX(k));
    else for (let k = 0; k < position.count; k++) b.indices.push(base + k);
    ball.dispose();
  }
}

function palmGeometry(variant: number) {
  const rnd = random(4021 + variant * 977);
  const height = 4.6 + variant * 0.9 + rnd() * 0.4;
  const lean = 0.6 + rnd() * 1.1;
  const b: Builder = { positions: [], colors: [], indices: [] };
  addTrunk(b, height, lean);
  const top = trunkPoint(1, height, lean, new Vector3());
  const leaves = 8 + Math.floor(rnd() * 3);
  for (let i = 0; i < leaves; i++) {
    const angle = (i / leaves) * Math.PI * 2 + rnd() * 0.35;
    addLeaf(b, top, angle, 2.1 + rnd() * 0.7, 1.5 + rnd() * 0.7, 0.55 + rnd() * 0.4);
  }
  addCoconuts(b, top, rnd);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(b.positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(b.colors), 3));
  geometry.setIndex(b.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

let built: BufferGeometry[] | null = null;

/** Геометрии вариантов пальм — строятся один раз на всё время. */
export function palmGeometries(count: number) {
  built ??= Array.from({ length: count }, (_, i) => palmGeometry(i));
  return built;
}
