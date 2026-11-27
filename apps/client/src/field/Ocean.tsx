import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Color, type Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { windUniforms } from './wind';
import { liveLighting } from '../scene/DayLight';

/** Сторона квадрата воды и шаг сетки: вода «едет» за вами шагами по сетке, чтобы волны не дрожали. */
const SIZE = 260;
const SEGMENTS = 104;
const CELL = SIZE / SEGMENTS;

/**
 * Море: одна большая плоскость на уровне y = 0, которая следует за камерой. Волны — в вершинном шейдере
 * (несколько синусоид, бегущих к берегу, по настоящим координатам с учётом плавающего центра), нормали — по их
 * производным. Вода полупрозрачная: на отмели сквозь неё виден песок, а глубже темнеет само дно (beach.groundColor).
 * Под сушей плоскость спрятана песком; вдали тонет в тумане того же цвета, что и горизонт.
 */
/** Цвет неба у горизонта — его вода и отражает. */
const sky = { value: new Color() };

export function Ocean({ onClick }: { onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const camera = useThree((s) => s.camera);
  const ref = useRef<Mesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).rotateX(-Math.PI / 2), []);
  const material = useMemo(() => {
    // Глубину вода не пишет: пена прибоя рисуется поверх неё, а камни, песок и ноги в воде всё равно перекрывают воду как надо.
    const water = new MeshStandardMaterial({ color: '#1b8aa0', transparent: true, opacity: 0.58, roughness: 0.14, metalness: 0.05, depthWrite: false });
    water.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uOrigin = windUniforms.uOrigin;
      shader.uniforms.uSky = sky;
      // Под острым углом вода отражает небо и становится непрозрачной (эффект Френеля): у ног — прозрачная, вдали — цвета неба.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSky;')
        .replace(
          '#include <opaque_fragment>',
          `float fresnel = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 5.0);
          outgoingLight = mix(outgoingLight, uSky, fresnel * 0.5);
          diffuseColor.a = mix(diffuseColor.a, 1.0, fresnel);
          #include <opaque_fragment>`,
        );
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform vec2 uOrigin;
          // Волна: направление, длина (через частоту), высота, скорость. Сумма трёх — живая, но не хаотичная зыбь.
          vec3 wave(vec2 p, vec2 dir, float freq, float amp, float speed) {
            float phase = dot(normalize(dir), p) * freq + uTime * speed;
            // Высота и её наклоны по x и z — для нормали.
            return vec3(sin(phase) * amp, normalize(dir) * cos(phase) * amp * freq);
          }
          vec3 swell(vec2 p) {
            return wave(p, vec2(-1.0, 0.18), 0.34, 0.075, 1.15)
                 + wave(p, vec2(-1.0, -0.45), 0.83, 0.03, 1.7)
                 + wave(p, vec2(-0.6, 1.0), 1.9, 0.012, 2.3);
          }`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec4 waterWorld = modelMatrix * vec4(position, 1.0);
          vec3 waterWave = swell(waterWorld.xz + uOrigin);
          vec3 objectNormal = normalize(vec3(-waterWave.y, 1.0, -waterWave.z));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif`,
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += waterWave.x;');
    };
    water.customProgramCacheKey = () => 'ocean';
    return water;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    sky.value.copy(liveLighting.skyBottom);
    // Камера — в сдвинутых координатах сцены; вода идёт за ней по сетке.
    ref.current?.position.set(Math.round(camera.position.x / CELL) * CELL, 0, Math.round(camera.position.z / CELL) * CELL);
  });

  return <mesh ref={ref} geometry={geometry} material={material} renderOrder={1} receiveShadow onClick={onClick} />;
}
