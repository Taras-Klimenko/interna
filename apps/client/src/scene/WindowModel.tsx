import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  CanvasTexture,
  PlaneGeometry,
  SRGBColorSpace,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { CELL_SIZE, type ObjectDef, type Rotation } from '@interna/shared';
import type { Look } from './PlacedObjectMesh';
import { wallItemCenter } from '../editor/placement';
import { liveLighting } from './DayLight';
import { useHideWithWall } from './useHideWithWall';

/** Толщина рамы и насколько она выступает из стены. */
const FRAME = 0.05;
const FRAME_DEPTH = 0.07;
const MULLION = 0.03;
/** Горизонтальная перекладина — чуть выше середины, как у фрамуги. */
const TRANSOM_AT = 0.18;
const SILL_DEPTH = 0.13;
/** Солнечное пятно на полу: длина от стены в комнату и яркость в полдень. */
const PATCH_LENGTH = 1.2;
const PATCH_STRENGTH = 0.32;

/**
 * Окно на стене: рама с перекладинами, подоконник и небо за стеклом, которое меняется
 * со временем суток (ночью — звёзды). Днём из окна на пол падает солнечное пятно.
 * Висит так же, как рамка: в клетках у стены, смотрит в комнату (+z).
 */
export function WindowModel({ def, look, rotation }: { def: ObjectDef; look: Look; rotation: Rotation }) {
  const { group, raycast } = useHideWithWall(rotation, look.ghost);
  const width = def.footprint.w * CELL_SIZE * 0.84;
  const height = def.height;
  const back = -def.footprint.h * CELL_SIZE * 0.5;
  const innerW = width - 2 * FRAME;
  const innerH = height - 2 * FRAME;

  const surface = {
    transparent: look.ghost,
    opacity: look.ghost ? 0.6 : 1,
    depthWrite: !look.ghost,
    emissive: look.tint ?? '#000000',
    emissiveIntensity: look.tint ? look.tintIntensity : 0,
  };

  const bars: { size: [number, number, number]; at: [number, number] }[] = [
    { size: [width, FRAME, FRAME_DEPTH], at: [0, (height - FRAME) / 2] },
    { size: [width, FRAME, FRAME_DEPTH], at: [0, -(height - FRAME) / 2] },
    { size: [FRAME, innerH, FRAME_DEPTH], at: [-(width - FRAME) / 2, 0] },
    { size: [FRAME, innerH, FRAME_DEPTH], at: [(width - FRAME) / 2, 0] },
    { size: [MULLION, innerH, FRAME_DEPTH * 0.6], at: [0, 0] },
    { size: [innerW, MULLION, FRAME_DEPTH * 0.6], at: [0, innerH * TRANSOM_AT] },
  ];

  return (
    <>
      <group ref={group} position={[0, wallItemCenter(def), back]}>
        <Sky width={innerW} height={innerH} raycast={raycast} ghost={look.ghost} />
        {bars.map((bar, i) => (
          <mesh key={i} position={[bar.at[0], bar.at[1], FRAME_DEPTH / 2]} castShadow={!look.ghost} raycast={raycast}>
            <boxGeometry args={bar.size} />
            <meshStandardMaterial color="#f3ece1" roughness={0.6} {...surface} />
          </mesh>
        ))}
        {/* Подоконник */}
        <mesh position={[0, -height / 2 - 0.018, SILL_DEPTH / 2]} castShadow={!look.ghost} receiveShadow raycast={raycast}>
          <boxGeometry args={[width + 0.1, 0.036, SILL_DEPTH]} />
          <meshStandardMaterial color="#e9e0d2" roughness={0.6} {...surface} />
        </mesh>
      </group>
      {!look.ghost && <SunPatch width={innerW} back={back} />}
    </>
  );
}

/** Небо за стеклом: градиент сверху вниз и звёзды, которые проступают в темноте. */
function Sky({ width, height, raycast, ghost }: { width: number; height: number; raycast: Mesh['raycast']; ghost: boolean }) {
  const stars = useRef<MeshBasicMaterial>(null);
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(width, height);
    plane.setAttribute('color', new BufferAttribute(new Float32Array(4 * 3), 3));
    return plane;
  }, [width, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    // У PlaneGeometry вершины идут так: две верхние, затем две нижние.
    const colors = geometry.getAttribute('color') as BufferAttribute;
    const { skyTop, skyBottom, daylight } = liveLighting;
    colors.setXYZ(0, skyTop.r, skyTop.g, skyTop.b);
    colors.setXYZ(1, skyTop.r, skyTop.g, skyTop.b);
    colors.setXYZ(2, skyBottom.r, skyBottom.g, skyBottom.b);
    colors.setXYZ(3, skyBottom.r, skyBottom.g, skyBottom.b);
    colors.needsUpdate = true;
    if (stars.current) stars.current.opacity = Math.max(0, 1 - daylight * 3);
  });

  return (
    <group position={[0, 0, 0.004]}>
      {/* toneMapped={false}: небо светится само, освещение комнаты его не затемняет. */}
      <mesh geometry={geometry} raycast={raycast}>
        <meshBasicMaterial vertexColors toneMapped={false} transparent={ghost} opacity={ghost ? 0.6 : 1} />
      </mesh>
      <mesh position={[0, 0, 0.002]} raycast={() => null}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial ref={stars} map={starTexture()} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Пятно света на полу перед окном, с тенью от перекладин. Светит днём, к ночи гаснет. */
function SunPatch({ width, back }: { width: number; back: number }) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);

  useFrame(() => {
    const { daylight, sunColor } = liveLighting;
    const strength = daylight * PATCH_STRENGTH;
    if (mesh.current) mesh.current.visible = strength > 0.01;
    material.current?.color.copy(sunColor).multiplyScalar(strength);
  });

  return (
    <mesh
      ref={mesh}
      rotation={[-Math.PI / 2, 0, 0]}
      // Чуть выше ковров, чтобы пятно ложилось и на них.
      position={[0, 0.02, back + 0.12 + PATCH_LENGTH / 2]}
      raycast={() => null}
    >
      <planeGeometry args={[width * 1.1, PATCH_LENGTH]} />
      <meshBasicMaterial ref={material} map={patchTexture()} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

let stars: CanvasTexture | null = null;

/** Звёзды: рисуются один раз и одни на все окна. Случайность с зерном — узор всегда тот же. */
function starTexture() {
  if (stars) return stars;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 26; i++) {
    const x = random() * size;
    const y = random() * size * 0.85;
    const r = 0.6 + random() * 1.1;
    ctx.fillStyle = `rgba(255, 250, 235, ${0.45 + random() * 0.55})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  stars = new CanvasTexture(canvas);
  stars.colorSpace = SRGBColorSpace;
  return stars;
}

let patch: CanvasTexture | null = null;

/**
 * Пятно света: четыре «стекла» с промежутками от перекладин, края размыты.
 * Верх текстуры — у стены, дальше от окна свет слабеет.
 */
function patchTexture() {
  if (patch) return patch;
  const w = 64;
  const h = 96;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(255,255,255,1)');
  fade.addColorStop(1, 'rgba(255,255,255,0.35)');
  ctx.fillStyle = fade;
  const m = 8;
  const gap = 3;
  const split = Math.round(h * 0.42);
  for (const [x0, x1] of [
    [m, w / 2 - gap],
    [w / 2 + gap, w - m],
  ]) {
    ctx.fillRect(x0!, m, x1! - x0!, split - gap - m);
    ctx.fillRect(x0!, split + gap, x1! - x0!, h - m - split - gap);
  }
  blurAlpha(ctx, w, h, 3);
  patch = new CanvasTexture(canvas);
  patch.colorSpace = SRGBColorSpace;
  return patch;
}

/** Размытие краёв: несколько проходов box blur. ctx.filter есть не во всех браузерах (Safari). */
function blurAlpha(ctx: CanvasRenderingContext2D, w: number, h: number, passes: number) {
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  let alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3]!;
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            sum += alpha[ny * w + nx]!;
            count++;
          }
        }
        next[y * w + x] = sum / count;
      }
    }
    alpha = next;
  }
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
    data[i * 4 + 3] = alpha[i]!;
  }
  ctx.putImageData(image, 0, 0);
}
