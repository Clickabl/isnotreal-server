/** Production defaults. No network calls or environment loading at import time. */
export const PRODUCTION_ORIGIN = 'https://isnotreal.click' as const;
export const DEFAULT_CONFIG = {
  publicOrigin: PRODUCTION_ORIGIN,
  apiBaseUrl: `${PRODUCTION_ORIGIN}/api/v1`,
  entityBaseUrl: PRODUCTION_ORIGIN,
  alternativeRedirectBaseUrl: `${PRODUCTION_ORIGIN}/go-to-alt`,
} as const;

export interface ProjectConfig {
  readonly publicOrigin: string;
  readonly apiBaseUrl: string;
  readonly entityBaseUrl: string;
  readonly alternativeRedirectBaseUrl: string;
}
