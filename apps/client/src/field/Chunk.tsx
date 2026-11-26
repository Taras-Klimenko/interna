import { Suspense, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { CHUNK_SIZE, chunkSeed, flowerDensity, heightAt, lushness, obstaclesInChunk, random, type Obstacle } from './terrain';
import { windMaterial } from './wind';
import { useNatureParts, type NaturePart } from './nature';

/** Сколько травинок, цветов и прочей мелочи на чанк при разном качестве графики. */
export const DENSITY = {
  // Цветы — модели по 300–1700 треугольников: их немного, но заметные; густоту даёт своя трава.
  high: { grass: 9000, flowers: 90, plants: 40, pebbles: 12 },
  medium: { grass: 3500, flowers: 45, plants: 20, pebbles: 6 },
  low: { grass: 1400, flowers: 20, plants: 10, pebbles: 3 },
} as const;
export type Density = (typeof DENSITY)[keyof typeof DENSITY];

// --- Своя трава: тонкие травинки дешевле и гуще, чем пучки из набора моделей. ---

/** Травинка высотой 1: узкий лист, сужается к кончику. Реальную высоту задаёт масштаб экземпляра. */
function bladeGeometry() {
  const segments = 3;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const half = 0.5 * (1 - t * 0.85);
    positions.push(-half, t, 0, half, t, 0);
    // Нормали «вверх-вперёд»: трава светлая с любой стороны, без тёмных изнанок.
    normals.push(0, 0.8, 0.6, 0, 0.8, 0.6);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(indices);
  return geometry;
}

const BLADE = bladeGeometry();
const GRASS_MATERIAL = windMaterial({ color: '#ffffff' }, 0.18, true);
const GROUND_MATERIAL = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });

const GRASS_DRY = new Color('#b4c063');
const GRASS_LUSH = new Color('#6aa844');
const GROUND_DRY = new Color('#8b9a4c');
const GROUND_LUSH = new Color('#4d7d33');

const SEGMENTS = 24;

/**
 * Земля чанка: сетка с высотами из шума и цветом «сочности» травы. Нормали — по самой функции высоты, без швов
 * между чанками. Координаты вершин — от угла чанка (маленькие числа: видеокарте так точнее), высоты — по мировым.
 */
function groundGeometry(cx: number, cz: number) {
  const geometry = new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2).translate(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  const e = 0.5;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + ox;
    const z = position.getZ(i) + oz;
    position.setY(i, heightAt(x, z));
    const nx = heightAt(x - e, z) - heightAt(x + e, z);
    const nz = heightAt(x, z - e) - heightAt(x, z + e);
    const n = new Vector3(nx, 2 * e, nz).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
    color.copy(GROUND_DRY).lerp(GROUND_LUSH, lushness(x, z));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const matrix = new Matrix4();
const rotation = new Quaternion();
const up = new Vector3(0, 1, 0);
const scale = new Vector3();
const place = new Vector3();

/** Трава чанка: позиции — из зерна чанка, цвет — по «сочности» места. Матрицы — от угла чанка. */
function grassOf(cx: number, cz: number, count: number) {
  const rnd = random(chunkSeed(cx, cz));
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const grass = new InstancedMesh(BLADE, GRASS_MATERIAL, count);
  const color = new Color();
  for (let i = 0; i < count; i++) {
    const lx = rnd() * CHUNK_SIZE;
    const lz = rnd() * CHUNK_SIZE;
    const x = ox + lx;
    const z = oz + lz;
    // Трава по щиколотку, изредка повыше: цветы над ней видны.
    const height = 0.14 + rnd() * rnd() * 0.32;
    rotation.setFromAxisAngle(up, rnd() * Math.PI);
    scale.set(0.06 + rnd() * 0.05, height, 1);
    place.set(lx, heightAt(x, z) - 0.02, lz);
    grass.setMatrixAt(i, matrix.compose(place, rotation, scale));
    color.copy(GRASS_DRY).lerp(GRASS_LUSH, Math.min(1, lushness(x, z) * 0.9 + rnd() * 0.25));
    grass.setColorAt(i, color);
  }
  // Трава тени не отбрасывает и не принимает: на тысячах травинок это слишком дорого и почти незаметно.
  grass.castShadow = false;
  grass.receiveShadow = false;
  grass.raycast = () => undefined;
  grass.computeBoundingSphere();
  return grass;
}

/** Одна копия модели в чанке: где стоит (от угла чанка), поворот, масштаб. */
interface Placement {
  model: string;
  lx: number;
  lz: number;
  y: number;
  rotation: number;
  scale: number;
}

/** Одиночные цветы легче групп — их чаще. */
const FLOWERS = ['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single', 'Flower_4_Single', 'Flower_3_Single', 'Flower_4_Single'];
const PLANTS = ['Fern_1', 'Clover_1', 'Clover_2', 'Plant_1', 'Plant_7', 'Clover_1'];
const PEBBLES = ['Pebble_Round_1', 'Pebble_Round_3', 'Pebble_Square_2'];

/** Мелочь чанка (только рядом с вами): цветы — полянами, растения и камешки — россыпью, грибы — у деревьев. */
function smallThings(cx: number, cz: number, density: Density, obstacles: Obstacle[]): Placement[] {
  const rnd = random(chunkSeed(cx, cz) ^ 0x5bd1e995);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const list: Placement[] = [];
  const add = (model: string, lx: number, lz: number, size: number) =>
    list.push({ model, lx, lz, y: heightAt(ox + lx, oz + lz) - 0.03, rotation: rnd() * Math.PI * 2, scale: size });

  // Цветы: пробуем точки и оставляем попавшие на поляну (чем гуще поляна, тем чаще).
  let flowers = 0;
  for (let attempt = 0; attempt < density.flowers * 5 && flowers < density.flowers; attempt++) {
    const lx = rnd() * CHUNK_SIZE;
    const lz = rnd() * CHUNK_SIZE;
    if (rnd() > flowerDensity(ox + lx, oz + lz)) continue;
    add(FLOWERS[Math.floor(rnd() * FLOWERS.length)]!, lx, lz, 0.6 + rnd() * 0.4);
    flowers++;
  }
  for (let i = 0; i < density.plants; i++) add(PLANTS[Math.floor(rnd() * PLANTS.length)]!, rnd() * CHUNK_SIZE, rnd() * CHUNK_SIZE, 0.7 + rnd() * 0.6);
  for (let i = 0; i < density.pebbles; i++) add(PEBBLES[Math.floor(rnd() * PEBBLES.length)]!, rnd() * CHUNK_SIZE, rnd() * CHUNK_SIZE, 0.6 + rnd() * 0.8);
  // Грибы — в тени деревьев.
  for (const tree of obstacles) {
    if (!tree.model.includes('Tree') && !tree.model.startsWith('Pine')) continue;
    const count = Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const angle = rnd() * Math.PI * 2;
      const distance = 0.6 + rnd() * 1.2;
      add('Mushroom_Common', tree.x - ox + Math.cos(angle) * distance, tree.z - oz + Math.sin(angle) * distance, 0.6 + rnd() * 0.6);
    }
  }
  return list;
}

/** Копии моделей → по одному InstancedMesh на каждую часть модели (ствол, листва…). */
function instancesOf(placements: Placement[], parts: Record<string, NaturePart[]>) {
  const byModel = new Map<string, Placement[]>();
  for (const placement of placements) {
    const list = byModel.get(placement.model) ?? [];
    list.push(placement);
    byModel.set(placement.model, list);
  }
  const meshes: InstancedMesh[] = [];
  for (const [model, list] of byModel) {
    for (const part of parts[model] ?? []) {
      const mesh = new InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((p, i) => {
        rotation.setFromAxisAngle(up, p.rotation);
        scale.setScalar(p.scale);
        place.set(p.lx, p.y, p.lz);
        mesh.setMatrixAt(i, matrix.compose(place, rotation, scale));
      });
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.castShadow;
      mesh.raycast = () => undefined;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    }
  }
  return meshes;
}

/** Деревья, кусты, камни, а рядом с вами — и цветы с мелочью: модели из nature.glb. */
function ChunkNature({ cx, cz, near, density }: { cx: number; cz: number; near: boolean; density: Density }) {
  const parts = useNatureParts();
  const meshes = useMemo(() => {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const obstacles = obstaclesInChunk(cx, cz);
    const big: Placement[] = obstacles.map((o) => ({
      model: o.model,
      lx: o.x - ox,
      lz: o.z - oz,
      y: heightAt(o.x, o.z) - 0.05,
      rotation: o.rotation,
      scale: o.scale,
    }));
    return instancesOf(near ? [...big, ...smallThings(cx, cz, density, obstacles)] : big, parts);
  }, [cx, cz, near, density, parts]);

  // Освобождаем только буферы экземпляров: геометрия и материалы общие для всех чанков.
  useEffect(() => () => meshes.forEach((mesh) => mesh.dispose()), [meshes]);

  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}

/**
 * Один квадрат поля. grass — растут ли тут трава и мелочь (только рядом с вами; вдали — земля, деревья, кусты, камни).
 * Чанк стоит в настоящих координатах, а весь мир вокруг сдвигает на центр общая группа (плавающий центр, FieldScene).
 */
export function Chunk({
  cx,
  cz,
  grass,
  density,
  onGroundClick,
}: {
  cx: number;
  cz: number;
  grass: boolean;
  density: Density;
  onGroundClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const ground = useMemo(() => groundGeometry(cx, cz), [cx, cz]);
  const blades = useMemo(() => (grass ? grassOf(cx, cz, density.grass) : null), [cx, cz, grass, density]);

  // Геометрию земли и буферы травы освобождаем, когда чанк уходит из вида.
  useEffect(() => () => ground.dispose(), [ground]);
  useEffect(() => () => blades?.dispose(), [blades]);

  return (
    <group position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}>
      <mesh geometry={ground} material={GROUND_MATERIAL} receiveShadow onClick={onGroundClick} />
      {blades && <primitive object={blades} />}
      {/* Модели грузятся один раз на всё поле; пока грузятся — уже видны земля и трава. */}
      <Suspense fallback={null}>
        <ChunkNature cx={cx} cz={cz} near={grass} density={density} />
      </Suspense>
    </group>
  );
}
