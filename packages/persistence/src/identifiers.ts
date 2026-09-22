import type { SqlExecutor } from './index.js';

export interface AssignVerifiedIdentifierInput {
  readonly entityPublicId: string;
  readonly kind: 'domain' | 'x' | 'tiktok' | 'instagram' | 'youtube';
  readonly value: string;
  readonly displayValue?: string;
  readonly matchScope?: 'exact' | 'include-subdomains';
  readonly verificationAssertionId: string;
  readonly reviewerId: string;
}

export async function assignVerifiedIdentifier(
  db: SqlExecutor,
  input: AssignVerifiedIdentifierInput,
): Promise<{ readonly identifierId: string; readonly entityId: string }> {
  const reviewer = input.reviewerId.trim();
  if (!reviewer) throw new Error('reviewerId is required');
  const normalized = normalizeIdentifier(input.kind, input.value);
  const display = (input.displayValue ?? input.value).trim();
  if (!display || display.length > 500) throw new Error('invalid identifier display value');
  const matchScope =
    input.kind === 'domain' && input.matchScope === 'include-subdomains'
      ? 'include-subdomains'
      : 'exact';

  return db.transaction(async (tx) => {
    const entity = await tx.query<{ id: string }>(
      `SELECT id::text
       FROM entities
       WHERE public_id = $1 AND status = 'active'
       FOR UPDATE`,
      [input.entityPublicId],
    );
    const entityId = entity.rows[0]?.id;
    if (!entityId) throw new Error('entity not found');

    const evidence = await tx.query<{ id: string }>(
      `SELECT assertion.id::text
       FROM assertions assertion
       WHERE assertion.id = $1
         AND assertion.primary_entity_id = $2
         AND assertion.state = 'published'
         AND EXISTS (
           SELECT 1 FROM assertion_source_links source
           WHERE source.assertion_id = assertion.id AND source.stance = 'supports'
         )
       LIMIT 1`,
      [input.verificationAssertionId, entityId],
    );
    if (!evidence.rows[0]) {
      throw new Error('identifier verification assertion must be published, sourced, and belong to the entity');
    }

    const identifier = await tx.query<{ id: string }>(
      `INSERT INTO identifiers (
         kind_code, value, normalized_value, display_value, match_scope, status
       ) VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (kind_code, normalized_value)
       DO UPDATE SET
         display_value = EXCLUDED.display_value,
         status = 'active',
         updated_at = now()
       RETURNING id::text`,
      [input.kind, input.value.trim(), normalized, display, matchScope],
    );
    const identifierId = identifier.rows[0]?.id;
    if (!identifierId) throw new Error('identifier insert failed');

    const conflict = await tx.query<{ entity_id: string }>(
      `SELECT entity_id::text
       FROM identifier_assignments
       WHERE identifier_id = $1
         AND state = 'verified'
         AND valid_to IS NULL
         AND entity_id <> $2
       LIMIT 1`,
      [identifierId, entityId],
    );
    if (conflict.rows[0]) throw new Error('identifier is already verified for another entity');

    await tx.query(
      `INSERT INTO identifier_assignments (
         identifier_id, entity_id, state, verification_assertion_id, valid_from
       ) VALUES ($1, $2, 'verified', $3, now())
       ON CONFLICT (identifier_id, entity_id)
       DO UPDATE SET
         state = 'verified',
         verification_assertion_id = EXCLUDED.verification_assertion_id,
         valid_from = COALESCE(identifier_assignments.valid_from, now()),
         valid_to = NULL`,
      [identifierId, entityId, input.verificationAssertionId],
    );
    await tx.query(
      `INSERT INTO review_events (
         subject_type, subject_id, action, reviewer_id, rationale
       ) VALUES ('identifier-assignment', $1, 'approved', $2, $3)`,
      [identifierId, reviewer, `Verified ${input.kind} identifier for entity ${input.entityPublicId}`],
    );
    return { identifierId, entityId };
  });
}

function normalizeIdentifier(kind: AssignVerifiedIdentifierInput['kind'], value: string): string {
  const raw = value.trim();
  if (!raw || raw.length > 500) throw new Error('invalid identifier value');
  if (kind === 'domain') {
    if (/[\s/@:#?\\]/.test(raw)) throw new Error('invalid domain identifier');
    const normalized = new URL('https://' + raw).hostname.toLowerCase().replace(/\.$/, '');
    if (normalized !== raw.toLowerCase().replace(/\.$/, ''))
      throw new Error('domain must be a normalized ASCII hostname');
    return normalized;
  }
  if (kind === 'x' || kind === 'tiktok' || kind === 'instagram') {
    const handle = raw.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._-]{1,100}$/.test(handle)) throw new Error('invalid social handle');
    return handle;
  }
  if (raw.startsWith('@')) {
    const handle = '@' + raw.slice(1).toLowerCase();
    if (!/^@[a-z0-9._-]{1,100}$/.test(handle)) throw new Error('invalid YouTube handle');
    return handle;
  }
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(raw)) throw new Error('invalid YouTube channel identifier');
  return raw;
}
