import type { SqlExecutor } from './index.js';

export interface PublicCauseReason {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly suggestedAction: 'filter' | 'highlight' | 'informational';
  readonly userSelectable: boolean;
  readonly sortOrder: number;
}

export interface PublicCause {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
  readonly sortOrder: number;
  readonly reasons: readonly PublicCauseReason[];
}

interface CauseRow {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly default_enabled: boolean;
  readonly sort_order: number;
  readonly reasons: PublicCauseReason[];
}

export class PostgresCauseCatalogReader {
  constructor(private readonly db: SqlExecutor) {}

  async list(): Promise<readonly PublicCause[]> {
    const result = await this.db.query<CauseRow>(
      `SELECT slug, name, description, default_enabled, sort_order, reasons
       FROM public_cause_catalog
       ORDER BY sort_order, slug`,
    );
    return result.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      defaultEnabled: row.default_enabled,
      sortOrder: row.sort_order,
      reasons: row.reasons,
    }));
  }

  async bySlug(slug: string): Promise<PublicCause | null> {
    const result = await this.db.query<CauseRow>(
      `SELECT slug, name, description, default_enabled, sort_order, reasons
       FROM public_cause_catalog
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
        }
      : null;
  }
}
