import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { cellCenter } from '../scene/grid';
import { CharacterModel } from './CharacterModel';
import { IDLE_CLIP, WALK_CLIP } from './assets';

/** Скорость ходьбы в м/с: подобрана под шаг клипа Walk_Loop, чтобы ноги не «скользили». */
const WALK_SPEED = 1.15;
/** Насколько быстро персонаж разворачивается к направлению движения. */
const TURN_RATE = 10;

/**
 * Персонаж в комнате: идёт по маршруту из стора, разворачивается по ходу движения
 * и выбирает анимацию (ходьба, ожидание или клип из тестовой панели).
 */
export function Character() {
  const appearance = useWorldStore((s) => s.world.character.appearance);
  const roomSize = useWorldStore((s) => s.world.room.size);
  const setCharacterPos = useWorldStore((s) => s.setCharacterPos);
  const path = useCharacterStore((s) => s.path);
  const manualClip = useCharacterStore((s) => s.manualClip);
  const arrive = useCharacterStore((s) => s.arrive);
  const playClip = useCharacterStore((s) => s.playClip);
  const setCurrentClip = useCharacterStore((s) => s.setCurrentClip);

  const ref = useRef<Group>(null);
  const waypoints = useRef<{ point: Vector3; cell: { x: number; z: number } }[]>([]);
  const yaw = useRef(0);
  const targetYaw = useRef(0);
  const [moving, setMoving] = useState(false);

  // Стартовая позиция — из сохранённого мира.
  useEffect(() => {
    const start = useWorldStore.getState().world.character.pos;
    const c = cellCenter(start, roomSize);
    ref.current?.position.set(c.x, 0, c.z);
  }, [roomSize]);

  // Новый маршрут.
  useEffect(() => {
    waypoints.current = path.cells.map((cell) => {
      const c = cellCenter(cell, roomSize);
      return { point: new Vector3(c.x, 0, c.z), cell };
    });
    setMoving(waypoints.current.length > 0);
  }, [path, roomSize]);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    const next = waypoints.current[0];

    if (next) {
      const toNext = next.point.clone().sub(group.position);
      const dist = toNext.length();
      const step = WALK_SPEED * delta;
      if (dist > 1e-4) targetYaw.current = Math.atan2(toNext.x, toNext.z);
      if (dist <= step) {
        group.position.copy(next.point);
        waypoints.current.shift();
        setCharacterPos(next.cell);
        if (waypoints.current.length === 0) {
          setMoving(false);
          arrive();
        }
      } else {
        group.position.addScaledVector(toNext, step / dist);
      }
    }

    // Поворот по кратчайшей дуге.
    let diff = targetYaw.current - yaw.current;
    diff = ((((diff + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    yaw.current += diff * (1 - Math.exp(-TURN_RATE * delta));
    group.rotation.y = yaw.current;
  });

  const clip = moving ? WALK_CLIP : (manualClip ?? IDLE_CLIP);

  useEffect(() => {
    setCurrentClip(clip);
  }, [clip, setCurrentClip]);

  // Разовый клип доиграл — возвращаемся к ожиданию.
  const onClipFinished = useCallback(
    (finished: string) => {
      if (useCharacterStore.getState().manualClip === finished) playClip(null);
    },
    [playClip],
  );

  return (
    <group ref={ref}>
      {/* Новое тело — новый скелет, поэтому модель пересоздаётся вместе с микшером анимаций. */}
      <CharacterModel key={appearance.body} appearance={appearance} clip={clip} onClipFinished={onClipFinished} />
    </group>
  );
}
