import { CELL_SIZE, type ObjectDef, type Photo, type Rotation } from '@interna/shared';
import type { Look } from './PlacedObjectMesh';
import { wallItemCenter } from '../editor/placement';
import { usePhotoTexture } from './photoTextures';
import { useHideWithWall } from './useHideWithWall';

const BORDER = 0.025;
const MAT = 0.02;
const DEPTH = 0.025;
/** Пустая рамка — вертикальная, как обычное фото с телефона. */
const EMPTY_ASPECT = 0.8;

/**
 * Рамка на стене: деревянный багет, светлое паспарту и фото пользователя.
 * Пропорции подстраиваются под фото, длинная сторона — не больше высоты предмета в каталоге.
 * Стоит в клетке у стены и смотрит в комнату (в +z, как и остальные модели), а когда стену
 * за ней прячут, чтобы заглянуть в комнату, прячется вместе со стеной.
 */
export function PhotoFrame({ def, look, photo, rotation }: { def: ObjectDef; look: Look; photo?: Photo; rotation: Rotation }) {
  const { group, raycast } = useHideWithWall(rotation, look.ghost);
  const texture = usePhotoTexture(photo?.id);

  const aspect = Math.min(Math.max(photo ? photo.width / photo.height : EMPTY_ASPECT, 0.5), 2);
  const inner = def.height - 2 * (BORDER + MAT);
  const photoW = aspect >= 1 ? inner : inner * aspect;
  const photoH = aspect >= 1 ? inner / aspect : inner;
  const outerW = photoW + 2 * (BORDER + MAT);
  const outerH = photoH + 2 * (BORDER + MAT);

  const surface = {
    transparent: look.ghost,
    opacity: look.ghost ? 0.6 : 1,
    depthWrite: !look.ghost,
    emissive: look.tint ?? '#000000',
    emissiveIntensity: look.tint ? look.tintIntensity : 0,
  };

  return (
    <group ref={group} position={[0, wallItemCenter(def), -CELL_SIZE / 2 + DEPTH / 2 + 0.002]}>
      <mesh castShadow={!look.ghost} raycast={raycast}>
        <boxGeometry args={[outerW, outerH, DEPTH]} />
        <meshStandardMaterial color="#6b4a35" roughness={0.7} {...surface} />
      </mesh>
      <mesh position={[0, 0, DEPTH / 2 + 0.001]} raycast={raycast}>
        <planeGeometry args={[photoW + 2 * MAT, photoH + 2 * MAT]} />
        <meshStandardMaterial color="#f4ede2" roughness={0.9} {...surface} />
      </mesh>
      <mesh position={[0, 0, DEPTH / 2 + 0.002]} raycast={raycast}>
        <planeGeometry args={[photoW, photoH]} />
        {/* key: смена картинки меняет набор шейдеров, проще пересоздать материал. */}
        <meshStandardMaterial key={texture?.uuid ?? 'empty'} map={texture} color={texture ? '#ffffff' : '#d8cab6'} roughness={0.55} {...surface} />
      </mesh>
    </group>
  );
}
