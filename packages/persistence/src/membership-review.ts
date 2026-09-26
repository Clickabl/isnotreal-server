import type { SqlExecutor } from './index.js';
export interface MembershipProposal {
  readonly id: string;
  readonly entityPublicId: string;
  readonly entityName: string;
  readonly entitySlug: string;
  readonly assertionId: string;
  readonly reasonCode: string;
  readonly reasonLabel: string;
  readonly cause: string;
  readonly proposedList: 'filter' | 'highlight';
  readonly state: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'applied';
  readonly assertionSummary: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly reviewNote: string;
}
export async function proposeMembershipFromAssertion(
  db: SqlExecutor,
  assertionId: string,
  reasonCode: string,
  createdBy: string,
  cause?: string,
): Promise<string> {
  if (!createdBy.trim()) throw new Error('editor identity required');
  const bindings = await db.query<{ id: string }>(
    `SELECT c.id::text FROM reason_causes rc JOIN causes c ON c.id=rc.cause_id WHERE rc.reason_code=$1 AND c.active AND ($2::text IS NULL OR c.slug=$2)`,
    [reasonCode, cause ?? null],
  );
  if (bindings.rows.length !== 1) throw new Error('select one explicit cause for this reason');
  const result = await db.query<{ id: string }>(
    `INSERT INTO membership_proposals (entity_id,assertion_id,reason_code,cause_id,proposed_list,created_by)
  SELECT a.primary_entity_id,a.id,r.code,$4,r.default_list,$3 FROM assertions a JOIN assertion_reasons ar ON ar.assertion_id=a.id AND ar.reason_code=$2
  JOIN current_reason_catalog r ON r.code=ar.reason_code AND r.publication_enabled AND r.default_list IN ('filter','highlight')
  WHERE a.id=$1 AND a.state='published' AND a.primary_entity_id IS NOT NULL
  ON CONFLICT (entity_id,assertion_id,reason_code,cause_id,proposed_list) DO UPDATE SET created_by=membership_proposals.created_by RETURNING id::text`,
    [assertionId, reasonCode, createdBy, bindings.rows[0]!.id],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('assertion is not eligible');
  return id;
}
export async function listMembershipProposals(
  db: SqlExecutor,
  state: MembershipProposal['state'] | null = 'pending',
  limit = 100,
): Promise<readonly MembershipProposal[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid limit');
  const result = await db.query<MembershipProposal>(
    `SELECT p.id::text,e.public_id::text AS "entityPublicId",e.canonical_name AS "entityName",e.slug AS "entitySlug",
  p.assertion_id::text AS "assertionId",p.reason_code AS "reasonCode",r.label AS "reasonLabel",c.slug AS cause,p.proposed_list AS "proposedList",p.state,
  a.summary AS "assertionSummary",p.created_by AS "createdBy",p.created_at::text AS "createdAt",p.reviewed_by AS "reviewedBy",p.reviewed_at::text AS "reviewedAt",p.review_note AS "reviewNote"
  FROM membership_proposals p JOIN entities e ON e.id=p.entity_id JOIN assertions a ON a.id=p.assertion_id JOIN causes c ON c.id=p.cause_id
  JOIN reason_definitions r ON r.code=p.reason_code WHERE ($1::text IS NULL OR p.state=$1) ORDER BY p.created_at,p.id LIMIT $2`,
    [state, limit],
  );
  return result.rows;
}
interface ProposalRow {
  id: string;
  entity_id: string;
  assertion_id: string;
  reason_code: string;
  cause_id: string;
  proposed_list: 'filter' | 'highlight';
  state: string;
}
export async function approveMembershipProposal(
  db: SqlExecutor,
  id: string,
  reviewer: string,
  note = '',
): Promise<string> {
  if (!reviewer.trim()) throw new Error('editor identity required');
  return db.transaction(async (tx) => {
    const found = await tx.query<ProposalRow>(
      'SELECT * FROM membership_proposals WHERE id=$1 FOR UPDATE',
      [id],
    );
    const p = found.rows[0];
    if (!p || !['pending', 'approved'].includes(p.state))
      throw new Error('proposal is not reviewable');
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [
      `${p.entity_id}:${p.cause_id}:${p.proposed_list}`,
    ]);
    const binding = await tx.query<{ id: string }>(
      `SELECT c.id::text FROM reason_causes rc JOIN causes c ON c.id=rc.cause_id AND c.active WHERE rc.reason_code=$1 AND rc.cause_id=$2`,
      [p.reason_code, p.cause_id],
    );
    if (!binding.rows.length) throw new Error('reason/cause mismatch');
    const policy = await tx.query<{ id: string }>(
      `SELECT r.id::text FROM policy_revisions r JOIN policies p ON p.id=r.policy_id WHERE p.slug='default-publication-policy' AND r.state='active' LIMIT 1`,
    );
    if (!policy.rows[0]) throw new Error('no publication policy');
    const old = await tx.query<{ id: string; decision: string }>(
      `SELECT id::text,decision FROM membership_decisions WHERE entity_id=$1 AND cause_id=$2 AND list_kind=$3 AND state='active' FOR UPDATE`,
      [p.entity_id, p.cause_id, p.proposed_list],
    );
    const previous = old.rows[0];
    if (previous)
      await tx.query("UPDATE membership_decisions SET state='superseded' WHERE id=$1", [
        previous.id,
      ]);
    const next = await tx.query<{ id: string }>(
      `INSERT INTO membership_decisions(entity_id,cause_id,list_kind,decision,state,policy_revision_id,decided_at,supersedes_decision_id)
   VALUES ($1,$2,$3,'include','active',$4,now(),$5) RETURNING id::text`,
      [p.entity_id, p.cause_id, p.proposed_list, policy.rows[0].id, previous?.id ?? null],
    );
    const decisionId = next.rows[0]!.id;
    if (previous?.decision === 'include')
      await tx.query(
        `INSERT INTO membership_decision_reasons(decision_id,reason_code,assertion_id,last_verified_at,verification_review_event_id)
   SELECT $1,reason_code,assertion_id,last_verified_at,verification_review_event_id FROM membership_decision_reasons WHERE decision_id=$2`,
        [decisionId, previous.id],
      );
    const event = await tx.query<{ id: string }>(
      `INSERT INTO review_events(subject_type,subject_id,action,reviewer_id,rationale) VALUES('membership-proposal',$1,'approved',$2,$3) RETURNING id::text`,
      [id, reviewer, note],
    );
    const eventId = event.rows[0]!.id;
    await tx.query(
      `INSERT INTO membership_decision_reasons(decision_id,reason_code,assertion_id,last_verified_at,verification_review_event_id) VALUES($1,$2,$3,now(),$4)
   ON CONFLICT(decision_id,reason_code,assertion_id) DO UPDATE SET last_verified_at=EXCLUDED.last_verified_at,verification_review_event_id=EXCLUDED.verification_review_event_id`,
      [decisionId, p.reason_code, p.assertion_id, eventId],
    );
    // The exact same gate protects editor approval and publication. No duplicate SQL policy.
    const gate = await tx.query<{ valid_for_publication: boolean; issues: string[] }>(
      `SELECT valid_for_publication,issues FROM membership_reason_validation WHERE decision_id=$1 AND assertion_id=$2 AND reason_code=$3`,
      [decisionId, p.assertion_id, p.reason_code],
    );
    if (gate.rows[0]?.valid_for_publication !== true)
      throw new Error(
        `evidence gate rejected approval: ${(gate.rows[0]?.issues ?? ['missing-catalog-rule']).join(',')}`,
      );
    await tx.query(
      `UPDATE membership_proposals SET state='applied',reviewed_by=$2,reviewed_at=now(),review_note=$3,applied_decision_id=$4,applied_at=now(),verification_review_event_id=$5 WHERE id=$1`,
      [id, reviewer, note, decisionId, eventId],
    );
    return decisionId;
  });
}
export async function rejectMembershipProposal(
  db: SqlExecutor,
  id: string,
  reviewer: string,
  note: string,
): Promise<void> {
  if (!reviewer.trim() || !note.trim()) throw new Error('reviewer and rationale required');
  await db.transaction(async (tx) => {
    const result = await tx.query<{ id: string }>(
      `UPDATE membership_proposals SET state='rejected',reviewed_by=$2,reviewed_at=now(),review_note=$3 WHERE id=$1 AND state IN('pending','approved') RETURNING id::text`,
      [id, reviewer, note],
    );
    if (!result.rows[0]) throw new Error('proposal is not reviewable');
    await tx.query(
      `INSERT INTO review_events(subject_type,subject_id,action,reviewer_id,rationale) VALUES('membership-proposal',$1,'rejected',$2,$3)`,
      [id, reviewer, note],
    );
  });
}
export async function createMembershipProposalsForImportBatch(
  db: SqlExecutor,
  batchId: string,
  actor: string,
): Promise<number> {
  const rows = await db.query<{ assertion_id: string; reason_code: string }>(
    `SELECT r.assertion_id::text,b.reason_code FROM official_import_rows r JOIN official_import_batches b ON b.id=r.batch_id WHERE b.id=$1 AND r.resolution_state='committed' ORDER BY r.ordinal`,
    [batchId],
  );
  for (const row of rows.rows)
    await proposeMembershipFromAssertion(db, row.assertion_id, row.reason_code, actor);
  return rows.rows.length;
}
