import type { SqlExecutor } from './index.js';

export interface MembershipProposal {
  readonly id: string;
  readonly entityPublicId: string;
  readonly entityName: string;
  readonly entitySlug: string;
  readonly assertionId: string;
  readonly reasonCode: string;
  readonly reasonLabel: string;
  readonly proposedList: 'filter' | 'highlight';
  readonly state: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'applied';
  readonly assertionSummary: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly reviewNote: string;
}

interface IdRow {
  readonly id: string;
}

interface ProposalContextRow {
  readonly id: string;
  readonly entity_id: string;
  readonly assertion_id: string;
  readonly reason_code: string;
  readonly proposed_list: 'filter' | 'highlight';
  readonly state: string;
}

interface ActiveDecisionRow {
  readonly id: string;
  readonly decision: 'include' | 'exclude';
}

interface PolicyRevisionRow {
  readonly id: string;
}

interface ProposalRow {
  readonly id: string;
  readonly entity_public_id: string;
  readonly entity_name: string;
  readonly entity_slug: string;
  readonly assertion_id: string;
  readonly reason_code: string;
  readonly reason_label: string;
  readonly proposed_list: 'filter' | 'highlight';
  readonly state: MembershipProposal['state'];
  readonly assertion_summary: string;
  readonly created_by: string;
  readonly created_at: string;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly review_note: string;
}

export async function proposeMembershipFromAssertion(
  db: SqlExecutor,
  assertionId: string,
  reasonCode: string,
  createdBy: string,
): Promise<string> {
  const actor = createdBy.trim();
  if (!actor) throw new Error('createdBy is required');

  const inserted = await db.query<IdRow>(
    `INSERT INTO membership_proposals (
       entity_id,
       assertion_id,
       reason_code,
       proposed_list,
       created_by
     )
     SELECT
       assertion.primary_entity_id,
       assertion.id,
       catalog.code,
       catalog.default_list,
       $3
     FROM assertions assertion
     JOIN assertion_reasons assertion_reason
       ON assertion_reason.assertion_id = assertion.id
      AND assertion_reason.reason_code = $2
     JOIN current_reason_catalog catalog
       ON catalog.code = assertion_reason.reason_code
      AND catalog.publication_enabled = true
      AND catalog.default_list IN ('filter', 'highlight')
     WHERE assertion.id = $1
       AND assertion.primary_entity_id IS NOT NULL
       AND assertion.state = 'published'
     ON CONFLICT (entity_id, assertion_id, reason_code, proposed_list)
     DO UPDATE SET
       created_by = membership_proposals.created_by
     RETURNING id::text`,
    [assertionId, reasonCode, actor],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error('assertion is not eligible for a membership proposal');
  return id;
}

export async function listMembershipProposals(
  db: SqlExecutor,
  state: MembershipProposal['state'] | null = 'pending',
  limit = 100,
): Promise<readonly MembershipProposal[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('proposal limit must be between 1 and 500');
  }

  const result = await db.query<ProposalRow>(
    `SELECT
       proposal.id::text,
       entity.public_id::text AS entity_public_id,
       entity.canonical_name AS entity_name,
       entity.slug AS entity_slug,
       proposal.assertion_id::text,
       proposal.reason_code,
       reason.label AS reason_label,
       proposal.proposed_list,
       proposal.state,
       assertion.summary AS assertion_summary,
       proposal.created_by,
       proposal.created_at::text,
       proposal.reviewed_by,
       proposal.reviewed_at::text,
       proposal.review_note
     FROM membership_proposals proposal
     JOIN entities entity ON entity.id = proposal.entity_id
     JOIN assertions assertion ON assertion.id = proposal.assertion_id
     JOIN reason_definitions reason ON reason.code = proposal.reason_code
     WHERE ($1::text IS NULL OR proposal.state = $1)
     ORDER BY proposal.created_at, proposal.id
     LIMIT $2`,
    [state, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    entityPublicId: row.entity_public_id,
    entityName: row.entity_name,
    entitySlug: row.entity_slug,
    assertionId: row.assertion_id,
    reasonCode: row.reason_code,
    reasonLabel: row.reason_label,
    proposedList: row.proposed_list,
    state: row.state,
    assertionSummary: row.assertion_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  }));
}

export async function approveMembershipProposal(
  db: SqlExecutor,
  proposalId: string,
  reviewerId: string,
  note = '',
): Promise<string> {
  const reviewer = reviewerId.trim();
  if (!reviewer) throw new Error('reviewerId is required');

  return db.transaction(async (tx) => {
    const proposalResult = await tx.query<ProposalContextRow>(
      `SELECT
         id::text,
         entity_id::text,
         assertion_id::text,
         reason_code,
         proposed_list,
         state
       FROM membership_proposals
       WHERE id = $1
       FOR UPDATE`,
      [proposalId],
    );
    const proposal = proposalResult.rows[0];
    if (!proposal) throw new Error('membership proposal not found');
    if (proposal.state !== 'pending' && proposal.state !== 'approved') {
      throw new Error('membership proposal is not reviewable');
    }

    const validation = await tx.query<{ valid_for_publication: boolean; issues: string[] }>(
      `WITH candidate AS (
         SELECT
           $1::uuid AS entity_id,
           $2::uuid AS assertion_id,
           $3::text AS reason_code,
           $4::text AS list_kind
       ),
       evidence AS (
         SELECT
           candidate.*,
           entity.kind AS entity_kind,
           assertion.state AS assertion_state,
           assertion.primary_entity_id,
           catalog.publication_enabled,
           catalog.default_list,
           catalog.subject_scope,
           catalog.evidence_mode,
           catalog.primary_or_authoritative_required,
           catalog.minimum_evidence_items,
           catalog.reverify_after_days,
           catalog.inheritance_policy,
           catalog.campaigns,
           catalog.authority_sources,
           COALESCE(source_counts.source_count, 0) AS source_count,
           COALESCE(source_counts.primary_source_count, 0) AS primary_source_count,
           COALESCE(source_counts.authority_source_count, 0) AS authority_source_count
         FROM candidate
         JOIN entities entity ON entity.id = candidate.entity_id
         JOIN assertions assertion ON assertion.id = candidate.assertion_id
         JOIN current_reason_catalog catalog ON catalog.code = candidate.reason_code
         LEFT JOIN LATERAL (
           SELECT
             count(DISTINCT link.capture_id)::integer AS source_count,
             count(DISTINCT link.capture_id) FILTER (
               WHERE link.is_primary = true
                  OR document.source_type IN ('primary', 'campaign', 'filing')
             )::integer AS primary_source_count,
             count(DISTINCT link.capture_id) FILTER (
               WHERE EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(catalog.authority_sources) authority
                 WHERE authority ->> 'url' = document.canonical_url
               )
             )::integer AS authority_source_count
           FROM assertion_source_links link
           JOIN source_captures capture
             ON capture.id = link.capture_id
            AND capture.status = 'available'
           JOIN source_documents document ON document.id = capture.document_id
           WHERE link.assertion_id = assertion.id
         ) source_counts ON true
       )
       SELECT
         (
           publication_enabled
           AND default_list = list_kind
           AND assertion_state = 'published'
           AND EXISTS (
             SELECT 1
             FROM assertion_reasons reason
             WHERE reason.assertion_id = assertion_id
               AND reason.reason_code = reason_code
           )
           AND CASE
             WHEN subject_scope = 'person' THEN entity_kind IN ('person', 'music-group')
             WHEN subject_scope = 'company' THEN entity_kind IN ('company', 'brand')
             WHEN subject_scope = 'organization' THEN entity_kind = 'organization'
             WHEN subject_scope = 'any' THEN true
             ELSE false
           END
           AND primary_entity_id = entity_id
           AND source_count >= minimum_evidence_items
           AND (
             NOT primary_or_authoritative_required
             OR primary_source_count > 0
             OR authority_source_count > 0
           )
         ) AS valid_for_publication,
         array_remove(
           ARRAY[
             CASE WHEN NOT publication_enabled THEN 'reason-publication-disabled' END,
             CASE WHEN default_list <> list_kind THEN 'reason-list-direction-mismatch' END,
             CASE WHEN assertion_state <> 'published' THEN 'assertion-not-published' END,
             CASE
               WHEN NOT EXISTS (
                 SELECT 1
                 FROM assertion_reasons reason
                 WHERE reason.assertion_id = assertion_id
                   AND reason.reason_code = reason_code
               ) THEN 'assertion-reason-mismatch'
             END,
             CASE WHEN primary_entity_id <> entity_id THEN 'assertion-not-attributed-to-entity' END,
             CASE WHEN source_count < minimum_evidence_items THEN 'insufficient-sources' END,
             CASE
               WHEN primary_or_authoritative_required
                AND primary_source_count = 0
                AND authority_source_count = 0
                 THEN 'missing-primary-or-authoritative-source'
             END
           ]::text[],
           NULL
         ) AS issues
       FROM evidence`,
      [
        proposal.entity_id,
        proposal.assertion_id,
        proposal.reason_code,
        proposal.proposed_list,
      ],
    );
    const check = validation.rows[0];
    if (!check?.valid_for_publication) {
      throw new Error(
        `membership proposal does not satisfy evidence rules: ${(check?.issues ?? []).join(',')}`,
      );
    }

    const policy = await tx.query<PolicyRevisionRow>(
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

    const existingResult = await tx.query<ActiveDecisionRow>(
      `SELECT id::text, decision
       FROM membership_decisions
       WHERE entity_id = $1
         AND list_kind = $2
         AND state = 'active'
       FOR UPDATE`,
      [proposal.entity_id, proposal.proposed_list],
    );
    const existing = existingResult.rows[0];

    let decisionId: string;
    if (existing?.decision === 'include') {
      decisionId = existing.id;
    } else {
      if (existing) {
        await tx.query(
          `UPDATE membership_decisions
           SET state = 'superseded'
           WHERE id = $1 AND state = 'active'`,
          [existing.id],
        );
      }
      const created = await tx.query<IdRow>(
        `INSERT INTO membership_decisions (
           entity_id,
           list_kind,
           decision,
           state,
           policy_revision_id,
           decided_at,
           supersedes_decision_id
         ) VALUES ($1, $2, 'include', 'active', $3, now(), $4)
         RETURNING id::text`,
        [proposal.entity_id, proposal.proposed_list, policyRevisionId, existing?.id ?? null],
      );
      decisionId = created.rows[0]?.id ?? '';
      if (!decisionId) throw new Error('membership decision insert failed');
    }

    await tx.query(
      `INSERT INTO membership_decision_reasons (
         decision_id,
         reason_code,
         assertion_id,
         last_verified_at
       ) VALUES ($1, $2, $3, now())
       ON CONFLICT (decision_id, reason_code, assertion_id)
       DO UPDATE SET last_verified_at = EXCLUDED.last_verified_at`,
      [decisionId, proposal.reason_code, proposal.assertion_id],
    );

    await tx.query(
      `UPDATE membership_proposals
       SET state = 'applied',
           reviewed_by = $2,
           reviewed_at = now(),
           review_note = $3,
           applied_decision_id = $4,
           applied_at = now()
       WHERE id = $1`,
      [proposal.id, reviewer, note.trim(), decisionId],
    );

    await tx.query(
      `INSERT INTO review_events (
         subject_type, subject_id, action, reviewer_id, rationale
       ) VALUES ('membership-proposal', $1, 'approved', $2, $3)`,
      [proposal.id, reviewer, note.trim()],
    );

    return decisionId;
  });
}

export async function rejectMembershipProposal(
  db: SqlExecutor,
  proposalId: string,
  reviewerId: string,
  note: string,
): Promise<void> {
  const reviewer = reviewerId.trim();
  const rationale = note.trim();
  if (!reviewer) throw new Error('reviewerId is required');
  if (!rationale) throw new Error('rejection rationale is required');

  await db.transaction(async (tx) => {
    const updated = await tx.query<IdRow>(
      `UPDATE membership_proposals
       SET state = 'rejected',
           reviewed_by = $2,
           reviewed_at = now(),
           review_note = $3
       WHERE id = $1 AND state IN ('pending', 'approved')
       RETURNING id::text`,
      [proposalId, reviewer, rationale],
    );
    if (!updated.rows[0]) throw new Error('membership proposal is not reviewable');

    await tx.query(
      `INSERT INTO review_events (
         subject_type, subject_id, action, reviewer_id, rationale
       ) VALUES ('membership-proposal', $1, 'rejected', $2, $3)`,
      [proposalId, reviewer, rationale],
    );
  });
}

export async function createMembershipProposalsForImportBatch(
  db: SqlExecutor,
  batchId: string,
  createdBy: string,
): Promise<number> {
  const actor = createdBy.trim();
  if (!actor) throw new Error('createdBy is required');

  const assertions = await db.query<{ assertion_id: string; reason_code: string }>(
    `SELECT row.assertion_id::text, batch.reason_code
     FROM official_import_rows row
     JOIN official_import_batches batch ON batch.id = row.batch_id
     WHERE row.batch_id = $1
       AND row.resolution_state = 'committed'
       AND row.assertion_id IS NOT NULL
     ORDER BY row.ordinal`,
    [batchId],
  );

  let created = 0;
  for (const row of assertions.rows) {
    await proposeMembershipFromAssertion(db, row.assertion_id, row.reason_code, actor);
    created += 1;
  }
  return created;
}
