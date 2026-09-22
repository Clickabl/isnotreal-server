import type { SqlExecutor } from './index.js';

export type CommunitySubmissionState =
  'pending' | 'triaged' | 'accepted' | 'rejected' | 'duplicate' | 'spam';

export interface CommunitySubmissionQueueItem {
  readonly id: string;
  readonly entityPublicId: string | null;
  readonly identifierKind: string | null;
  readonly identifierValue: string | null;
  readonly submissionType: string;
  readonly proposedList: string | null;
  readonly proposedReasonCode: string | null;
  readonly narrative: string;
  readonly state: CommunitySubmissionState;
  readonly sourceUrls: readonly string[];
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
  readonly reviewNote: string;
}

export interface OfficialImportBatchSummary {
  readonly id: string;
  readonly sourceContext: 'campaign' | 'authority-list';
  readonly reasonCode: string;
  readonly reasonLabel: string;
  readonly sourceName: string;
  readonly state: string;
  readonly importKind: string;
  readonly rowCount: number;
  readonly candidateRows: number;
  readonly ambiguousRows: number;
  readonly unresolvedRows: number;
  readonly approvedRows: number;
  readonly committedRows: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly committedAt: string | null;
}

export interface OfficialImportCandidate {
  readonly entityId: string;
  readonly publicId: string;
  readonly name: string;
  readonly slug: string;
  readonly matchBasis: string;
  readonly score: number | null;
}

export interface OfficialImportRowView {
  readonly id: string;
  readonly ordinal: number;
  readonly rawName: string;
  readonly normalizedName: string;
  readonly rawPayload: Readonly<Record<string, unknown>>;
  readonly resolutionState: string;
  readonly resolvedEntityId: string | null;
  readonly resolvedEntityPublicId: string | null;
  readonly resolvedEntityName: string | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly reviewNote: string;
  readonly candidates: readonly OfficialImportCandidate[];
}

export interface PublicationValidationIssue {
  readonly entityPublicId: string;
  readonly entityName: string;
  readonly entitySlug: string;
  readonly listKind: 'filter' | 'highlight';
  readonly decisionId: string;
  readonly reasonCode: string;
  readonly reasonLabel: string;
  readonly assertionId: string;
  readonly assertionSummary: string;
  readonly issues: readonly string[];
}

interface SubmissionRow {
  readonly id: string;
  readonly entity_public_id: string | null;
  readonly identifier_kind: string | null;
  readonly identifier_value: string | null;
  readonly submission_type: string;
  readonly proposed_list: string | null;
  readonly proposed_reason_code: string | null;
  readonly narrative: string;
  readonly state: CommunitySubmissionState;
  readonly source_urls: string[];
  readonly submitted_at: string;
  readonly reviewed_at: string | null;
  readonly reviewed_by: string | null;
  readonly review_note: string;
}

interface ImportBatchRow {
  readonly id: string;
  readonly source_context: 'campaign' | 'authority-list';
  readonly reason_code: string;
  readonly reason_label: string;
  readonly source_name: string;
  readonly state: string;
  readonly import_kind: string;
  readonly source_row_count: number;
  readonly candidate_rows: string;
  readonly ambiguous_rows: string;
  readonly unresolved_rows: string;
  readonly approved_rows: string;
  readonly committed_rows: string;
  readonly created_by: string;
  readonly created_at: string;
  readonly committed_at: string | null;
}

interface ImportRow {
  readonly id: string;
  readonly ordinal: number;
  readonly raw_name: string;
  readonly normalized_name: string;
  readonly raw_payload: Record<string, unknown>;
  readonly resolution_state: string;
  readonly resolved_entity_id: string | null;
  readonly resolved_entity_public_id: string | null;
  readonly resolved_entity_name: string | null;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly review_note: string;
  readonly candidates: OfficialImportCandidate[];
}

interface ValidationIssueRow {
  readonly entity_public_id: string;
  readonly entity_name: string;
  readonly entity_slug: string;
  readonly list_kind: 'filter' | 'highlight';
  readonly decision_id: string;
  readonly reason_code: string;
  readonly reason_label: string;
  readonly assertion_id: string;
  readonly assertion_summary: string;
  readonly issues: string[];
}

export class PostgresModerationQueue {
  constructor(private readonly db: SqlExecutor) {}

  async listCommunitySubmissions(
    state: CommunitySubmissionState | null = 'pending',
    limit = 100,
  ): Promise<readonly CommunitySubmissionQueueItem[]> {
    assertLimit(limit);
    const result = await this.db.query<SubmissionRow>(
      `SELECT
         submission.id::text,
         entity.public_id::text AS entity_public_id,
         submission.identifier_kind,
         submission.identifier_value,
         submission.submission_type,
         submission.proposed_list,
         submission.proposed_reason_code,
         submission.narrative,
         submission.state,
         COALESCE(
           array_agg(source.url ORDER BY source.created_at)
             FILTER (WHERE source.url IS NOT NULL),
           ARRAY[]::text[]
         ) AS source_urls,
         submission.submitted_at::text,
         submission.reviewed_at::text,
         submission.reviewed_by,
         submission.review_note
       FROM community_submissions submission
       LEFT JOIN entities entity ON entity.id = submission.entity_id
       LEFT JOIN submission_sources source ON source.submission_id = submission.id
       WHERE ($1::text IS NULL OR submission.state = $1)
       GROUP BY submission.id, entity.public_id
       ORDER BY submission.submitted_at, submission.id
       LIMIT $2`,
      [state, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      entityPublicId: row.entity_public_id,
      identifierKind: row.identifier_kind,
      identifierValue: row.identifier_value,
      submissionType: row.submission_type,
      proposedList: row.proposed_list,
      proposedReasonCode: row.proposed_reason_code,
      narrative: row.narrative,
      state: row.state,
      sourceUrls: row.source_urls,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      reviewNote: row.review_note,
    }));
  }

  async reviewCommunitySubmission(
    submissionId: string,
    state: 'triaged' | 'accepted' | 'rejected' | 'duplicate' | 'spam',
    reviewerId: string,
    note: string,
  ): Promise<void> {
    const reviewer = reviewerId.trim();
    const rationale = note.trim();
    if (!reviewer) throw new Error('reviewerId is required');
    if ((state === 'rejected' || state === 'duplicate' || state === 'spam') && !rationale) {
      throw new Error('a rationale is required when rejecting or marking a duplicate');
    }

    await this.db.transaction(async (tx) => {
      const updated = await tx.query<{ id: string }>(
        `UPDATE community_submissions
         SET state = $2,
             reviewed_by = $3,
             reviewed_at = now(),
             review_note = $4
         WHERE id = $1
           AND state IN ('pending', 'triaged')
         RETURNING id::text`,
        [submissionId, state, reviewer, rationale],
      );
      if (!updated.rows[0]) throw new Error('community submission is not reviewable');

      await tx.query(
        `INSERT INTO review_events (
           subject_type, subject_id, action, reviewer_id, rationale
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          'community-submission',
          submissionId,
          state === 'accepted' ? 'approved' : state === 'triaged' ? 'submitted' : 'rejected',
          reviewer,
          rationale,
        ],
      );
    });
  }

  async listOfficialImportBatches(
    state: string | null = null,
    limit = 100,
  ): Promise<readonly OfficialImportBatchSummary[]> {
    assertLimit(limit);
    const result = await this.db.query<ImportBatchRow>(
      `SELECT
         batch.id::text,
         batch.source_context,
         batch.reason_code,
         reason.label AS reason_label,
         CASE
           WHEN batch.source_context = 'campaign' THEN campaign.name
           ELSE authority.title
         END AS source_name,
         batch.state,
         batch.import_kind,
         batch.source_row_count,
         count(*) FILTER (WHERE row.resolution_state = 'candidate')::text AS candidate_rows,
         count(*) FILTER (WHERE row.resolution_state = 'ambiguous')::text AS ambiguous_rows,
         count(*) FILTER (WHERE row.resolution_state = 'unresolved')::text AS unresolved_rows,
         count(*) FILTER (WHERE row.resolution_state = 'approved')::text AS approved_rows,
         count(*) FILTER (WHERE row.resolution_state = 'committed')::text AS committed_rows,
         batch.created_by,
         batch.created_at::text,
         batch.committed_at::text
       FROM official_import_batches batch
       JOIN reason_definitions reason ON reason.code = batch.reason_code
       LEFT JOIN campaign_versions version ON version.id = batch.campaign_version_id
       LEFT JOIN campaigns campaign ON campaign.id = version.campaign_id
       LEFT JOIN source_documents authority ON authority.id = batch.authority_source_document_id
       LEFT JOIN official_import_rows row ON row.batch_id = batch.id
       WHERE ($1::text IS NULL OR batch.state = $1)
       GROUP BY batch.id, reason.label, campaign.name, authority.title
       ORDER BY batch.created_at DESC, batch.id
       LIMIT $2`,
      [state, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      sourceContext: row.source_context,
      reasonCode: row.reason_code,
      reasonLabel: row.reason_label,
      sourceName: row.source_name,
      state: row.state,
      importKind: row.import_kind,
      rowCount: row.source_row_count,
      candidateRows: Number(row.candidate_rows),
      ambiguousRows: Number(row.ambiguous_rows),
      unresolvedRows: Number(row.unresolved_rows),
      approvedRows: Number(row.approved_rows),
      committedRows: Number(row.committed_rows),
      createdBy: row.created_by,
      createdAt: row.created_at,
      committedAt: row.committed_at,
    }));
  }

  async listOfficialImportRows(
    batchId: string,
    limit = 500,
  ): Promise<readonly OfficialImportRowView[]> {
    assertLimit(limit, 1000);
    const result = await this.db.query<ImportRow>(
      `SELECT
         row.id::text,
         row.ordinal,
         row.raw_name,
         row.normalized_name,
         row.raw_payload,
         row.resolution_state,
         row.resolved_entity_id::text,
         resolved.public_id::text AS resolved_entity_public_id,
         resolved.canonical_name AS resolved_entity_name,
         row.reviewed_by,
         row.reviewed_at::text,
         row.review_note,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'entityId', candidate.entity_id::text,
                 'publicId', entity.public_id::text,
                 'name', entity.canonical_name,
                 'slug', entity.slug,
                 'matchBasis', candidate.match_basis,
                 'score', candidate.score
               )
               ORDER BY candidate.score DESC NULLS LAST, entity.canonical_name, candidate.entity_id
             )
             FROM official_import_candidates candidate
             JOIN entities entity ON entity.id = candidate.entity_id
             WHERE candidate.row_id = row.id
           ),
           '[]'::jsonb
         ) AS candidates
       FROM official_import_rows row
       LEFT JOIN entities resolved ON resolved.id = row.resolved_entity_id
       WHERE row.batch_id = $1
       ORDER BY row.ordinal
       LIMIT $2`,
      [batchId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      ordinal: row.ordinal,
      rawName: row.raw_name,
      normalizedName: row.normalized_name,
      rawPayload: row.raw_payload,
      resolutionState: row.resolution_state,
      resolvedEntityId: row.resolved_entity_id,
      resolvedEntityPublicId: row.resolved_entity_public_id,
      resolvedEntityName: row.resolved_entity_name,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      reviewNote: row.review_note,
      candidates: row.candidates,
    }));
  }

  async listPublicationValidationIssues(
    limit = 500,
  ): Promise<readonly PublicationValidationIssue[]> {
    assertLimit(limit, 1000);
    const result = await this.db.query<ValidationIssueRow>(
      `SELECT
         entity.public_id::text AS entity_public_id,
         entity.canonical_name AS entity_name,
         entity.slug AS entity_slug,
         decision.list_kind,
         validation.decision_id::text,
         validation.reason_code,
         reason.label AS reason_label,
         validation.assertion_id::text,
         assertion.summary AS assertion_summary,
         validation.issues
       FROM membership_reason_validation validation
       JOIN membership_decisions decision ON decision.id = validation.decision_id
       JOIN entities entity ON entity.id = validation.entity_id
       JOIN reason_definitions reason ON reason.code = validation.reason_code
       JOIN assertions assertion ON assertion.id = validation.assertion_id
       WHERE validation.valid_for_publication = false
         AND decision.state = 'active'
         AND decision.decision = 'include'
       ORDER BY entity.canonical_name, validation.reason_code, validation.assertion_id
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      entityPublicId: row.entity_public_id,
      entityName: row.entity_name,
      entitySlug: row.entity_slug,
      listKind: row.list_kind,
      decisionId: row.decision_id,
      reasonCode: row.reason_code,
      reasonLabel: row.reason_label,
      assertionId: row.assertion_id,
      assertionSummary: row.assertion_summary,
      issues: row.issues,
    }));
  }
}

function assertLimit(limit: number, max = 500): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > max) {
    throw new Error(`limit must be between 1 and ${max}`);
  }
}
