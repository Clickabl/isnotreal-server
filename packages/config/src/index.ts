/** Production defaults. No network calls or environment loading at import time. */
export const PRODUCTION_ORIGIN = 'https://isnotreal.click' as const;
export const DEFAULT_CONFIG = {
  publicOrigin: PRODUCTION_ORIGIN,
  apiBaseUrl: `${PRODUCTION_ORIGIN}/api/v1`,
  whyBaseUrl: `${PRODUCTION_ORIGIN}/why`,
} as const;
export interface ProjectConfig {
  readonly publicOrigin: string;
  readonly apiBaseUrl: string;
  readonly whyBaseUrl: string;
}
