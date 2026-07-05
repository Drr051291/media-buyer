/** PROJECT.md 6.3: "nº mínimo de conversões" antes de tirar qualquer conclusão. */
export const MIN_CONVERSIONS_FOR_SIGNIFICANCE = 10;

/**
 * Frequência considerada saudável varia por modelo de negócio — remarketing
 * tolera frequência mais alta que broad prospecting (PROJECT.md 6.2/6.3).
 */
const FATIGUE_FREQUENCY_THRESHOLD_BY_MODEL: Record<string, number> = {
  ecommerce: 3,
  local: 3,
  infoproduto: 3,
  leadgen: 4,
  app: 4,
  saas: 4,
};

const DEFAULT_FATIGUE_FREQUENCY_THRESHOLD = 3.5;

export function fatigueThresholdFor(businessModel: string | null | undefined): number {
  if (businessModel && FATIGUE_FREQUENCY_THRESHOLD_BY_MODEL[businessModel] != null) {
    return FATIGUE_FREQUENCY_THRESHOLD_BY_MODEL[businessModel];
  }
  return DEFAULT_FATIGUE_FREQUENCY_THRESHOLD;
}
