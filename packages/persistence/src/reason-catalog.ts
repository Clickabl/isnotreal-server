import type { SqlExecutor } from './index.js';

export interface PublishReasonCatalogOptions {
  readonly notes: string;
}

export interface PublishReasonCatalogResult {
  readonly version: number;
  readonly entryCount: number;
  readonly publishedAt: string;
}

interface CatalogValidationIssueRow {
  readonly code: string;
  readonly issue: string;
}

interface NextCatalogVersionRow {
  readonly version: number;
}

interface CatalogVersionRow {
  readonly id: string;
  readonly version: number;
}

interface CountRow {
  readonly count: string;
}

interface PublishedCatalogRow {
  readonly version: number;
  readonly published_at: string;
}

export async function publishReasonCatalogVersion(
  db: SqlExecutor,
  options: PublishReasonCatalogOptions,
): Promise<PublishReasonCatalogResult> {
  const notes = options.notes.trim();
  if (notes.length === 0 || notes.length > 10_000) {
    throw new Error('reason catalog notes must contain 1-10000 characters');
  }

  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('isnotreal-reason-catalog-publish'))");

    const issues = await validateWorkingCatalog(tx);
    if (issues.length > 0) {
      throw new Error(
        `reason catalog validation failed: ${issues
          .map((issue) => `${issue.code}:${issue.issue}`)
          .join(', ')}`,
      );
    }

    const next = await tx.query<NextCatalogVersionRow>(
      'SELECT (COALESCE(max(version), 0) + 1)::integer AS version FROM reason_catalog_versions',
    );
    const version = next.rows[0]?.version;
    if (!version) throw new Error('could not allocate reason catalog version');

    const created = await tx.query<CatalogVersionRow>(
      `INSERT INTO reason_catalog_versions (version, state, notes)
       VALUES ($1, 'draft', $2)
       RETURNING id::text, version`,
      [version, notes],
    );
    const catalog = created.rows[0];
    if (!catalog) throw new Error('reason catalog insert did not return a row');

    await tx.query(
      `INSERT INTO reason_catalog_entries (
         catalog_version_id,
         reason_code,
         label,
         description,
         category,
         default_list,
         publication_enabled,
         subject_scope,
         evidence_mode,
         validity_mode,
         public_criteria,
         exclusion_criteria,
         primary_or_authoritative_required,
         minimum_evidence_items,
         reverify_after_days,
         inheritance_policy,
         campaigns,
         authority_sources
       )
       SELECT
         $1,
         rd.code,
         rd.label,
         rd.description,
         rd.category,
         rd.default_list,
         rd.publication_enabled,
         req.subject_scope,
         req.evidence_mode,
         req.validity_mode,
         req.public_criteria,
         req.exclusion_criteria,
         req.primary_or_authoritative_required,
         req.minimum_evidence_items,
         req.reverify_after_days,
         req.inheritance_policy,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'slug', c.slug,
                 'name', c.name,
                 'membershipRole', rcb.membership_role,
                 'assertionActionType', rcb.assertion_action_type
               )
               ORDER BY c.slug
             )
             FROM reason_campaign_bindings rcb
             JOIN campaigns c ON c.id = rcb.campaign_id
             WHERE rcb.reason_code = rd.code
           ),
           '[]'::jsonb
         ),
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'url', sd.canonical_url,
                 'title', sd.title,
                 'publisher', sd.publisher,
                 'role', ras.authority_role
               )
               ORDER BY ras.authority_role, sd.canonical_url
             )
             FROM reason_authority_sources ras
             JOIN source_documents sd ON sd.id = ras.source_document_id
             WHERE ras.reason_code = rd.code
           ),
           '[]'::jsonb
         )
       FROM reason_definitions rd
       JOIN reason_evidence_requirements req ON req.reason_code = rd.code
       WHERE rd.active = true
       ORDER BY rd.code`,
      [catalog.id],
    );

    const countResult = await tx.query<CountRow>(
      'SELECT count(*)::text AS count FROM reason_catalog_entries WHERE catalog_version_id = $1',
      [catalog.id],
    );
    const entryCount = Number(countResult.rows[0]?.count ?? 0);
    if (!Number.isSafeInteger(entryCount) || entryCount <= 0) {
      throw new Error('reason catalog snapshot contains no entries');
    }

    await tx.query(
      `UPDATE reason_catalog_versions
       SET state = 'retired'
       WHERE state = 'active'`,
    );

    const activated = await tx.query<PublishedCatalogRow>(
      `UPDATE reason_catalog_versions
       SET state = 'active', published_at = now()
       WHERE id = $1 AND state = 'draft'
       RETURNING version, published_at::text`,
      [catalog.id],
    );
    const published = activated.rows[0];
    if (!published) throw new Error('reason catalog activation failed');

    return {
      version: published.version,
      entryCount,
      publishedAt: published.published_at,
    };
  });
}

async function validateWorkingCatalog(
  db: SqlExecutor,
): Promise<readonly CatalogValidationIssueRow[]> {
  const result = await db.query<CatalogValidationIssueRow>(
    `SELECT rd.code, 'missing-evidence-requirement'::text AS issue
     FROM reason_definitions rd
     LEFT JOIN reason_evidence_requirements req ON req.reason_code = rd.code
     WHERE rd.active = true AND req.reason_code IS NULL

     UNION ALL

     SELECT rd.code, 'named-campaign-reason-has-no-campaign-binding'::text AS issue
     FROM reason_definitions rd
     JOIN reason_evidence_requirements req ON req.reason_code = rd.code
     WHERE rd.active = true
       AND req.evidence_mode = 'named-campaign-membership'
       AND NOT EXISTS (
         SELECT 1 FROM reason_campaign_bindings binding WHERE binding.reason_code = rd.code
       )

     UNION ALL

     SELECT rd.code, 'official-reason-has-no-authority-source'::text AS issue
     FROM reason_definitions rd
     JOIN reason_evidence_requirements req ON req.reason_code = rd.code
     WHERE rd.active = true
       AND req.evidence_mode IN ('named-campaign-membership', 'authoritative-list')
       AND NOT EXISTS (
         SELECT 1 FROM reason_authority_sources authority WHERE authority.reason_code = rd.code
       )

     ORDER BY code, issue`,
  );
  return result.rows;
}
