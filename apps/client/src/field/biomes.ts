import { useUiStore, type Biome } from '../store/uiStore';
import * as meadow from './terrain';
import * as beach from './beach';

/**
 * Что прогулке нужно знать о месте: высоту земли, куда можно ступить и откуда начинать.
 * Рисуют места свои чанки (Chunk — поле, BeachChunk — пляж), а ходьба, персонаж рядом и свет — общие.
 */
export interface Terrain {
  heightAt: (x: number, z: number) => number;
  canStandAt: (x: number, z: number, radius: number) => boolean;
  /** Где вы появляетесь и куда смотрите. */
  start: { x: number; z: number; yaw: number };
}

export const TERRAINS: Record<Biome, Terrain> = {
  meadow: { heightAt: meadow.heightAt, canStandAt: meadow.canStandAt, start: { x: 0, z: 2, yaw: 0 } },
  beach: { heightAt: beach.heightAt, canStandAt: beach.canStandAt, start: beach.BEACH_START },
};

/** Земля, по которой вы сейчас гуляете. */
export const terrain = () => TERRAINS[useUiStore.getState().biome];

/** Как места называются в интерфейсе. */
export const BIOME_LABELS: Record<Biome, { icon: string; label: string; title: string }> = {
  meadow: { icon: '🌼', label: 'Поле', title: 'Поле с цветами за домом' },
  beach: { icon: '🏖', label: 'Пляж', title: 'Морской берег с пальмами' },
};
