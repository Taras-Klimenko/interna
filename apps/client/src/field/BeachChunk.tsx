import { Suspense, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { CHUNK_SIZE, chunkSeed, random } from './terrain';
import { PALM_VARIANTS, grassiness, groundColor, heightAt, inland, obstaclesInChunk, shoreX } from './beach';
import { BLADE, GRASS_MATERIAL, GROUND_MATERIAL, groundGeometry, instancesOf, type Density, type Placement } from './Chunk';
import { palmGeometries } from './palm';
import { addWind, windUniforms } from './wind';
import { useNatureParts } from './nature';

const rotation = new Quaternion();
const up = new Vector3(0, 1, 0);
const scale = new Vector3();
const place = new Vector3();

/** Пальмы качаются на ветру чуть-чуть: высокие, и сдвиг растёт с квадратом высоты. */
const PALM_MATERIAL = addWind(new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.9 }), 0.0035);

/** Пальмы чанка — по InstancedMesh на вариант. */
function palmsOf(cx: number, cz: number) {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const geometries = palmGeometries(PALM_VARIANTS);
  const byVariant = new Map<number, Matrix4[]>();
  for (const o of obstaclesInChunk(cx, cz)) {
    if (!o.model.startsWith('palm:')) continue;
    const variant = Number(o.model.slice(5));
    rotation.setFromAxisAngle(up, o.rotation);
    scale.setScalar(o.scale);
    place.set(o.x - ox, heightAt(o.x, o.z) - 0.1, o.z - oz);
    const list = byVariant.get(variant) ?? [];
    list.push(new Matrix4().compose(place, rotation, scale));
    byVariant.set(variant, list);
  }
  return [...byVariant].map(([variant, matrices]) => {
    const mesh = new InstancedMesh(geometries[variant]!, PALM_MATERIAL, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.raycast = () => undefined;
    mesh.computeBoundingSphere();
    return mesh;
  });
}

const DUNE_GRASS_DRY = new Color('#c9c07a');
const DUNE_GRASS_GREEN = new Color('#8c9d4e');

/** Жёсткая трава на дюнах — пучками, где grassiness выше. Высокая, по колено. */
function duneGrassOf(cx: number, cz: number, attempts: number) {
  const rnd = random(chunkSeed(cx, cz) ^ 0x2c1b3c6d);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const matrices: Matrix4[] = [];
  const colors: Color[] = [];
  for (let i = 0; i < attempts; i++) {
    const lx = rnd() * CHUNK_SIZE;
    const lz = rnd() * CHUNK_SIZE;
    const x = ox + lx;
    const z = oz + lz;
    if (rnd() > grassiness(x, z)) continue;
    rotation.setFromAxisAngle(up, rnd() * Math.PI);
    scale.set(0.05 + rnd() * 0.04, 0.25 + rnd() * 0.45, 1);
    place.set(lx, heightAt(x, z) - 0.03, lz);
    matrices.push(new Matrix4().compose(place, rotation, scale));
    colors.push(new Color().copy(DUNE_GRASS_DRY).lerp(DUNE_GRASS_GREEN, rnd()));
  }
  if (matrices.length === 0) return null;
  const grass = new InstancedMesh(BLADE, GRASS_MATERIAL, matrices.length);
  matrices.forEach((m, i) => {
    grass.setMatrixAt(i, m);
    grass.setColorAt(i, colors[i]!);
  });
  grass.raycast = () => undefined;
  grass.computeBoundingSphere();
  return grass;
}

/** Ракушка — плоский купол; цвет у каждой свой. */
const SHELL = new SphereGeometry(0.045, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1.25);
const SHELL_MATERIAL = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
const SHELL_COLORS = ['#f4ece0', '#f2d4cc', '#e8c7a4', '#fff6ea', '#d9b8c9'].map((c) => new Color(c));

function shellsOf(cx: number, cz: number, count: number) {
  const rnd = random(chunkSeed(cx, cz) ^ 0x68e31da4);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const matrices: Matrix4[] = [];
  for (let i = 0; i < count * 4 && matrices.length < count; i++) {
    const lx = rnd() * CHUNK_SIZE;
    const lz = rnd() * CHUNK_SIZE;
    const d = inland(ox + lx, oz + lz);
    // Чаще всего — там, куда их выносит волна.
    if (d < 0.3 || d > 12 || rnd() > 1 - d / 14) continue;
    rotation.setFromAxisAngle(up, rnd() * Math.PI * 2);
    scale.setScalar(0.7 + rnd() * 0.8);
    place.set(lx, heightAt(ox + lx, oz + lz) - 0.005, lz);
    matrices.push(new Matrix4().compose(place, rotation, scale));
  }
  if (matrices.length === 0) return null;
  const shells = new InstancedMesh(SHELL, SHELL_MATERIAL, matrices.length);
  matrices.forEach((m, i) => {
    shells.setMatrixAt(i, m);
    shells.setColorAt(i, SHELL_COLORS[Math.floor(rnd() * SHELL_COLORS.length)]!);
  });
  shells.raycast = () => undefined;
  shells.computeBoundingSphere();
  return shells;
}

// --- Пена прибоя ------------------------------------------------------------------------------------------

/** Полоса вдоль кромки воды: от этой глубины в море… */
const FOAM_SEA = 3;
/** …до этого места на песке (метры от кромки). */
const FOAM_LAND = 1.6;
/** Где на полосе (0 — край в море, 1 — край на песке) сама кромка. */
const FOAM_SHORE = FOAM_SEA / (FOAM_SEA + FOAM_LAND);

/**
 * Пена — полупрозрачная белая полоса над водой и мокрым песком. Узор в шейдере: по полосе к берегу бегут
 * две линии прибоя (набегают и тают), а у самой кромки — постоянное кружево. Время общее с ветром.
 */
const FOAM_MATERIAL = (() => {
  // Освещаемая (Lambert): вечером и ночью пена темнеет вместе со всем вокруг, а не светится.
  const material = new MeshLambertMaterial({ color: '#ffffff', transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFoam;\nvarying vec2 vFoam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoam = aFoam;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vFoam;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float u = vFoam.x;
          float z = vFoam.y;
          // Кружево: несколько синусоид вдоль берега, своё на разной высоте полосы — пена рваная, а не ровная лента.
          float lace = 0.5 + 0.5 * sin(z * 2.3 + u * 9.0 + uTime * 0.6) * sin(z * 0.71 - u * 5.0 - uTime * 0.35);
          lace *= 0.6 + 0.4 * sin(z * 5.1 - u * 17.0);
          float foam = 0.0;
          for (int k = 0; k < 2; k++) {
            float phase = fract(uTime * 0.085 + float(k) * 0.5 + sin(z * 0.07) * 0.2);
            // Волна набегает на песок с изгибом — у каждого участка берега свой «язык».
            float line = mix(0.2, 0.86, phase) + sin(z * 0.45 + float(k) * 2.0) * 0.04;
            foam += smoothstep(0.035, 0.0, abs(u - line)) * sin(phase * 3.14159) * 1.4;
          }
          foam += smoothstep(0.07, 0.0, abs(u - ${FOAM_SHORE.toFixed(3)})) * 0.55;
          foam *= smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.86, u);
          diffuseColor.a *= clamp(foam * lace, 0.0, 0.85);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'beach-foam';
  return material;
})();

function foamOf(cx: number, cz: number) {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const rows = CHUNK_SIZE * 2;
  const across = 6;
  const positions: number[] = [];
  const foam: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const z = oz + (r / rows) * CHUNK_SIZE;
    const shore = shoreX(z);
    for (let a = 0; a <= across; a++) {
      const u = a / across;
      const x = shore + FOAM_SEA - u * (FOAM_SEA + FOAM_LAND);
      // Над водой — чуть выше гребней мелкой волны, на песке — прямо над ним.
      positions.push(x - ox, Math.max(heightAt(x, z) + 0.025, 0.07), z - oz);
      foam.push(u, z);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let a = 0; a < across; a++) {
      const i = r * (across + 1) + a;
      // Обход против часовой стрелки, если смотреть сверху: лицевая сторона — вверх.
      indices.push(i, i + 1, i + across + 1, i + 1, i + across + 2, i + across + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aFoam', new BufferAttribute(new Float32Array(foam), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// --- Мелочь из набора природы: камешки у воды, кустики на дюнах ----------------------------------------------

const PEBBLES = ['Pebble_Round_1', 'Pebble_Round_3', 'Pebble_Square_2'];
const DUNE_PLANTS = ['Plant_1'];

function beachThings(cx: number, cz: number, density: Density, near: boolean): Placement[] {
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const list: Placement[] = obstaclesInChunk(cx, cz)
    .filter((o) => !o.model.startsWith('palm:'))
    .map((o) => ({ model: o.model, lx: o.x - ox, lz: o.z - oz, y: heightAt(o.x, o.z) - 0.12, rotation: o.rotation, scale: o.scale }));
  if (!near) return list;
  const rnd = random(chunkSeed(cx, cz) ^ 0x1b873593);
  const add = (model: string, lx: number, lz: number, size: number) =>
    list.push({ model, lx, lz, y: heightAt(ox + lx, oz + lz) - 0.03, rotation: rnd() * Math.PI * 2, scale: size });
  for (let i = 0; i < density.pebbles * 2; i++) {
    const lx = rnd() * CHUNK_SIZE;
    const lz = rnd() * CHUNK_SIZE;
    const d = inland(ox + lx, oz + lz);
    if (d > -1.5 && d < 3) add(PEBBLES[Math.floor(rnd() * PEBBLES.length)]!, lx, lz, 0.5 + rnd() * 0.7);
  }
  for (let i = 0; i < density.plants * 2; i++) {
    const lx = rnd() * CHUNK_SIZE;
    const lz = rnd() * CHUNK_SIZE;
    if (rnd() < grassiness(ox + lx, oz + lz) * 0.6) add(DUNE_PLANTS[Math.floor(rnd() * DUNE_PLANTS.length)]!, lx, lz, 0.8 + rnd() * 0.6);
  }
  return list;
}

function BeachNature({ cx, cz, near, density }: { cx: number; cz: number; near: boolean; density: Density }) {
  const parts = useNatureParts();
  const meshes = useMemo(() => instancesOf(beachThings(cx, cz, density, near), parts), [cx, cz, near, density, parts]);
  useEffect(() => () => meshes.forEach((mesh) => mesh.dispose()), [meshes]);
  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}

/** Один квадрат пляжа: песок и дно, пальмы и камни; рядом с вами — трава на дюнах, ракушки, камешки и пена прибоя. */
export function BeachChunk({
  cx,
  cz,
  near,
  density,
  onGroundClick,
}: {
  cx: number;
  cz: number;
  near: boolean;
  density: Density;
  onGroundClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  // Сетка песка мельче, чем в поле: кромка воды проходит по ней, и на крупной сетке она зубчатая.
  const ground = useMemo(() => groundGeometry(cx, cz, heightAt, groundColor, 48), [cx, cz]);
  const palms = useMemo(() => palmsOf(cx, cz), [cx, cz]);
  const grass = useMemo(() => (near ? duneGrassOf(cx, cz, Math.round(density.grass * 0.35)) : null), [cx, cz, near, density]);
  const shells = useMemo(() => (near ? shellsOf(cx, cz, density.flowers) : null), [cx, cz, near, density]);
  // Пена видна издалека. Полосу ряда чанков строит один чанк — тот, через который кромка проходит посередине ряда.
  const foam = useMemo(() => (Math.floor(shoreX(cz * CHUNK_SIZE + CHUNK_SIZE / 2) / CHUNK_SIZE) === cx ? foamOf(cx, cz) : null), [cx, cz]);

  useEffect(() => () => ground.dispose(), [ground]);
  useEffect(() => () => palms.forEach((mesh) => mesh.dispose()), [palms]);
  useEffect(() => () => grass?.dispose(), [grass]);
  useEffect(() => () => shells?.dispose(), [shells]);
  useEffect(() => () => foam?.dispose(), [foam]);

  return (
    <group position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}>
      <mesh geometry={ground} material={GROUND_MATERIAL} receiveShadow onClick={onGroundClick} />
      {palms.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      {grass && <primitive object={grass} />}
      {shells && <primitive object={shells} />}
      {foam && <mesh geometry={foam} material={FOAM_MATERIAL} renderOrder={2} raycast={() => undefined} />}
      <Suspense fallback={null}>
        <BeachNature cx={cx} cz={cz} near={near} density={density} />
      </Suspense>
    </group>
  );
}
