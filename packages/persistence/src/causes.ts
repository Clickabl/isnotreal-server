import type { SqlExecutor } from './index.js';

export interface PublicCauseReason {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly suggestedAction: 'filter' | 'highlight' | 'informational';
  readonly userSelectable: boolean;
  readonly sortOrder: number;
}

export interface PublicCauseCoverage {
  readonly state: 'available' | 'unavailable';
  readonly channels: readonly string[];
  readonly generatedAt: string | null;
  readonly expiresAt: string | null;
}

export interface PublicCause {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
  readonly sortOrder: number;
  readonly reasons: readonly PublicCauseReason[];
  readonly coverage: PublicCauseCoverage;
}

interface CauseRow {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly default_enabled: boolean;
  readonly sort_order: number;
  readonly reasons: PublicCauseReason[];
  readonly coverage_available: boolean;
  readonly coverage_channels: string[];
  readonly coverage_generated_at: string | null;
  readonly coverage_expires_at: string | null;
}

export class PostgresCauseCatalogReader {
  constructor(private readonly db: SqlExecutor) {}

  async list(): Promise<readonly PublicCause[]> {
    const result = await this.db.query<CauseRow>(
      `SELECT
         catalog.slug,
         catalog.name,
         catalog.description,
         catalog.default_enabled,
         catalog.sort_order,
         catalog.reasons,
         EXISTS (
           SELECT 1
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           WHERE cause.slug = catalog.slug
             AND publication.state = 'active'
             AND publication.expires_at > now()
         ) AS coverage_available,
         COALESCE((
           SELECT jsonb_agg(DISTINCT artifact.channel ORDER BY artifact.channel)
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           JOIN publication_artifacts artifact ON artifact.publication_id = publication.id
           WHERE cause.slug = catalog.slug
             AND publication.state = 'active'
             AND publication.expires_at > now()
             AND artifact.artifact_kind = 'full'
         ), '[]'::jsonb) AS coverage_channels,
         (
           SELECT max(publication.generated_at)::text
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           WHERE cause.slug = catalog.slug AND publication.state = 'active'
         ) AS coverage_generated_at,
         (
           SELECT max(publication.expires_at)::text
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           WHERE cause.slug = catalog.slug AND publication.state = 'active'
         ) AS coverage_expires_at
       FROM public_cause_catalog catalog
       ORDER BY sort_order, slug`,
    );
    return result.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      defaultEnabled: row.default_enabled,
      sortOrder: row.sort_order,
      reasons: row.reasons,
      coverage: {
        state: row.coverage_available ? 'available' : 'unavailable',
        channels: row.coverage_channels,
        generatedAt: row.coverage_generated_at,
        expiresAt: row.coverage_expires_at,
      },
    }));
  }

  async bySlug(slug: string): Promise<PublicCause | null> {
    const result = await this.db.query<CauseRow>(
      `SELECT
         catalog.slug,
         catalog.name,
         catalog.description,
         catalog.default_enabled,
         catalog.sort_order,
         catalog.reasons,
         EXISTS (
           SELECT 1
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           WHERE cause.slug = catalog.slug
             AND publication.state = 'active'
             AND publication.expires_at > now()
         ) AS coverage_available,
         COALESCE((
           SELECT jsonb_agg(DISTINCT artifact.channel ORDER BY artifact.channel)
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           JOIN publication_artifacts artifact ON artifact.publication_id = publication.id
           WHERE cause.slug = catalog.slug
             AND publication.state = 'active'
             AND publication.expires_at > now()
             AND artifact.artifact_kind = 'full'
         ), '[]'::jsonb) AS coverage_channels,
         (
           SELECT max(publication.generated_at)::text
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           WHERE cause.slug = catalog.slug AND publication.state = 'active'
         ) AS coverage_generated_at,
         (
           SELECT max(publication.expires_at)::text
           FROM publications publication
           JOIN causes cause ON cause.id = publication.cause_id
           WHERE cause.slug = catalog.slug AND publication.state = 'active'
         ) AS coverage_expires_at
       FROM public_cause_catalog catalog
       WHERE slug = $1`,
      [slug],
    );
    const row = result.rows[0];
    return row
      ? {
          slug: row.slug,
          name: row.name,
          description: row.description,
          defaultEnabled: row.default_enabled,
          sortOrder: row.sort_order,
          reasons: row.reasons,
          coverage: {
            state: row.coverage_available ? 'available' : 'unavailable',
            channels: row.coverage_channels,
            generatedAt: row.coverage_generated_at,
            expiresAt: row.coverage_expires_at,
          },
        }
      : null;
  }
}
