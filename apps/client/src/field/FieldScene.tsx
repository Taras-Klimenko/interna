import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { BackSide, Color, Fog, type Mesh, type PerspectiveCamera, ShaderMaterial, SphereGeometry, type Group } from 'three';
import { Chunk, DENSITY } from './Chunk';
import { CHUNK_SIZE, FOG_FAR, FOG_NEAR, GRASS_RADIUS, GROUND_RADIUS, chunkOf } from './terrain';
import { terrain } from './biomes';
import { BeachChunk } from './BeachChunk';
import { Ocean } from './Ocean';
import { REBASE_DISTANCE, companion, origin, walker } from './fieldState';
import { windUniforms } from './wind';
import { liveLighting } from '../scene/DayLight';
import { useQualityTier } from '../store/graphicsStore';
import { useUiStore } from '../store/uiStore';
import { useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { TALK_CLIP } from '../store/chatStore';
import { characterBody, EYE_HEIGHT } from '../scene/player';
import { CharacterModel } from '../character/CharacterModel';
import { IDLE_CLIP, WALK_CLIP } from '../character/assets';

const FOV = 70;
const WALK_SPEED = 1.6;
const RUN_SPEED = 3.2;
const TURN_SPEED = 2.2;
const LOOK_SPEED = 0.005;
const MAX_PITCH = 1.25;
const CLICK_TOLERANCE_PX = 5;
const WALKER_RADIUS = 0.25;
/**
 * Весь мир прогулки (чанки и персонаж) лежит в этой группе в настоящих координатах, а сама группа сдвинута
 * на минус центр мира. Сдвигает её WalkerRig в том же кадре, что и камеру, — без рывков при переезде центра.
 */
const worldGroup: { current: Group | null } = { current: null };

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

/**
 * Прогулка по полю за домом: от первого лица, вокруг — бесконечное поле с травой, цветами и деревьями,
 * рядом идёт персонаж. Время суток и свет — те же, что в комнате.
 */
export function FieldScene() {
  const tier = useQualityTier();
  const density = DENSITY[tier];
  // Персонаж гуляет с вами или остался дома.
  const together = useUiStore((s) => s.walkTogether);
  // Где гуляем: поле или пляж. Ходьба, персонаж и небо общие, а земля у каждого места своя.
  const biome = useUiStore((s) => s.biome);
  const [center, setCenter] = useState(() => chunkOf(walker.x, walker.z));

  // Вы перешли в соседний чанк — пересобираем список чанков вокруг (сами чанки кэширует React по ключу).
  useFrame(() => {
    const now = chunkOf(walker.x, walker.z);
    if (now.cx !== center.cx || now.cz !== center.cz) setCenter(now);
  });

  const chunks = useMemo(() => {
    const list: { key: string; cx: number; cz: number; grass: boolean }[] = [];
    for (let i = -GROUND_RADIUS; i <= GROUND_RADIUS; i++) {
      for (let j = -GROUND_RADIUS; j <= GROUND_RADIUS; j++) {
        const grass = Math.abs(i) <= GRASS_RADIUS && Math.abs(j) <= GRASS_RADIUS;
        list.push({ key: `${center.cx + i}:${center.cz + j}:${grass ? 'g' : ''}`, cx: center.cx + i, cz: center.cz + j, grass });
      }
    }
    return list;
  }, [center]);

  // Тап по земле — идти туда по прямой.
  const onGroundClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_TOLERANCE_PX) return;
    e.stopPropagation();
    // Точка клика — в сдвинутых координатах сцены; цель храним в настоящих.
    walker.target = { x: e.point.x + origin.x, z: e.point.z + origin.z };
  }, []);

  return (
    <>
      <SkyAndFog />
      <WalkerRig />
      {/* Море — вне группы мира: оно само следует за камерой. */}
      {biome === 'beach' && <Ocean onClick={onGroundClick} />}
      <group
        ref={(group) => {
          worldGroup.current = group;
        }}
        position={[-origin.x, 0, -origin.z]}
      >
        {chunks.map((chunk) =>
          biome === 'beach' ? (
            <BeachChunk key={`beach:${chunk.key}`} cx={chunk.cx} cz={chunk.cz} near={chunk.grass} density={density} onGroundClick={onGroundClick} />
          ) : (
            <Chunk key={chunk.key} cx={chunk.cx} cz={chunk.cz} grass={chunk.grass} density={density} onGroundClick={onGroundClick} />
          ),
        )}
        {together && (
          <Suspense fallback={null}>
            <Companion />
          </Suspense>
        )}
      </group>
    </>
  );
}

const SKY_RADIUS = 120;

/** Небо-купол с переходом от горизонта к зениту и туман того же цвета: края мира не видно. */
function SkyAndFog() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const dome = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new Color() }, bottom: { value: new Color() }, night: { value: 0 } },
        vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        // Небо: от горизонта к зениту. Ночью проступают звёзды — редкие точки в случайных «ячейках» неба.
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float night; varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main() {
            vec3 sky = mix(bottom, top, smoothstep(-0.05, 0.6, vDir.y));
            vec3 cell = floor(vDir * 260.0);
            float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.3, vDir.y);
            float twinkle = 0.6 + 0.4 * hash(cell + 7.0);
            gl_FragColor = vec4(sky + vec3(star * twinkle * night), 1.0);
          }`,
      }),
    [],
  );
  const geometry = useMemo(() => new SphereGeometry(SKY_RADIUS, 24, 16), []);

  useEffect(() => {
    const fog = new Fog(new Color(), FOG_NEAR, FOG_FAR);
    const previousFog = scene.fog;
    scene.fog = fog;
    return () => {
      scene.fog = previousFog;
    };
  }, [scene]);

  useFrame(() => {
    material.uniforms.top!.value.copy(liveLighting.skyTop);
    material.uniforms.bottom!.value.copy(liveLighting.skyBottom);
    material.uniforms.night!.value = 1 - liveLighting.daylight;
    if (scene.fog instanceof Fog) scene.fog.color.copy(liveLighting.skyBottom);
    dome.current?.position.copy(camera.position);
  });

  return <mesh ref={dome} geometry={geometry} material={material} renderOrder={-1} raycast={() => undefined} />;
}

/** Вы на прогулке: WASD и стрелки, перетаскивание — смотреть, тап по земле — идти туда. */
function WalkerRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const keys = useRef(new Set<string>());

  useEffect(() => {
    const saved = { fov: camera.fov, near: camera.near, far: camera.far };
    camera.fov = FOV;
    camera.near = 0.05;
    camera.far = SKY_RADIUS * 1.5;
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = saved.fov;
      camera.near = saved.near;
      camera.far = saved.far;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    let drag: { id: number; x: number; y: number; touch: boolean } | null = null;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || !MOVE_KEYS.has(e.code)) return;
      keys.current.add(e.code);
      walker.target = null;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear();
    const onDown = (e: PointerEvent) => {
      if (!drag) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const sign = drag.touch ? 1 : -1;
      walker.yaw += sign * (e.clientX - drag.x) * LOOK_SPEED;
      walker.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, walker.pitch + sign * (e.clientY - drag.y) * LOOK_SPEED));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      canvas.style.touchAction = previousTouchAction;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  const bob = useRef(0);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    windUniforms.uTime.value = clock.elapsedTime;
    const k = keys.current;
    const pressed = (...codes: string[]) => codes.some((c) => k.has(c));
    const forward = (pressed('KeyW', 'ArrowUp') ? 1 : 0) - (pressed('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0);
    walker.yaw += ((pressed('ArrowLeft') ? 1 : 0) - (pressed('ArrowRight') ? 1 : 0)) * TURN_SPEED * delta;

    let dx = 0;
    let dz = 0;
    if (forward || strafe) {
      const sin = Math.sin(walker.yaw);
      const cos = Math.cos(walker.yaw);
      dx = -sin * forward + cos * strafe;
      dz = -cos * forward - sin * strafe;
      const len = Math.hypot(dx, dz);
      const speed = (pressed('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED) * delta;
      dx = (dx / len) * speed;
      dz = (dz / len) * speed;
    } else if (walker.target) {
      const tx = walker.target.x - walker.x;
      const tz = walker.target.z - walker.z;
      const dist = Math.hypot(tx, tz);
      const step = WALK_SPEED * delta;
      if (dist <= step + 0.05) walker.target = null;
      if (dist > 1e-4) {
        dx = (tx / dist) * Math.min(step, dist);
        dz = (tz / dist) * Math.min(step, dist);
      }
    }

    let moved = false;
    if (dx || dz) {
      // По осям отдельно: упёрлись в дерево — скользим вдоль него.
      if (dx && terrain().canStandAt(walker.x + dx, walker.z, WALKER_RADIUS)) {
        walker.x += dx;
        moved = true;
      }
      if (dz && terrain().canStandAt(walker.x, walker.z + dz, WALKER_RADIUS)) {
        walker.z += dz;
        moved = true;
      }
      if (!moved) walker.target = null;
    }
    walker.moving = moved;
    // Лёгкое покачивание головы при ходьбе.
    bob.current = moved ? bob.current + delta * 9 : bob.current * 0.9;
    // Ушли далеко от центра мира — центр переезжает к вам (на границу чанка, чтобы числа оставались ровными).
    if (Math.abs(walker.x - origin.x) > REBASE_DISTANCE || Math.abs(walker.z - origin.z) > REBASE_DISTANCE) {
      origin.x = Math.round(walker.x / CHUNK_SIZE) * CHUNK_SIZE;
      origin.z = Math.round(walker.z / CHUNK_SIZE) * CHUNK_SIZE;
    }
    windUniforms.uOrigin.value.set(origin.x, origin.z);
    worldGroup.current?.position.set(-origin.x, 0, -origin.z);
    const ground = terrain().heightAt(walker.x, walker.z);
    camera.position.set(walker.x - origin.x, ground + EYE_HEIGHT + Math.sin(bob.current) * 0.025, walker.z - origin.z);
    camera.rotation.set(walker.pitch, walker.yaw, 0, 'YXZ');
  });

  return null;
}

/** Где персонаж держится относительно вас: справа и чуть впереди — видно краем глаза. */
const FOLLOW_SIDE = 1.0;
const FOLLOW_BACK = -2.2;
/** Стоит, пока до своего места ближе этого: обернулись — не бегает вокруг вас. Дальше — идёт следом. */
const START_FOLLOW = 2.2;
const ARRIVED = 0.35;
/** Дальше этого — догоняет бегом. */
const CATCH_UP = 5;
const COMPANION_WALK = 1.25;
const COMPANION_RUN = 3.4;
const JOG_CLIP = 'Jog_Fwd_Loop';
/** Отклонения от прямого пути при обходе дерева (рад): прямо, чуть вбок, сильнее вбок. */
/** Ближе этого к вам персонаж не подходит. */
const KEEP_APART = 0.8;
const AVOID_TURNS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8];

/** Персонаж на прогулке: идёт рядом, отстал — догоняет, остановились — поворачивается к вам. */
function Companion() {
  const appearance = useWorldStore((s) => s.world.character.appearance);
  const manualClip = useCharacterStore((s) => s.manualClip);
  const ref = useRef<Group>(null);
  const [clip, setClip] = useState(IDLE_CLIP);
  const yaw = useRef(companion.yaw);
  const following = useRef(false);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const group = ref.current;
    if (!group) return;
    // Точка «рядом с вами»: сбоку и чуть позади, в ту сторону, куда вы смотрите.
    const sin = Math.sin(walker.yaw);
    const cos = Math.cos(walker.yaw);
    const goalX = walker.x + cos * FOLLOW_SIDE + sin * FOLLOW_BACK;
    const goalZ = walker.z - sin * FOLLOW_SIDE + cos * FOLLOW_BACK;
    const tx = goalX - companion.x;
    const tz = goalZ - companion.z;
    const dist = Math.hypot(tx, tz);

    // Пока вы идёте — держится своего места; остановились — стоит, пока не отстанет заметно.
    if (dist > START_FOLLOW || (walker.moving && dist > ARRIVED)) following.current = true;
    else if (dist < ARRIVED) following.current = false;

    let next = IDLE_CLIP;
    if (following.current) {
      // Идёт быстрее вас, чтобы обогнать и встать на своё место; отстала совсем — бежит.
      const speed = dist > CATCH_UP ? COMPANION_RUN : Math.min(COMPANION_RUN, COMPANION_WALK * 0.5 + dist * 2.2);
      const step = Math.min(dist, speed * delta);
      // Дерево на пути — пробуем шагнуть под углом, всё сильнее отклоняясь, пока не найдётся свободное направление.
      const heading = Math.atan2(tx, tz);
      for (const turn of AVOID_TURNS) {
        const angle = heading + turn;
        const nx = companion.x + Math.sin(angle) * step;
        const nz = companion.z + Math.cos(angle) * step;
        // Не встаёт вплотную к вам (например, когда место рядом с вами — на глубине, куда не зайти).
        const apart = Math.hypot(nx - walker.x, nz - walker.z);
        if (!terrain().canStandAt(nx, nz, 0.22) || (apart < KEEP_APART && apart < Math.hypot(companion.x - walker.x, companion.z - walker.z))) continue;
        companion.x = nx;
        companion.z = nz;
        yaw.current = angle;
        break;
      }
      next = dist > CATCH_UP ? JOG_CLIP : WALK_CLIP;
    } else {
      // Стоим — смотрим на вас.
      yaw.current = Math.atan2(walker.x - companion.x, walker.z - companion.z);
      // Персонаж отвечает в разговоре — «говорит» руками, как в комнате.
      if (manualClip === TALK_CLIP) next = TALK_CLIP;
    }
    if (next !== clip) setClip(next);

    let diff = yaw.current - companion.yaw;
    diff = ((((diff + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    companion.yaw += diff * (1 - Math.exp(-8 * delta));
    const y = terrain().heightAt(companion.x, companion.z);
    group.position.set(companion.x, y, companion.z);
    group.rotation.y = companion.yaw;
    // Реплика над головой следует за персонажем и здесь (она рисуется вне группы мира — в сдвинутых координатах).
    characterBody.x = companion.x - origin.x;
    characterBody.z = companion.z - origin.z;
    characterBody.y = y;
  });

  return (
    <group ref={ref}>
      <CharacterModel key={appearance.body} appearance={appearance} clip={clip} />
    </group>
  );
}
