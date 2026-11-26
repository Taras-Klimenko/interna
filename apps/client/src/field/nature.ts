import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Object3D } from 'three';
import { addWind } from './wind';
import { NATURE } from './terrain';

/** Деревья, кусты, цветы, камни — один файл (Stylized Nature MegaKit, собирает assets/scripts/build-nature.mjs). */
export const NATURE_URL = '/models/nature/nature.glb';

/** Кусок модели, готовый для InstancedMesh: геометрия уже в масштабе модели, материал — общий для всех чанков. */
export interface NaturePart {
  geometry: BufferGeometry;
  material: Material;
  castShadow: boolean;
}

/** Насколько сильно качается на ветру: деревья и камни стоят, кусты чуть, цветы заметно. */
const WIND: Record<string, number> = { bush: 0.05, flower: 0.5, plant: 0.25 };
/** Тень отбрасывает только крупное: от тысяч цветов она дорогая и почти незаметна. */
const SHADOW_KINDS = new Set(['tree', 'bush', 'rock']);

/** Разобранные части — одни на весь файл: их делят все чанки (и общие материалы с ветром тоже). */
const built = new WeakMap<Object3D, Record<string, NaturePart[]>>();

/** Части каждой модели по её имени. Считаются один раз на загруженный файл. */
export function useNatureParts(): Record<string, NaturePart[]> {
  const { scene } = useGLTF(NATURE_URL);
  return useMemo(() => {
    let parts = built.get(scene);
    if (!parts) {
      parts = buildParts(scene);
      built.set(scene, parts);
    }
    return parts;
  }, [scene]);
}

/**
 * Копия геометрии с координатами в обычных числах. В файле вершины сжаты (meshopt квантует их в 16-битные целые
 * от −1 до 1, а настоящий размер задаёт масштаб узла). Если «запечь» масштаб прямо в такие числа, всё больше
 * единицы обрежется — пятиметровое дерево сплющится в кубик.
 */
function dequantize(source: BufferGeometry) {
  const geometry = new BufferGeometry();
  geometry.setIndex(source.getIndex());
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const { count, itemSize } = attribute;
    const values = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) for (let k = 0; k < itemSize; k++) values[i * itemSize + k] = attribute.getComponent(i, k);
    geometry.setAttribute(name, new BufferAttribute(values, itemSize));
  }
  return geometry;
}

function buildParts(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const parts: Record<string, NaturePart[]> = {};
  // Один и тот же материал (например, листья) у разных моделей — один «ветреный» клон на силу ветра.
  const windy = new Map<string, Material>();
  for (const holder of scene.children) {
    // Узлы моделей в файле называются «Model_<имя>» (см. assets/scripts/build-nature.mjs).
    const name = holder.name.replace(/^Model_/, '');
    const kind = NATURE[name]?.kind;
    if (!kind) continue;
    const list: NaturePart[] = [];
    holder.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      // Масштаб и сдвиги внутри модели «запекаем» в геометрию: экземпляру остаётся только место и поворот.
      const geometry = dequantize(object.geometry as BufferGeometry).applyMatrix4(object.matrixWorld);
      geometry.computeBoundingSphere();
      let material = object.material as Material;
      const strength = WIND[kind];
      if (strength) {
        const key = `${material.uuid}:${strength}`;
        let clone = windy.get(key);
        if (!clone) {
          clone = addWind(material.clone(), strength);
          windy.set(key, clone);
        }
        material = clone;
      }
      list.push({ geometry, material, castShadow: SHADOW_KINDS.has(kind) });
    });
    parts[name] = list;
  }
  return parts;
}
