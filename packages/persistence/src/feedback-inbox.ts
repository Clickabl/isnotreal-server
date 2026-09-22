import { feedbackStates, type FeedbackQueue, type FeedbackState } from '@isnotreal/application';
import type { SqlExecutor } from './index.js';

export class FeedbackRevisionError extends Error {
  constructor() {
    super('The report changed. Reload it before reviewing.');
    this.name = 'FeedbackRevisionError';
  }
}
export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackValidationError';
  }
}
interface InboxRow {
  id: string;
  entity_public_id: string | null;
  submission_type: string;
  queue: FeedbackQueue;
  state: FeedbackState;
  narrative: string;
  proposed_reason_code: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string;
  revision: number;
  duplicate_of: string | null;
  source_urls: string[];
  similar_count: number;
}
export interface InboxQuery {
  queue?: FeedbackQueue | null;
  state?: FeedbackState | 'open' | null;
  limit?: number;
  after?: { submittedAt: string; id: string } | null;
}
export class PostgresFeedbackInbox {
  constructor(private readonly db: SqlExecutor) {}
  async list(input: InboxQuery = {}) {
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new FeedbackValidationError('Invalid page size');
    const result = await this.db.query<InboxRow>(
      `SELECT s.id::text, e.public_id::text AS entity_public_id,
        s.submission_type, s.queue, s.state, s.narrative, s.proposed_reason_code,
        s.submitted_at::text, s.reviewed_at::text, s.reviewed_by, s.review_note,
        s.revision, s.duplicate_of::text,
        ARRAY(SELECT url FROM submission_sources WHERE submission_id=s.id ORDER BY created_at,id) AS source_urls,
        (SELECT count(*)::integer FROM community_submissions d WHERE d.content_fingerprint=s.content_fingerprint AND d.id<>s.id) AS similar_count
       FROM community_submissions s LEFT JOIN entities e ON e.id=s.entity_id
       WHERE ($1::text IS NULL OR s.queue=$1)
         AND ($2::text IS NULL OR ($2='open' AND s.state IN ('pending','triaged')) OR s.state=$2)
         AND ($3::timestamptz IS NULL OR (s.submitted_at,s.id)>($3::timestamptz,$4::uuid))
       ORDER BY s.submitted_at,s.id LIMIT $5`,
      [
        input.queue ?? null,
        input.state === undefined ? 'open' : input.state,
        input.after?.submittedAt ?? null,
        input.after?.id ?? null,
        limit + 1,
      ],
    );
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      reports: rows.map((row) => ({
        id: row.id,
        entityPublicId: row.entity_public_id,
        type: row.submission_type,
        queue: row.queue,
        state: row.state,
        narrative: row.narrative,
        reasonCode: row.proposed_reason_code,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        note: row.review_note,
        revision: row.revision,
        duplicateOf: row.duplicate_of,
        sourceUrls: row.source_urls,
        similarCount: row.similar_count,
      })),
      next:
        result.rows.length > limit && last ? { submittedAt: last.submitted_at, id: last.id } : null,
    };
  }
  async counts() {
    const result = await this.db.query<{ queue: string; state: string; count: number }>(
      'SELECT queue,state,count(*)::integer AS count FROM community_submissions GROUP BY queue,state ORDER BY queue,state',
    );
    return result.rows;
  }
  async duplicates(id: string) {
    const result = await this.db.query<{
      id: string;
      state: string;
      submitted_at: string;
      duplicate_of: string | null;
    }>(
      `SELECT d.id::text,d.state,d.submitted_at::text,d.duplicate_of::text
       FROM community_submissions s JOIN community_submissions d ON d.content_fingerprint=s.content_fingerprint AND d.id<>s.id
       WHERE s.id=$1 ORDER BY d.submitted_at,d.id LIMIT 20`,
      [id],
    );
    return result.rows.map((row) => ({
      id: row.id,
      state: row.state,
      submittedAt: row.submitted_at,
      duplicateOf: row.duplicate_of,
    }));
  }
  async review(
    id: string,
    input: {
      state: FeedbackState;
      expectedRevision: number;
      note: string;
      duplicateOf?: string | null;
    },
    actor: string,
  ) {
    const note = input.note.trim();
    if (!feedbackStates.includes(input.state) || input.state === 'pending')
      throw new FeedbackValidationError('Invalid review state');
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
      throw new FeedbackValidationError('Expected revision is required');
    if (!actor.trim() || note.length > 10000)
      throw new FeedbackValidationError('Invalid reviewer or note');
    if (['rejected', 'duplicate', 'spam'].includes(input.state) && note.length < 3)
      throw new FeedbackValidationError('Explain this review decision');
    return this.db.transaction(async (tx) => {
      let duplicateOf = null;
      if (input.state === 'duplicate') {
        if (!input.duplicateOf || input.duplicateOf === id)
          throw new FeedbackValidationError('Choose a different original report');
        const original = await tx.query<{ id: string }>(
          'SELECT id::text FROM community_submissions WHERE id=$1 AND duplicate_of IS NULL',
          [input.duplicateOf],
        );
        if (!original.rows[0])
          throw new FeedbackValidationError(
            'The original report is unavailable or itself a duplicate',
          );
        duplicateOf = original.rows[0].id;
      }
      const result = await tx.query<{ id: string; revision: number }>(
        `UPDATE community_submissions SET state=$2, reviewed_by=$3, reviewed_at=now(),review_note=$4,duplicate_of=$5,revision=revision+1
         WHERE id=$1 AND revision=$6 AND state IN ('pending','triaged') RETURNING id::text,revision`,
        [id, input.state, actor, note, duplicateOf, input.expectedRevision],
      );
      const row = result.rows[0];
      if (!row) throw new FeedbackRevisionError();
      await tx.query(
        `INSERT INTO review_events(subject_type,subject_id,action,reviewer_id,rationale)
         VALUES('community-submission',$1,$2,$3,$4)`,
        [
          id,
          input.state === 'accepted'
            ? 'approved'
            : input.state === 'triaged'
              ? 'submitted'
              : 'rejected',
          actor,
          JSON.stringify({ state: input.state, note, duplicateOf, revision: row.revision }),
        ],
      );
      return { ok: true, id: row.id, revision: row.revision, state: input.state };
    });
  }
}
