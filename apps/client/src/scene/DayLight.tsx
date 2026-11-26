import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type DirectionalLight, type HemisphereLight } from 'three';
import { useUiStore } from '../store/uiStore';
import { blendLighting, createLighting, hourFor, lightingAt } from './timeOfDay';
import { origin, walker } from '../field/fieldState';
import { heightAt } from '../field/terrain';

/** Насколько быстро свет догоняет новое время суток при переключении (больше — быстрее). */
const TRANSITION_SPEED = 3;

/** Сколько метров вокруг покрывает солнечная тень: в комнате — вся комната, на прогулке — участок вокруг вас. */
const ROOM_SHADOW_EXTENT = 5;
/** Во сколько раз на прогулке больше рассеянного света, чем в комнате. */
const OUTDOOR_AMBIENT = 1.45;
/** Насколько ярче луна на прогулке: ночью свет луны усиливается во столько раз плюс один. */
const OUTDOOR_MOON = 2.2;
const FIELD_SHADOW_EXTENT = 14;

/** Освещение, которое сейчас на экране, с учётом плавного перехода. Отсюда окна берут цвет неба. */
export const liveLighting = createLighting();

/**
 * Свет и фон комнаты по времени суток. В режиме «авто» — по часам пользователя: вечером в комнате
 * темнеет, и главным светом становятся лампы. При переключении режима свет меняется плавно.
 */
export function DayLight() {
  const scene = useThree((s) => s.scene);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const target = useRef(createLighting());
  const started = useRef(false);

  useEffect(() => {
    const background = new Color();
    scene.background = background;
    return () => {
      if (scene.background === background) scene.background = null;
    };
  }, [scene]);

  useFrame((_, delta) => {
    const goal = lightingAt(hourFor(useUiStore.getState().timeMode), target.current);
    // В первый кадр сразу ставим нужный свет, без перехода от дневного.
    const k = started.current ? 1 - Math.exp(-TRANSITION_SPEED * Math.min(delta, 0.1)) : 1;
    started.current = true;

    const live = liveLighting;
    blendLighting(live, goal, k);

    if (scene.background instanceof Color) scene.background.copy(live.background);
    const h = hemi.current;
    if (h) {
      h.color.copy(live.skyColor);
      h.groundColor.copy(live.groundColor);
      // На улице неба больше, чем в комнате со стенами: рассеянного света тоже.
      h.intensity = live.ambient * (useUiStore.getState().place === 'field' ? OUTDOOR_AMBIENT : 1);
    }
    const s = sun.current;
    if (s) {
      s.color.copy(live.sunColor);
      // На прогулке тень следует за вами: солнце «висит» над тем местом, где вы стоите.
      const outside = useUiStore.getState().place === 'field';
      // Ночью в поле нет ламп — светит луна: на улице она заметно ярче, чем сквозь окно комнаты.
      s.intensity = live.sun * (outside ? 1 + (1 - live.daylight) * OUTDOOR_MOON : 1);
      // Свет — в координатах сцены, то есть со сдвигом на плавающий центр мира.
      const ax = outside ? walker.x - origin.x : 0;
      const az = outside ? walker.z - origin.z : 0;
      const ay = outside ? heightAt(walker.x, walker.z) : 0;
      s.position.copy(live.sunPosition).add({ x: ax, y: ay, z: az });
      s.target.position.set(ax, ay, az);
      s.target.updateMatrixWorld();
      const extent = outside ? FIELD_SHADOW_EXTENT : ROOM_SHADOW_EXTENT;
      const cam = s.shadow.camera;
      if (cam.right !== extent) {
        cam.left = -extent;
        cam.right = extent;
        cam.top = extent;
        cam.bottom = -extent;
        cam.updateProjectionMatrix();
      }
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={1}
        shadow-camera-far={25}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}
