import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { useWorldStore } from '../store/worldStore';
import { useCharacterStore } from '../store/characterStore';
import { useEditorStore } from '../store/editorStore';
import { cellCenter, worldToCell } from '../scene/grid';
import { CHARACTER_RADIUS, PLAYER_RADIUS, characterBody, player } from '../scene/player';
import { buildOccupancy, findPath } from './pathfinding';
import { CharacterModel } from './CharacterModel';
import { IDLE_CLIP, WALK_CLIP } from './assets';
import { ACTIONS, completeTask } from '../interaction/actions';

/** Скорость ходьбы в м/с: подобрана под шаг клипа Walk_Loop, чтобы ноги не «скользили». */
const WALK_SPEED = 1.15;
/** Насколько быстро персонаж разворачивается к направлению движения. */
const TURN_RATE = 10;
/** Вы стоите на пути: столько секунд персонаж ждёт, потом ищет обход. */
const WAIT_BEFORE_DETOUR = 1.2;
/** Ближе этого (м) персонаж поворачивается к вам, а подойдя ещё ближе — кивает. */
const NOTICE_DISTANCE = 3;
const GREET_DISTANCE = 1.7;
/** Снова кивнёт не раньше, чем через столько секунд. */
const GREET_COOLDOWN = 20;

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
  const editing = useEditorStore((s) => s.active);
  const teleportSeq = useWorldStore((s) => s.teleportSeq);

  const ref = useRef<Group>(null);
  const waypoints = useRef<{ point: Vector3; cell: { x: number; z: number } }[]>([]);
  const yaw = useRef(0);
  const targetYaw = useRef(0);
  const [moving, setMoving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const waited = useRef(0);
  const lastGreet = useRef(-Infinity);
  const greeted = useRef(false);

  /** Дошли до предмета: поворачиваемся к нему лицом и начинаем анимацию дела. */
  const beginTask = useCallback(() => {
    const { task } = useCharacterStore.getState();
    const group = ref.current;
    if (!task || task.phase !== 'walking' || !group) return;
    targetYaw.current = Math.atan2(task.face.x - group.position.x, task.face.z - group.position.z);
    useCharacterStore.setState({ task: { ...task, phase: 'acting' }, manualClip: ACTIONS[task.action].clip });
  }, []);

  // Стартовая позиция — из сохранённого мира. Её же берём после сброса комнаты (teleportSeq).
  useEffect(() => {
    const start = useWorldStore.getState().world.character.pos;
    const c = cellCenter(start, roomSize);
    ref.current?.position.set(c.x, 0, c.z);
    waypoints.current = [];
    setMoving(false);
    useCharacterStore.getState().arrive();
  }, [roomSize, teleportSeq]);

  // Начали обставлять комнату: персонаж доходит до ближайшей клетки маршрута и останавливается,
  // чтобы не пройти сквозь только что поставленную мебель. Эта клетка остаётся «занятой» для редактора.
  // Дело при этом отменяется: предмет могут передвинуть или убрать.
  useEffect(() => {
    if (!editing) return;
    const next = waypoints.current[0];
    waypoints.current = next ? [next] : [];
    useCharacterStore.setState({ target: next?.cell ?? null, task: null, manualClip: null });
  }, [editing]);

  // Новый маршрут.
  useEffect(() => {
    waypoints.current = path.cells.map((cell) => {
      const c = cellCenter(cell, roomSize);
      return { point: new Vector3(c.x, 0, c.z), cell };
    });
    setMoving(waypoints.current.length > 0);
    // Уже стоим рядом с предметом — идти никуда не нужно, сразу делаем дело.
    if (waypoints.current.length === 0) beginTask();
  }, [path, roomSize, beginTask]);

  /** Обход вас: тот же конечный пункт, но ваша клетка считается занятой. */
  const detour = (x: number, z: number) => {
    const { world } = useWorldStore.getState();
    const from = worldToCell(x, z, world.room.size);
    const goal = waypoints.current.at(-1)?.cell;
    const blocked = buildOccupancy(world.room.size, world.objects);
    const mine = worldToCell(player.x, player.z, world.room.size);
    if (!from || !goal || !mine) return;
    if (mine.x === goal.x && mine.z === goal.z) return; // вы стоите ровно там, куда он идёт: ждём
    blocked[mine.z]![mine.x] = true;
    const cells = findPath(blocked, from, goal);
    if (!cells) return;
    const start = cellCenter(from, world.room.size);
    waypoints.current = [{ point: new Vector3(start.x, 0, start.z), cell: from }, ...cells.map((cell) => {
      const c = cellCenter(cell, world.room.size);
      return { point: new Vector3(c.x, 0, c.z), cell };
    })];
  };

  useFrame(({ clock }, delta) => {
    const group = ref.current;
    if (!group) return;
    const next = waypoints.current[0];

    if (next) {
      const toNext = next.point.clone().sub(group.position);
      const dist = toNext.length();
      const step = WALK_SPEED * delta;
      if (dist > 1e-4) targetYaw.current = Math.atan2(toNext.x, toNext.z);

      // Вы стоите на пути (режим от первого лица): ждём, а если не уходите — ищем обход.
      const ahead = group.position.clone().addScaledVector(toNext, Math.min(step, dist) / Math.max(dist, 1e-4));
      const blockedByPlayer = player.active && Math.hypot(ahead.x - player.x, ahead.z - player.z) < PLAYER_RADIUS + CHARACTER_RADIUS + 0.05;
      if (blockedByPlayer) {
        waited.current += delta;
        if (!waiting) setWaiting(true);
        if (waited.current > WAIT_BEFORE_DETOUR) {
          waited.current = 0;
          detour(group.position.x, group.position.z);
        }
      } else {
        waited.current = 0;
        if (waiting) setWaiting(false);
      }

      if (blockedByPlayer) {
        // стоим
      } else if (dist <= step) {
        group.position.copy(next.point);
        waypoints.current.shift();
        setCharacterPos(next.cell);
        if (waypoints.current.length === 0) {
          setMoving(false);
          arrive();
          beginTask();
        }
      } else {
        group.position.addScaledVector(toNext, step / dist);
      }
    }

    // Без дела и рядом с вами — поворачивается к вам, а подойдёте ближе — кивает.
    const idle = !waypoints.current[0] && !useCharacterStore.getState().task && !useCharacterStore.getState().manualClip;
    if (player.active) {
      const toPlayer = Math.hypot(player.x - group.position.x, player.z - group.position.z);
      if (idle && toPlayer < NOTICE_DISTANCE) targetYaw.current = Math.atan2(player.x - group.position.x, player.z - group.position.z);
      if (toPlayer > NOTICE_DISTANCE) greeted.current = false;
      const now = clock.elapsedTime;
      if (idle && !greeted.current && toPlayer < GREET_DISTANCE && now - lastGreet.current > GREET_COOLDOWN) {
        greeted.current = true;
        lastGreet.current = now;
        playClip('Yes');
      }
    }
    characterBody.x = group.position.x;
    characterBody.z = group.position.z;

    // Поворот по кратчайшей дуге.
    let diff = targetYaw.current - yaw.current;
    diff = ((((diff + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    yaw.current += diff * (1 - Math.exp(-TURN_RATE * delta));
    group.rotation.y = yaw.current;
  });

  const clip = moving && !waiting ? WALK_CLIP : (manualClip ?? IDLE_CLIP);

  useEffect(() => {
    setCurrentClip(clip);
  }, [clip, setCurrentClip]);

  // Разовый клип доиграл — возвращаемся к ожиданию.
  // Если это была анимация дела — сначала применяем его эффект (свет, полив).
  const onClipFinished = useCallback(
    (finished: string) => {
      const { manualClip, task } = useCharacterStore.getState();
      if (manualClip !== finished) return;
      if (task?.phase === 'acting') completeTask();
      playClip(null);
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
