import { DoubleSide, MeshStandardMaterial, Vector2, type Material, type MeshStandardMaterialParameters } from 'three';

/**
 * Время для ветра: общее для всей травы и цветов, обновляется в FieldScene каждый кадр.
 * uOrigin — текущий центр мира (плавающий центр): ветер считается по настоящим координатам, а не по сдвинутым.
 */
export const windUniforms = { uTime: { value: 0 }, uOrigin: { value: new Vector2() } };

/**
 * Научить материал качаться на ветру прямо в шейдере (на видеокарте, без нагрузки на JS). Только для InstancedMesh:
 * фаза ветра берётся по месту экземпляра — соседние стебли качаются почти в такт, «волнами».
 * Чем выше точка над землёй, тем сильнее её сносит. shadeBase — у земли темнее, к кончикам светлее (для травы).
 * Обе стороны листа освещаются одинаково: иначе у двустороннего листа изнанка «смотрит» в землю и чернеет.
 */
export function addWind<T extends Material>(material: T, strength: number, shadeBase = false): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uOrigin = windUniforms.uOrigin;
    shader.uniforms.uStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uStrength;\nuniform vec2 uOrigin;\nvarying float vHeight;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHeight = position.y;
        vec4 rootWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        rootWorld.xz += uOrigin;
        float sway = sin(uTime * 1.6 + rootWorld.x * 0.35 + rootWorld.z * 0.22) * 0.6
                   + sin(uTime * 2.9 + rootWorld.x * 0.9 - rootWorld.z * 0.5) * 0.25;
        float bend = position.y * position.y * uStrength;
        transformed.x += sway * bend;
        transformed.z += sway * bend * 0.4;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHeight;')
      .replace(
        '#include <color_fragment>',
        shadeBase ? '#include <color_fragment>\n diffuseColor.rgb *= mix(0.7, 1.08, clamp(vHeight, 0.0, 1.0));' : '#include <color_fragment>',
      )
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
  // Свой ключ программы: иначе three.js мог бы взять уже скомпилированный шейдер такого же материала без ветра.
  material.customProgramCacheKey = () => `wind-${strength}-${shadeBase ? 1 : 0}`;
  return material;
}

/** Новый материал с ветром (для травы из своих травинок). */
export function windMaterial(params: MeshStandardMaterialParameters, strength: number, shadeBase = false) {
  return addWind(new MeshStandardMaterial({ side: DoubleSide, roughness: 0.95, ...params }), strength, shadeBase);
}
