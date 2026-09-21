import type { SqlExecutor } from './index.js';

export type OfficialImportKind = 'signatory-list' | 'participant-list' | 'target-list' | 'other';
export type CampaignImportKind = OfficialImportKind;

export interface OfficialImportRowInput {
  readonly rawName: string;
  readonly rawPayload?: Readonly<Record<string, unknown>>;
}

export type CampaignImportRowInput = OfficialImportRowInput;

interface StageOfficialImportBase {
  readonly reasonCode: string;
  readonly sourceCaptureId: string;
  readonly importKind: OfficialImportKind;
  readonly createdBy: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly rows: readonly OfficialImportRowInput[];
}

export interface StageCampaignImportInput extends StageOfficialImportBase {
  readonly campaignVersionId: string;
}

export interface StageAuthorityImportInput extends StageOfficialImportBase {
  readonly authoritySourceDocumentId: string;
}

export interface StageOfficialImportResult {
  readonly batchId: string;
  readonly rowCount: number;
  readonly candidateRows: number;
  readonly ambiguousRows: number;
  readonly unresolvedRows: number;
}

export type StageCampaignImportResult = StageOfficialImportResult;

interface ImportBinding {
  readonly sourceContext: 'campaign' | 'authority-list';
  readonly campaignVersionId: string | null;
  readonly authoritySourceDocumentId: string | null;
  readonly sourceName: string;
  readonly membershipRole: string;
  readonly assertionActionType: string;
}

interface IdRow {
  readonly id: string;
}

interface ResolutionCountRow {
  readonly resolution_state: string;
  readonly count: string;
}

interface ApprovedImportRow {
  readonly id: string;
  readonly resolved_entity_id: string;
  readonly raw_name: string;
}

interface CommitContextRow {
  readonly batch_id: string;
  readonly source_context: 'campaign' | 'authority-list';
  readonly campaign_version_id: string | null;
  readonly authority_source_document_id: string | null;
  readonly reason_code: string;
  readonly source_capture_id: string;
  readonly source_name: string;
  readonly membership_role: string;
  readonly assertion_action_type: string;
  readonly cause_id: string;
  readonly proposed_list: 'filter' | 'highlight';
  readonly state: string;
}

export async function stageCampaignImport(
  db: SqlExecutor,
  input: StageCampaignImportInput,
): Promise<StageOfficialImportResult> {
  const binding = await validateCampaignImportBinding(db, input);
  return stageOfficialImport(db, input, binding);
}

export async function stageAuthorityImport(
  db: SqlExecutor,
  input: StageAuthorityImportInput,
): Promise<StageOfficialImportResult> {
  const binding = await validateAuthorityImportBinding(db, input);
  return stageOfficialImport(db, input, binding);
}

async function stageOfficialImport(
  db: SqlExecutor,
  input: StageOfficialImportBase,
  binding: ImportBinding,
): Promise<StageOfficialImportResult> {
  const createdBy = input.createdBy.trim();
  if (createdBy.length === 0 || createdBy.length > 256) {
    throw new Error('createdBy must contain 1-256 characters');
  }
  if (input.rows.length === 0 || input.rows.length > 100_000) {
    throw new Error('official import must contain 1-100000 rows');
  }

  const normalizedRows = input.rows.map((row, ordinal) => {
    const rawName = row.rawName.trim();
    if (rawName.length === 0 || rawName.length > 512) {
      throw new Error(`invalid official import name at row ${ordinal}`);
    }
    return {
      ordinal,
      rawName,
      normalizedName: normalizeEntityName(rawName),
      rawPayload: row.rawPayload ?? {},
    };
  });

  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

    const batchResult = await tx.query<IdRow>(
      `INSERT INTO official_import_batches (
         campaign_version_id,
         authority_source_document_id,
         source_context,
         reason_code,
         source_capture_id,
         import_kind,
         state,
         source_row_count,
         created_by,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, 'resolving', $7, $8, $9::jsonb)
       RETURNING id::text`,
      [
        binding.campaignVersionId,
        binding.authoritySourceDocumentId,
        binding.sourceContext,
        input.reasonCode,
        input.sourceCaptureId,
        input.importKind,
        normalizedRows.length,
        createdBy,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const batchId = batchResult.rows[0]?.id;
    if (!batchId) throw new Error('official import batch insert failed');

    await tx.query(
      `INSERT INTO official_import_events (batch_id, event_type, actor_id, details)
       VALUES ($1, 'created', $2, $3::jsonb)`,
      [
        batchId,
        createdBy,
        JSON.stringify({
          sourceContext: binding.sourceContext,
          sourceName: binding.sourceName,
          reasonCode: input.reasonCode,
          rowCount: normalizedRows.length,
        }),
      ],
    );

    for (const row of normalizedRows) {
      const inserted = await tx.query<IdRow>(
        `INSERT INTO official_import_rows (
           batch_id, ordinal, raw_name, normalized_name, raw_payload
         ) VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id::text`,
        [batchId, row.ordinal, row.rawName, row.normalizedName, JSON.stringify(row.rawPayload)],
      );
      const rowId = inserted.rows[0]?.id;
      if (!rowId) throw new Error('official import row insert failed');
      await tx.query(
        `INSERT INTO official_import_events (
           batch_id, row_id, event_type, actor_id, details
         ) VALUES ($1, $2, 'row-staged', $3, '{}'::jsonb)`,
        [batchId, rowId, createdBy],
      );
    }

    await discoverExactNameCandidates(tx, batchId, createdBy);

    const counts = await tx.query<ResolutionCountRow>(
      `SELECT resolution_state, count(*)::text AS count
       FROM official_import_rows
       WHERE batch_id = $1
       GROUP BY resolution_state`,
      [batchId],
    );
    const byState = new Map(counts.rows.map((row) => [row.resolution_state, Number(row.count)]));

    return {
      batchId,
      rowCount: normalizedRows.length,
      candidateRows: byState.get('candidate') ?? 0,
      ambiguousRows: byState.get('ambiguous') ?? 0,
      unresolvedRows: byState.get('unresolved') ?? 0,
    };
  });
}

export async function approveCampaignImportRow(
  db: SqlExecutor,
  rowId: string,
  entityId: string,
  reviewerId: string,
  note = '',
): Promise<void> {
  return approveOfficialImportRow(db, rowId, entityId, reviewerId, note);
}

export async function approveOfficialImportRow(
  db: SqlExecutor,
  rowId: string,
  entityId: string,
  reviewerId: string,
  note = '',
): Promise<void> {
  const reviewer = reviewerId.trim();
  if (!reviewer) throw new Error('reviewerId is required');

  await db.transaction(async (tx) => {
    const result = await tx.query<{ batch_id: string }>(
      `UPDATE official_import_rows row
       SET resolved_entity_id = $2,
           resolution_state = 'approved',
           resolution_method = 'manual',
           reviewed_by = $3,
           reviewed_at = now(),
           review_note = $4,
           updated_at = now()
       FROM official_import_batches batch, entities entity
       WHERE row.id = $1
         AND batch.id = row.batch_id
         AND batch.state IN ('resolving', 'ready')
         AND entity.id = $2
         AND entity.status = 'active'
         AND row.resolution_state NOT IN ('committed', 'rejected', 'skipped')
       RETURNING row.batch_id::text`,
      [rowId, entityId, reviewer, note.trim()],
    );
    const batchId = result.rows[0]?.batch_id;
    if (!batchId) throw new Error('official import row cannot be approved');

    await tx.query(
      `INSERT INTO official_import_events (
         batch_id, row_id, event_type, actor_id, details
       ) VALUES ($1, $2, 'row-approved', $3, $4::jsonb)`,
      [batchId, rowId, reviewer, JSON.stringify({ entityId })],
    );
  });
}

export async function markCampaignImportRow(
  db: SqlExecutor,
  rowId: string,
  state: 'skipped' | 'rejected',
  reviewerId: string,
  note: string,
): Promise<void> {
  return markOfficialImportRow(db, rowId, state, reviewerId, note);
}

export async function markOfficialImportRow(
  db: SqlExecutor,
  rowId: string,
  state: 'skipped' | 'rejected',
  reviewerId: string,
  note: string,
): Promise<void> {
  const reviewer = reviewerId.trim();
  if (!reviewer) throw new Error('reviewerId is required');
  if (!note.trim()) throw new Error('a review note is required when skipping or rejecting a row');

  await db.transaction(async (tx) => {
    const result = await tx.query<{ batch_id: string }>(
      `UPDATE official_import_rows row
       SET resolution_state = $2,
           resolved_entity_id = NULL,
           reviewed_by = $3,
           reviewed_at = now(),
           review_note = $4,
           updated_at = now()
       FROM official_import_batches batch
       WHERE row.id = $1
         AND batch.id = row.batch_id
         AND batch.state IN ('resolving', 'ready')
         AND row.resolution_state <> 'committed'
       RETURNING row.batch_id::text`,
      [rowId, state, reviewer, note.trim()],
    );
    const batchId = result.rows[0]?.batch_id;
    if (!batchId) throw new Error('official import row cannot be updated');

    await tx.query(
      `INSERT INTO official_import_events (
         batch_id, row_id, event_type, actor_id, details
       ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        batchId,
        rowId,
        state === 'skipped' ? 'row-skipped' : 'row-rejected',
        reviewer,
        JSON.stringify({ note: note.trim() }),
      ],
    );
  });
}

export async function markCampaignImportReady(
  db: SqlExecutor,
  batchId: string,
  reviewerId: string,
): Promise<void> {
  return markOfficialImportReady(db, batchId, reviewerId);
}

export async function markOfficialImportReady(
  db: SqlExecutor,
  batchId: string,
  reviewerId: string,
): Promise<void> {
  const reviewer = reviewerId.trim();
  if (!reviewer) throw new Error('reviewerId is required');

  await db.transaction(async (tx) => {
    const unresolved = await tx.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM official_import_rows
       WHERE batch_id = $1
         AND resolution_state NOT IN ('approved', 'skipped', 'rejected')`,
      [batchId],
    );
    if (Number(unresolved.rows[0]?.count ?? 0) !== 0) {
      throw new Error('official import still has unresolved rows');
    }

    const approved = await tx.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM official_import_rows
       WHERE batch_id = $1 AND resolution_state = 'approved'`,
      [batchId],
    );
    if (Number(approved.rows[0]?.count ?? 0) === 0) {
      throw new Error('official import has no approved rows');
    }

    const updated = await tx.query<IdRow>(
      `UPDATE official_import_batches
       SET state = 'ready'
       WHERE id = $1 AND state = 'resolving'
       RETURNING id::text`,
      [batchId],
    );
    if (!updated.rows[0]) throw new Error('official import batch is not resolvable');

    await tx.query(
      `INSERT INTO official_import_events (batch_id, event_type, actor_id, details)
       VALUES ($1, 'batch-ready', $2, '{}'::jsonb)`,
      [batchId, reviewer],
    );
  });
}

export async function commitCampaignImport(
  db: SqlExecutor,
  batchId: string,
  reviewerId: string,
): Promise<{ readonly assertionsCreated: number; readonly membershipsApplied: number }> {
  return commitOfficialImport(db, batchId, reviewerId);
}

export async function commitOfficialImport(
  db: SqlExecutor,
  batchId: string,
  reviewerId: string,
): Promise<{ readonly assertionsCreated: number; readonly membershipsApplied: number }> {
  const reviewer = reviewerId.trim();
  if (!reviewer) throw new Error('reviewerId is required');

  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('isnotreal-official-import-commit'))");

    const context = await loadCommitContext(tx, batchId);
    if (context.state !== 'ready') throw new Error('official import batch is not ready');

    const policy = await tx.query<IdRow>(
      `SELECT revision.id::text
       FROM policies policy
       JOIN policy_revisions revision
         ON revision.policy_id = policy.id
        AND revision.state = 'active'
       WHERE policy.slug = 'default-publication-policy'
       LIMIT 1`,
    );
    const policyRevisionId = policy.rows[0]?.id;
    if (!policyRevisionId) throw new Error('default publication policy is not active');

    const reviewEvent = await tx.query<IdRow>(
      `INSERT INTO review_events (
         subject_type, subject_id, action, reviewer_id, rationale
       ) VALUES ('official-import-batch', $1, 'approved', $2, $3)
       RETURNING id::text`,
      [batchId, reviewer, `Trusted official-list batch: ${context.source_name}`],
    );
    const reviewEventId = reviewEvent.rows[0]?.id;
    if (!reviewEventId) throw new Error('official import review event insert failed');

    const rows = await tx.query<ApprovedImportRow>(
      `SELECT id::text, resolved_entity_id::text, raw_name
       FROM official_import_rows
       WHERE batch_id = $1 AND resolution_state = 'approved'
       ORDER BY ordinal`,
      [batchId],
    );
    if (rows.rows.length === 0) throw new Error('official import has no approved rows');

    for (const row of rows.rows) {
      const assertion = await tx.query<IdRow>(
        `INSERT INTO assertions (
           primary_entity_id,
           action_type,
           campaign_version_id,
           summary,
           date_precision,
           state
         ) VALUES ($1, $2, $3, $4, 'unknown', 'published')
         RETURNING id::text`,
        [
          row.resolved_entity_id,
          context.assertion_action_type,
          context.campaign_version_id,
          `Verified ${context.membership_role} entry on ${context.source_name}: ${row.raw_name}`,
        ],
      );
      const assertionId = assertion.rows[0]?.id;
      if (!assertionId) throw new Error('official assertion insert failed');

      await tx.query(
        `INSERT INTO assertion_participants (assertion_id, entity_id, role)
         VALUES ($1, $2, $3)`,
        [assertionId, row.resolved_entity_id, participantRole(context.membership_role)],
      );
      await tx.query(
        `INSERT INTO assertion_source_links (
           assertion_id, capture_id, is_primary, stance
         ) VALUES ($1, $2, true, 'supports')`,
        [assertionId, context.source_capture_id],
      );
      await tx.query(
        `INSERT INTO assertion_reasons (assertion_id, reason_code)
         VALUES ($1, $2)`,
        [assertionId, context.reason_code],
      );
      const existingDecision = await tx.query<IdRow>(
        `SELECT id::text
         FROM membership_decisions
         WHERE entity_id = $1
           AND cause_id = $2
           AND list_kind = $3
           AND state = 'active'
           AND decision = 'include'
         FOR UPDATE`,
        [row.resolved_entity_id, context.cause_id, context.proposed_list],
      );
      let decisionId = existingDecision.rows[0]?.id;
      if (!decisionId) {
        const decision = await tx.query<IdRow>(
          `INSERT INTO membership_decisions (
             entity_id, cause_id, list_kind, decision, state, policy_revision_id, decided_at
           ) VALUES ($1, $2, $3, 'include', 'active', $4, now())
           RETURNING id::text`,
          [row.resolved_entity_id, context.cause_id, context.proposed_list, policyRevisionId],
        );
        decisionId = decision.rows[0]?.id;
      }
      if (!decisionId) throw new Error('official import membership decision failed');
      await tx.query(
        `INSERT INTO membership_decision_reasons (
           decision_id, reason_code, assertion_id, last_verified_at, verification_review_event_id
         ) VALUES ($1, $2, $3, now(), $4)
         ON CONFLICT (decision_id, reason_code, assertion_id)
         DO UPDATE SET
           last_verified_at = EXCLUDED.last_verified_at,
           verification_review_event_id = EXCLUDED.verification_review_event_id`,
        [decisionId, context.reason_code, assertionId, reviewEventId],
      );
      await tx.query(
        `UPDATE official_import_rows
         SET resolution_state = 'committed',
             assertion_id = $2,
             updated_at = now()
         WHERE id = $1 AND resolution_state = 'approved'`,
        [row.id, assertionId],
      );
    }

    await tx.query(
      `UPDATE official_import_batches
       SET state = 'committed', committed_at = now()
       WHERE id = $1 AND state = 'ready'`,
      [batchId],
    );
    await tx.query(
      `INSERT INTO official_import_events (
         batch_id, event_type, actor_id, details
       ) VALUES ($1, 'batch-committed', $2, $3::jsonb)`,
      [
        batchId,
        reviewer,
        JSON.stringify({ assertionsCreated: rows.rows.length, membershipsApplied: rows.rows.length }),
      ],
    );

    return { assertionsCreated: rows.rows.length, membershipsApplied: rows.rows.length };
  });
}

async function validateCampaignImportBinding(
  db: SqlExecutor,
  input: StageCampaignImportInput,
): Promise<ImportBinding> {
  const result = await db.query<{
    campaign_name: string;
    membership_role: string;
    assertion_action_type: string;
  }>(
    `SELECT
       campaign.name AS campaign_name,
       binding.membership_role,
       binding.assertion_action_type
     FROM campaign_versions version
     JOIN campaigns campaign ON campaign.id = version.campaign_id
     JOIN reason_campaign_bindings binding
       ON binding.campaign_id = campaign.id
      AND binding.reason_code = $2
     JOIN source_captures capture
       ON capture.id = $3
      AND capture.status = 'available'
     WHERE version.id = $1
       AND version.source_document_id = capture.document_id
     LIMIT 1`,
    [input.campaignVersionId, input.reasonCode, input.sourceCaptureId],
  );
  const binding = result.rows[0];
  if (!binding) {
    throw new Error('campaign version, reason code, and source capture are not a valid binding');
  }
  return {
    sourceContext: 'campaign',
    campaignVersionId: input.campaignVersionId,
    authoritySourceDocumentId: null,
    sourceName: binding.campaign_name,
    membershipRole: binding.membership_role,
    assertionActionType: binding.assertion_action_type,
  };
}

async function validateAuthorityImportBinding(
  db: SqlExecutor,
  input: StageAuthorityImportInput,
): Promise<ImportBinding> {
  const result = await db.query<{ source_name: string }>(
    `SELECT document.title AS source_name
     FROM source_documents document
     JOIN source_captures capture
       ON capture.document_id = document.id
      AND capture.id = $2
      AND capture.status = 'available'
     JOIN current_reason_catalog catalog ON catalog.code = $3
     WHERE document.id = $1
       AND catalog.evidence_mode = 'authoritative-list'
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(catalog.authority_sources) authority
         WHERE authority ->> 'url' = document.canonical_url
       )
     LIMIT 1`,
    [input.authoritySourceDocumentId, input.sourceCaptureId, input.reasonCode],
  );
  const source = result.rows[0];
  if (!source) {
    throw new Error('authority source, reason code, and source capture are not a valid binding');
  }
  return {
    sourceContext: 'authority-list',
    campaignVersionId: null,
    authoritySourceDocumentId: input.authoritySourceDocumentId,
    sourceName: source.source_name,
    membershipRole: 'target',
    assertionActionType: 'listed-by-authority',
  };
}

async function loadCommitContext(db: SqlExecutor, batchId: string): Promise<CommitContextRow> {
  const result = await db.query<CommitContextRow>(
    `SELECT
       batch.id::text AS batch_id,
       batch.source_context,
       batch.campaign_version_id::text,
       batch.authority_source_document_id::text,
       batch.reason_code,
       batch.source_capture_id::text,
       CASE
         WHEN batch.source_context = 'campaign' THEN campaign.name
         ELSE authority_document.title
       END AS source_name,
       CASE
         WHEN batch.source_context = 'campaign' THEN campaign_binding.membership_role
         ELSE 'target'
       END AS membership_role,
       CASE
         WHEN batch.source_context = 'campaign' THEN campaign_binding.assertion_action_type
         ELSE 'listed-by-authority'
       END AS assertion_action_type,
       cause.id::text AS cause_id,
       catalog.default_list AS proposed_list,
       batch.state
     FROM official_import_batches batch
     LEFT JOIN campaign_versions version ON version.id = batch.campaign_version_id
     LEFT JOIN campaigns campaign ON campaign.id = version.campaign_id
     LEFT JOIN reason_campaign_bindings campaign_binding
       ON campaign_binding.campaign_id = campaign.id
      AND campaign_binding.reason_code = batch.reason_code
     LEFT JOIN source_documents authority_document
       ON authority_document.id = batch.authority_source_document_id
     JOIN reason_causes reason_cause ON reason_cause.reason_code = batch.reason_code
     JOIN causes cause ON cause.id = reason_cause.cause_id AND cause.active = true
     JOIN current_reason_catalog catalog
       ON catalog.code = batch.reason_code
      AND catalog.publication_enabled = true
      AND catalog.default_list IN ('filter', 'highlight')
     WHERE batch.id = $1
       AND (
         (batch.source_context = 'campaign' AND campaign_binding.reason_code IS NOT NULL)
         OR
         (batch.source_context = 'authority-list' AND authority_document.id IS NOT NULL)
       )
     FOR UPDATE OF batch`,
    [batchId],
  );
  const context = result.rows[0];
  if (!context) throw new Error('official import batch not found or invalid');
  return context;
}

async function discoverExactNameCandidates(
  db: SqlExecutor,
  batchId: string,
  actorId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO official_import_candidates (row_id, entity_id, match_basis, score)
     SELECT row.id, entity.id, 'canonical-name', 1
     FROM official_import_rows row
     JOIN entities entity
       ON lower(btrim(entity.canonical_name)) = row.normalized_name
      AND entity.status = 'active'
     WHERE row.batch_id = $1
     ON CONFLICT (row_id, entity_id) DO NOTHING`,
    [batchId],
  );

  await db.query(
    `INSERT INTO official_import_candidates (row_id, entity_id, match_basis, score)
     SELECT row.id, name.entity_id, 'alias', 1
     FROM official_import_rows row
     JOIN entity_names name ON name.normalized_name = row.normalized_name
     JOIN entities entity ON entity.id = name.entity_id AND entity.status = 'active'
     WHERE row.batch_id = $1
     ON CONFLICT (row_id, entity_id) DO NOTHING`,
    [batchId],
  );

  await db.query(
    `WITH counts AS (
       SELECT row.id, count(candidate.entity_id) AS candidate_count
       FROM official_import_rows row
       LEFT JOIN official_import_candidates candidate ON candidate.row_id = row.id
       WHERE row.batch_id = $1
       GROUP BY row.id
     )
     UPDATE official_import_rows row
     SET resolution_state = CASE
           WHEN counts.candidate_count = 0 THEN 'unresolved'
           WHEN counts.candidate_count = 1 THEN 'candidate'
           ELSE 'ambiguous'
         END,
         updated_at = now()
     FROM counts
     WHERE row.id = counts.id`,
    [batchId],
  );

  await db.query(
    `INSERT INTO official_import_events (
       batch_id, row_id, event_type, actor_id, details
     )
     SELECT
       row.batch_id,
       row.id,
       'candidate-found',
       $2,
       jsonb_build_object('candidateCount', count(candidate.entity_id))
     FROM official_import_rows row
     JOIN official_import_candidates candidate ON candidate.row_id = row.id
     WHERE row.batch_id = $1
     GROUP BY row.batch_id, row.id`,
    [batchId, actorId],
  );
}

function participantRole(membershipRole: string): string {
  if (membershipRole === 'signer') return 'signer';
  if (membershipRole === 'participant') return 'participant';
  if (membershipRole.includes('target')) return 'target';
  return 'other';
}

export function normalizeEntityName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
