import { SoftShadows } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useQualityTier } from '../store/graphicsStore';

/** Светится только то, что ярче белого: плафоны включённых ламп, огонёк колонки, солнце в окне. */
const BLOOM = { luminanceThreshold: 1, luminanceSmoothing: 0.2, intensity: 0.7, mipmapBlur: true } as const;
/** Мягкая: углы чуть темнее, но интерфейс поверх них остаётся читаемым. */
const VIGNETTE = { offset: 0.38, darkness: 0.34 } as const;

/**
 * Атмосфера: мягкие тени, затенение в углах и стыках (AO), свечение ламп и окна, лёгкая виньетка.
 * Набор эффектов зависит от уровня качества (store/graphicsStore): на слабых устройствах — без постобработки.
 */
export function Effects() {
  const tier = useQualityTier();
  if (tier === 'low') return null;
  if (tier === 'medium') {
    return (
      <EffectComposer multisampling={0}>
        <Bloom {...BLOOM} />
        <Vignette {...VIGNETTE} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  return (
    <>
      {/* Мягкие края теней (PCSS): у ножек мебели тень чёткая, дальше — размытая, как от настоящего света. */}
      <SoftShadows size={18} samples={10} focus={0.4} />
      <EffectComposer multisampling={4}>
        {/* Затенение там, где предметы почти касаются: под диваном, в углах комнаты. */}
        <N8AO aoRadius={0.45} distanceFalloff={0.6} intensity={2.2} halfRes />
        <Bloom {...BLOOM} />
        <Vignette {...VIGNETTE} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}
