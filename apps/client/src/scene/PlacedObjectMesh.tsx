import { Suspense, useEffect, useMemo } from 'react';
import { RoundedBox, useGLTF } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { CameraControlsImpl } from '@react-three/drei';
import { Color, Mesh, MeshStandardMaterial } from 'three';
import { CELL_SIZE, type ObjectDef, type PlacedObject, type GridSize } from '@interna/shared';
import { CATALOG, MODEL_DETAILS } from '../catalog/catalog';
import { useEditorStore } from '../store/editorStore';
import { useInteractionStore } from '../store/interactionStore';
import { hasInteractions } from '../interaction/actions';
import { BooksOnShelf } from './BooksOnShelf';
import { SpeakerModel } from './SpeakerModel';
import { useMusicStore } from '../audio/player';
import { footprintCenter, rotatedFootprint, rotationToRadians, worldToCell } from './grid';
import { setCameraRotateLock } from './CameraRig';

const COLORS = {
  selected: '#c9845f',
  valid: '#6fbf73',
  invalid: '#d9665b',
};

/** Больше стольких пикселей между нажатием и отпусканием — это вращение камеры, а не клик. */
const CLICK_TOLERANCE_PX = 5;

// Модели мебели маленькие (десятки КБ): грузим все сразу, чтобы каталог открывался без задержек.
for (const def of Object.values(CATALOG)) {
  if (def.model) useGLTF.preload(def.model);
}

/** Как подсветить предмет: «призрак» в руке или выбранный в редакторе. */
export interface Look {
  ghost: boolean;
  /** Светится ли плафон (у включённой лампы). */
  glow: boolean;
  /** Цвет подсветки или null — без подсветки. */
  tint: string | null;
  tintIntensity: number;
}

interface Props {
  object: PlacedObject;
  roomSize: GridSize;
  /** normal — обычный предмет, ghost — полупрозрачный предмет «в руке». */
  variant?: 'normal' | 'ghost';
  /** Для ghost: помещается ли он здесь. */
  valid?: boolean;
}

/** Предмет в комнате: glTF-модель из каталога, а пока она грузится (или если модели нет) — блок-заглушка. */
export function PlacedObjectMesh({ object, roomSize, variant = 'normal', valid = true }: Props) {
  const editing = useEditorStore((s) => s.active);
  const selectedInEditor = useEditorStore((s) => s.selectedId === object.id);
  const selectedInRoom = useInteractionStore((s) => s.selectedId === object.id);
  const selected = variant === 'normal' && (editing ? selectedInEditor : selectedInRoom);
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;
  const playing = useMusicStore((s) => s.playing && s.speakerId === object.id && variant === 'normal');

  const def = CATALOG[object.defId];
  if (!def) return null;

  const ghost = variant === 'ghost';
  const occupied = rotatedFootprint(def.footprint, object.rotation);
  const center = footprintCenter(object.pos, occupied, roomSize);

  const isLight = def.components.some((c) => c.type === 'light');
  const lightOn = !ghost && isLight && object.state.light?.on;

  const markerColor = ghost ? (valid ? COLORS.valid : COLORS.invalid) : COLORS.selected;
  const showMarker = ghost || selected;
  const look: Look = {
    ghost,
    glow: !!lightOn,
    tint: ghost || selected ? markerColor : null,
    tintIntensity: ghost ? 0.45 : 0.25,
  };

  // В режиме расстановки нажатие на предмет выбирает его, а сдвиг — начинает перенос (см. EditorController).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!e.nativeEvent.isPrimary) return;
    const editor = useEditorStore.getState();
    if (editor.draft) return;
    e.stopPropagation();
    const cell = worldToCell(e.point.x, e.point.z, roomSize) ?? object.pos;
    editor.select(object.id);
    editor.setGrab({ id: object.id, cell, clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY });
    // Камера иначе начнёт вращаться тем же движением.
    if (controls) setCameraRotateLock(controls, true);
  };

  // В обычном режиме клик по предмету с действиями открывает его карточку.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_TOLERANCE_PX) return;
    e.stopPropagation();
    useInteractionStore.getState().select(object.id);
  };

  const draggable = editing && !ghost;
  const clickable = !editing && !ghost && hasInteractions(def);
  const cursor = draggable ? 'grab' : clickable ? 'pointer' : null;
  const shelves = MODEL_DETAILS[def.id]?.shelves;
  const placeholder = <PlaceholderBox def={def} look={look} />;

  return (
    <group>
      <group
        position={[center.x, 0, center.z]}
        rotation={[0, rotationToRadians(object.rotation), 0]}
        onPointerDown={draggable ? onPointerDown : undefined}
        onClick={clickable ? onClick : undefined}
        onPointerOver={cursor ? () => (document.body.style.cursor = cursor) : undefined}
        onPointerOut={cursor ? () => (document.body.style.cursor = '') : undefined}
      >
        {MODEL_DETAILS[def.id]?.procedural === 'speaker' ? (
          <SpeakerModel look={look} playing={playing} />
        ) : def.model ? (
          <Suspense fallback={placeholder}>
            <FurnitureModel url={def.model} look={look} shadeMaterial={MODEL_DETAILS[def.id]?.shadeMaterial} />
          </Suspense>
        ) : (
          placeholder
        )}

        {shelves && !ghost && object.state.container && <BooksOnShelf books={object.state.container} layout={shelves} />}

        {lightOn && (
          <>
            {/* У заглушки лампы нет — рисуем светящийся шар сверху. У модели плафон уже есть. */}
            {!def.model && (
              <mesh position={[0, def.height + 0.08, 0]}>
                <sphereGeometry args={[0.12, 16, 16]} />
                <meshStandardMaterial color="#fff3c4" emissive="#ffd27a" emissiveIntensity={2} />
              </mesh>
            )}
            <pointLight position={[0, def.height * 0.9, 0]} color="#ffc983" intensity={3} distance={4} decay={2} />
          </>
        )}
      </group>

      {/* Занимаемые клетки на полу: у выбранного предмета и у предмета в руке. */}
      {showMarker && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0.03, center.z]} raycast={() => null} renderOrder={1}>
          <planeGeometry args={[occupied.w * CELL_SIZE, occupied.h * CELL_SIZE]} />
          <meshBasicMaterial color={markerColor} transparent opacity={ghost ? 0.45 : 0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * glTF-модель мебели. Модель уже отцентрована и отмасштабирована скриптом сборки:
 * центр — в центре занятых клеток, низ — на полу. Каждому экземпляру — свои материалы,
 * чтобы подсветка одного предмета не перекрашивала все такие же.
 */
const SHADE_GLOW = '#ffd29a';

function FurnitureModel({ url, look, shadeMaterial }: { url: string; look: Look; shadeMaterial?: string }) {
  const { scene } = useGLTF(url);

  const { root, materials } = useMemo(() => {
    const root = scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    root.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const source = child.material;
      if (source instanceof MeshStandardMaterial) {
        const material = source.clone();
        child.material = material;
        materials.push(material);
      }
    });
    return { root, materials };
  }, [scene]);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useEffect(() => {
    root.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = !look.ghost;
      child.receiveShadow = !look.ghost;
    });
    for (const material of materials) {
      material.transparent = look.ghost;
      material.opacity = look.ghost ? 0.6 : 1;
      material.depthWrite = !look.ghost;
      // Подсветка выбора важнее свечения плафона: иначе не видно, что лампа выбрана.
      const glows = look.glow && !look.tint && material.name === shadeMaterial;
      material.emissive = new Color(look.tint ?? (glows ? SHADE_GLOW : '#000000'));
      material.emissiveIntensity = look.tint ? look.tintIntensity : glows ? 0.9 : 0;
      material.needsUpdate = true;
    }
  }, [root, materials, shadeMaterial, look.ghost, look.glow, look.tint, look.tintIntensity]);

  return <primitive object={root} />;
}

function PlaceholderBox({ def, look }: { def: ObjectDef; look: Look }) {
  // Блок строится по исходному footprint и поворачивается вместе с группой.
  const w = def.footprint.w * CELL_SIZE * 0.92;
  const d = def.footprint.h * CELL_SIZE * 0.92;
  const radius = Math.min(0.05, def.height / 2 - 0.001, w / 2, d / 2);

  return (
    <RoundedBox
      args={[w, def.height, d]}
      radius={Math.max(radius, 0.001)}
      smoothness={3}
      position={[0, def.height / 2, 0]}
      castShadow={!look.ghost}
      receiveShadow={!look.ghost}
    >
      <meshStandardMaterial
        color={def.placeholderColor}
        roughness={0.8}
        transparent={look.ghost}
        opacity={look.ghost ? 0.6 : 1}
        depthWrite={!look.ghost}
        emissive={look.tint ?? '#000000'}
        emissiveIntensity={look.tint ? look.tintIntensity : 0}
      />
    </RoundedBox>
  );
}
