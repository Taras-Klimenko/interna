import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, type DirectionalLight, type HemisphereLight } from 'three';
import { useUiStore } from '../store/uiStore';
import { blendLighting, createLighting, hourFor, lightingAt } from './timeOfDay';

/** Насколько быстро свет догоняет новое время суток при переключении (больше — быстрее). */
const TRANSITION_SPEED = 3;

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
      h.intensity = live.ambient;
    }
    const s = sun.current;
    if (s) {
      s.color.copy(live.sunColor);
      s.intensity = live.sun;
      s.position.copy(live.sunPosition);
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
