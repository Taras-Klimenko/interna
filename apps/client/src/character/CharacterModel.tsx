import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import {
  LoopOnce,
  LoopRepeat,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  type AnimationAction,
  type Group,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterAppearance } from '@interna/shared';
import { ANIMATION_URLS, BEARD_URL, BODY_URL, hairUrl, isLoopClip } from './assets';

const FADE = 0.25;

interface Props {
  appearance: CharacterAppearance;
  clip: string;
  /** Вызывается, когда разовый клип (не _Loop) доиграл до конца. */
  onClipFinished?: (clip: string) => void;
}

/**
 * Модель персонажа: тело + причёска на общем скелете, анимации из библиотек Quaternius.
 * Все клипы подходят к любому телу, потому что у всех моделей одинаковые имена костей.
 */
export function CharacterModel({ appearance, clip, onClipFinished }: Props) {
  const group = useRef<Group>(null);
  const body = useGLTF(BODY_URL[appearance.body]);
  const animSets = useGLTF(ANIMATION_URLS);
  const clips = useMemo(() => animSets.flatMap((set) => set.animations), [animSets]);

  // Клон, чтобы у каждого персонажа был свой скелет (пригодится, когда персонажей станет несколько).
  const model = useMemo(() => {
    const scene = cloneSkinned(body.scene);
    prepareMeshes(scene);
    return scene;
  }, [body.scene]);

  const skeleton = useMemo(() => findSkeleton(model), [model]);
  const { actions, mixer } = useAnimations(clips, group);

  // Плавный переход между клипами.
  useEffect(() => {
    const action = actions[clip];
    if (!action) {
      console.warn(`[character] unknown clip: ${clip}`);
      return;
    }
    const loop = isLoopClip(clip);
    action.reset();
    action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.fadeIn(FADE).play();
    return () => {
      action.fadeOut(FADE);
    };
  }, [actions, clip]);

  useEffect(() => {
    if (!onClipFinished) return;
    const handler = (e: { action: AnimationAction }) => onClipFinished(e.action.getClip().name);
    mixer.addEventListener('finished', handler);
    return () => mixer.removeEventListener('finished', handler);
  }, [mixer, onClipFinished]);

  return (
    <group ref={group}>
      <primitive object={model} />
      {skeleton && (
        <Suspense fallback={null}>
          {appearance.hair && (
            <Attachment key={appearance.hair} url={hairUrl(appearance.hair)} skeleton={skeleton} color={appearance.hairColor} />
          )}
          {appearance.beard && <Attachment url={BEARD_URL} skeleton={skeleton} color={appearance.hairColor} />}
        </Suspense>
      )}
    </group>
  );
}

interface AttachmentProps {
  url: string;
  skeleton: Skeleton;
  color: string;
}

/** Причёска или борода: отдельный glTF, который «надевается» на скелет тела по именам костей. */
function Attachment({ url, skeleton, color }: AttachmentProps) {
  const gltf = useGLTF(url);

  const meshes = useMemo(() => {
    const scene = cloneSkinned(gltf.scene);
    prepareMeshes(scene);
    const found: SkinnedMesh[] = [];
    scene.traverse((o) => {
      if (o instanceof SkinnedMesh) found.push(o);
    });
    return found;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    // Ищем общего родителя костей тела (узел Armature), чтобы матрица привязки совпала.
    const armature = skeleton.bones[0]?.parent;
    if (!armature) return;
    for (const mesh of meshes) {
      const bones = mesh.skeleton.bones.map((b) => skeleton.getBoneByName(b.name) ?? b);
      mesh.bind(new Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
      armature.add(mesh);
    }
    return () => {
      for (const mesh of meshes) armature.remove(mesh);
    };
  }, [meshes, skeleton]);

  useEffect(() => {
    for (const mesh of meshes) {
      for (const material of asArray(mesh.material)) {
        if (material instanceof MeshStandardMaterial) material.color.set(color);
      }
    }
  }, [meshes, color]);

  return null;
}

function prepareMeshes(root: Object3D) {
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Рамка скиннед-меша считается по позе привязки и при анимации может «отсекать» модель.
      o.frustumCulled = false;
      // Свои материалы у клона, чтобы перекраска не задевала кэш useGLTF.
      o.material = Array.isArray(o.material) ? o.material.map((m: Material) => m.clone()) : o.material.clone();
    }
  });
}

function findSkeleton(root: Object3D): Skeleton | null {
  let skeleton: Skeleton | null = null;
  root.traverse((o) => {
    if (!skeleton && o instanceof SkinnedMesh) skeleton = o.skeleton;
  });
  return skeleton;
}

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

useGLTF.preload(BODY_URL.female);
useGLTF.preload(BODY_URL.male);
useGLTF.preload(ANIMATION_URLS);

