import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import {
  Color,
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
import { ANIMATION_URLS, BEARD_URL, BODY_URL, DEFAULT_OUTFIT, DEFAULT_SKIN, hairUrl, isLoopClip } from './assets';

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
  const tint = useMemo(() => addBodyTint(model), [model]);

  // Кожа и одежда — перекраска в шейдере тела (см. addBodyTint).
  useEffect(() => {
    // Color.set переводит hex из sRGB в линейные сами — дополнительно конвертировать не нужно.
    tint.skin.value.set(appearance.skin ?? DEFAULT_SKIN);
    tint.outfit.value.set(appearance.outfit ?? DEFAULT_OUTFIT);
  }, [tint, appearance.skin, appearance.outfit]);
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

/**
 * Средние цвета кожи и одежды в текстуре тела (линейные, посчитаны по текстурам набора). Текстура одна на всё тело:
 * кожа в ней тёплая и насыщенная, а облегающий комплект — серый. Шейдер отличает их по насыщенности
 * и перекрашивает по отдельности: кожу — пропорционально, сохраняя тени и румянец, одежду — по её яркости.
 */
const SKIN_REFERENCE = new Color(0.4, 0.185, 0.085);
const CLOTH_REFERENCE = 0.04;

interface BodyTint {
  skin: { value: Color };
  outfit: { value: Color };
}

/** Добавить перекраску кожи и одежды в материал тела. Возвращает цвета-«ручки» (линейные). */
function addBodyTint(model: Object3D): BodyTint {
  // useMemo в StrictMode вызывается дважды: второй раз отдаём те же «ручки», что уже подключены к шейдеру.
  const existing = model.userData.bodyTint as BodyTint | undefined;
  if (existing) return existing;
  const skin = { value: new Color().set(DEFAULT_SKIN) };
  const outfit = { value: new Color().set(DEFAULT_OUTFIT) };
  model.userData.bodyTint = { skin, outfit } satisfies BodyTint;
  model.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    for (const material of asArray(object.material)) {
      // Тело — материал MI_Superhero_*; глаза и брови не трогаем.
      if (!(material instanceof MeshStandardMaterial) || !material.name.includes('Superhero')) continue;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uSkin = skin;
        shader.uniforms.uOutfit = outfit;
        shader.uniforms.uSkinRef = { value: SKIN_REFERENCE };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uSkin;\nuniform vec3 uOutfit;\nuniform vec3 uSkinRef;')
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            {
              vec3 c = diffuseColor.rgb;
              float saturation = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
              float cloth = 1.0 - smoothstep(0.02, 0.06, saturation);
              vec3 skinColor = c * (uSkin / uSkinRef);
              float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
              vec3 clothColor = uOutfit * clamp(luma / ${CLOTH_REFERENCE.toFixed(3)}, 0.4, 1.6);
              diffuseColor.rgb = mix(skinColor, clothColor, cloth);
            }`,
          );
      };
      material.customProgramCacheKey = () => 'body-tint';
      material.needsUpdate = true;
    }
  });
  return { skin, outfit };
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

