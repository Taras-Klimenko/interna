/**
 * Где вы и персонаж на прогулке. Меняется каждый кадр — простые объекты, а не стор.
 * (В комнате для этого есть scene/player.ts; на прогулке своя система координат и свои правила.)
 */
export const walker = {
  x: 0,
  z: 2,
  /** Поворот головы: yaw — влево (+) и вправо, pitch — вверх (+) и вниз. */
  yaw: 0,
  pitch: -0.05,
  /** Куда идти после тапа по земле. */
  target: null as { x: number; z: number } | null,
  /** Идёте ли вы сейчас (персонаж держится рядом, пока вы в движении). */
  moving: false,
};

/**
 * Плавающий центр мира. Логика (где вы, где персонаж, какой чанк) живёт в настоящих координатах —
 * в JavaScript это числа двойной точности, им хватает на любые расстояния. А всё, что рисуется, сдвинуто на origin:
 * видеокарта считает с одинарной точностью, и вдали от нуля картинка начала бы дрожать. Ушли далеко — центр переезжает к вам.
 */
export const origin = { x: 0, z: 0 };
/** Отошли от центра дальше этого (по любой оси) — центр переезжает. */
export const REBASE_DISTANCE = 256;

export const companion = {
  x: 1.2,
  z: 3.2,
  yaw: Math.PI,
};

/** Позвали персонажа посреди прогулки: он появляется в стороне позади вас и догоняет бегом. */
export function callCompanion() {
  const behind = 14;
  companion.x = walker.x + Math.sin(walker.yaw) * behind + Math.cos(walker.yaw) * 3;
  companion.z = walker.z + Math.cos(walker.yaw) * behind - Math.sin(walker.yaw) * 3;
  companion.yaw = walker.yaw;
}

/** Вернуться к началу: у дома, лицом в поле. */
export function resetWalk() {
  origin.x = 0;
  origin.z = 0;
  walker.x = 0;
  walker.z = 2;
  walker.yaw = 0;
  walker.pitch = -0.05;
  walker.target = null;
  companion.x = 1.2;
  companion.z = 3.2;
  companion.yaw = Math.PI;
}
