import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { Group } from 'three';
import type { Look } from './PlacedObjectMesh';

const W = 0.32;
const H = 0.86;
const D = 0.3;
const FRONT = D / 2 + 0.002;

/**
 * Напольная колонка из простых фигур: корпус, два динамика и индикатор.
 * Смотрит в +z, как и модели из набора. Когда играет музыка, динамики «качают», а индикатор горит.
 */
export function SpeakerModel({ look, playing }: { look: Look; playing: boolean }) {
  const woofer = useRef<Group>(null);
  const tweeter = useRef<Group>(null);

  useFrame(({ clock }) => {
    // Ритм выдуманный (≈ 120 ударов в минуту): настоящего анализа звука нет, зато работает на всех телефонах.
    const t = clock.elapsedTime;
    const beat = playing ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 6) : 0;
    woofer.current?.scale.setScalar(1 + beat * 0.08);
    tweeter.current?.scale.setScalar(1 + Math.max(0, Math.sin(t * Math.PI * 8)) * (playing ? 0.05 : 0));
  });

  const surface = {
    transparent: look.ghost,
    opacity: look.ghost ? 0.6 : 1,
    depthWrite: !look.ghost,
    emissive: look.tint ?? '#000000',
    emissiveIntensity: look.tint ? look.tintIntensity : 0,
  };

  return (
    <group>
      <RoundedBox args={[W, H, D]} radius={0.025} smoothness={3} position={[0, H / 2, 0]} castShadow={!look.ghost} receiveShadow>
        <meshStandardMaterial color="#4a4542" roughness={0.75} {...surface} />
      </RoundedBox>

      {/* Низкочастотный динамик */}
      <group ref={woofer} position={[0, 0.3, FRONT]}>
        <mesh>
          <circleGeometry args={[0.115, 40]} />
          <meshStandardMaterial color="#8a817a" roughness={0.6} {...surface} />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <circleGeometry args={[0.1, 40]} />
          <meshStandardMaterial color="#26221f" roughness={0.9} {...surface} />
        </mesh>
        <mesh position={[0, 0, 0.004]}>
          <circleGeometry args={[0.035, 24]} />
          <meshStandardMaterial color="#3a3531" roughness={0.5} {...surface} />
        </mesh>
      </group>

      {/* Пищалка */}
      <group ref={tweeter} position={[0, 0.6, FRONT]}>
        <mesh>
          <circleGeometry args={[0.055, 32]} />
          <meshStandardMaterial color="#8a817a" roughness={0.6} {...surface} />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <circleGeometry args={[0.04, 32]} />
          <meshStandardMaterial color="#26221f" roughness={0.9} {...surface} />
        </mesh>
      </group>

      {/* Индикатор: горит, пока играет музыка */}
      <mesh position={[0, 0.77, FRONT]}>
        <circleGeometry args={[0.012, 16]} />
        <meshStandardMaterial
          color={playing ? '#9fe0a6' : '#55504c'}
          emissive={playing ? '#7fd38a' : '#000000'}
          emissiveIntensity={playing ? 1.5 : 0}
          transparent={look.ghost}
          opacity={look.ghost ? 0.6 : 1}
        />
      </mesh>
    </group>
  );
}
