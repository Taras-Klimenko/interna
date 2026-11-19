import type { BodyType } from '@interna/shared';

/** Файлы собираются скриптом `pnpm assets:characters` из наборов Quaternius (CC0). */
const BASE = '/models/characters';

export const BODY_URL: Record<BodyType, string> = {
  male: `${BASE}/body-male.glb`,
  female: `${BASE}/body-female.glb`,
};

export const ANIMATION_URLS = [`${BASE}/animations-ual1.glb`, `${BASE}/animations-ual2.glb`];

export const HAIR_OPTIONS = [
  { id: 'Hair_Long', label: 'Длинные' },
  { id: 'Hair_Buns', label: 'Пучки' },
  { id: 'Hair_SimpleParted', label: 'С пробором' },
  { id: 'Hair_Buzzed', label: 'Короткие' },
  { id: 'Hair_BuzzedFemale', label: 'Короткие (жен.)' },
] as const;

export const BEARD_URL = `${BASE}/hair/Hair_Beard.glb`;

export function hairUrl(id: string) {
  return `${BASE}/hair/${id}.glb`;
}

/** Множитель для текстуры волос; белый — исходный цвет текстуры. */
export const HAIR_COLORS = ['#ffffff', '#8a5a3c', '#3a2a22', '#e0b77a', '#b5513a', '#9aa0a8'];

export const ANIMATION_GROUPS: { label: string; clips: string[] }[] = [
  { label: 'Стоя', clips: ['Idle_Loop', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Crouch_Idle_Loop'] },
  { label: 'Движение', clips: ['Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Walk_Carry_Loop'] },
  { label: 'Сидя', clips: ['Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Sitting_Exit'] },
  { label: 'Действия', clips: ['Interact', 'PickUp_Table', 'Chest_Open', 'Farm_Watering', 'Consume', 'Fixing_Kneeling'] },
  { label: 'Эмоции', clips: ['Yes', 'Idle_No_Loop', 'Dance_Loop', 'LayToIdle'] },
];

export const IDLE_CLIP = 'Idle_Loop';
export const WALK_CLIP = 'Walk_Loop';

export function isLoopClip(name: string) {
  return name.endsWith('_Loop');
}
