import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useUiStore } from '../store/uiStore';
import { useEditorStore } from '../store/editorStore';

const { ACTION } = CameraControlsImpl;

const QUARTER = Math.PI / 2;
/** Камера смотрит на комнату «из угла»: азимут 45° + k·90°. */
const CORNER_OFFSET = Math.PI / 4;
const START = { distance: 15.5, polar: 0.96 };
const TARGET: [number, number, number] = [0, 0.3, 0];
/** На узких экранах (телефон в портретной ориентации) комнату ограничивает ширина: отодвигаем камеру. */
const NARROW_FIT = 13;

function fitDistance(aspect: number) {
  return Math.max(START.distance, NARROW_FIT / aspect);
}

/**
 * Отключает вращение левой кнопкой и одним пальцем, пока в руке предмет.
 * Вызывается и напрямую из обработчика нажатия: React перерисует CameraRig позже,
 * а камера читает эти настройки уже на первом движении мыши.
 */
export function setCameraRotateLock(controls: CameraControlsImpl, locked: boolean) {
  controls.mouseButtons.left = locked ? ACTION.NONE : ACTION.ROTATE;
  controls.touches.one = locked ? ACTION.NONE : ACTION.TOUCH_ROTATE;
}

/**
 * Камера-диорама: вращение мышью вокруг комнаты, Q/E — поворот на 90° к следующему углу,
 * колесо — приближение. Сдвига (pan) нет, камера всегда смотрит в центр комнаты.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const rotateRequest = useUiStore((s) => s.rotateRequest);
  const rotateLocked = useEditorStore((s) => s.draft !== null || s.grab !== null);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const startDistance = useRef(fitDistance(aspect)).current;

  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    const distance = startDistance;
    const { polar } = START;
    const horizontal = distance * Math.sin(polar);
    controls.setLookAt(
      TARGET[0] + horizontal * Math.sin(CORNER_OFFSET),
      TARGET[1] + distance * Math.cos(polar),
      TARGET[2] + horizontal * Math.cos(CORNER_OFFSET),
      ...TARGET,
      false,
    );
  }, [startDistance]);

  useEffect(() => {
    const controls = ref.current;
    if (!controls || rotateRequest.seq === 0) return;
    const nearest = Math.round((controls.azimuthAngle - CORNER_OFFSET) / QUARTER);
    void controls.rotateAzimuthTo((nearest + rotateRequest.dir) * QUARTER + CORNER_OFFSET, true);
  }, [rotateRequest]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={7}
      maxDistance={Math.max(20, startDistance * 1.25)}
      minPolarAngle={0.35}
      maxPolarAngle={1.2}
      smoothTime={0.3}
      draggingSmoothTime={0.12}
      mouseButtons={{ left: rotateLocked ? ACTION.NONE : ACTION.ROTATE, middle: ACTION.DOLLY, right: ACTION.NONE, wheel: ACTION.DOLLY }}
      touches={{ one: rotateLocked ? ACTION.NONE : ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY, three: ACTION.NONE }}
    />
  );
}
