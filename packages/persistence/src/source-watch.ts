import type { SqlExecutor } from './index.js';
import { captureSourceDocument, type ArtifactStore } from './source-capture.js';

export interface SourceChangeEvent {
  readonly id: string;
  readonly documentId: string;
  readonly title: string;
  readonly url: string;
  readonly previousCaptureId: string;
  readonly newCaptureId: string;
  readonly state: 'pending' | 'reviewed' | 'ignored';
  readonly detectedAt: string;
}

export async function watchOfficialSources(
  db: SqlExecutor,
  store: ArtifactStore,
): Promise<{ readonly checked: number; readonly changed: number; readonly changes: readonly SourceChangeEvent[] }> {
  const documents = await db.query<{ id: string }>(
    `SELECT DISTINCT document.id::text
     FROM source_documents document
     LEFT JOIN reason_authority_sources authority ON authority.source_document_id = document.id
     LEFT JOIN campaign_versions version ON version.source_document_id = document.id
     WHERE authority.source_document_id IS NOT NULL OR version.source_document_id IS NOT NULL
     ORDER BY document.id`,
  );
  const changes: SourceChangeEvent[] = [];
  for (const document of documents.rows) {
    const previous = await db.query<{ id: string; content_hash: string | null }>(
      `SELECT id::text, content_hash
       FROM source_captures
       WHERE document_id = $1 AND status = 'available'
       ORDER BY retrieved_at DESC
       LIMIT 1`,
      [document.id],
    );
    const captured = await captureSourceDocument(db, store, document.id);
    const prior = previous.rows[0];
    if (!prior || prior.id === captured.captureId || prior.content_hash === captured.sha256) continue;
    await db.query(
      `INSERT INTO source_change_events (
         document_id, previous_capture_id, new_capture_id
       ) VALUES ($1, $2, $3)
       ON CONFLICT (new_capture_id) DO NOTHING`,
      [document.id, prior.id, captured.captureId],
    );
  }
  changes.push(...(await listSourceChanges(db, 'pending', 500)));
  return { checked: documents.rows.length, changed: changes.length, changes };
}

export async function listSourceChanges(
  db: SqlExecutor,
  state: 'pending' | 'reviewed' | 'ignored' = 'pending',
  limit = 200,
): Promise<readonly SourceChangeEvent[]> {
  const result = await db.query<{
    id: string;
    document_id: string;
    title: string;
    canonical_url: string;
    previous_capture_id: string;
    new_capture_id: string;
    state: 'pending' | 'reviewed' | 'ignored';
    detected_at: string;
  }>(
    `SELECT event.id::text,
            event.document_id::text,
            document.title,
            document.canonical_url,
            event.previous_capture_id::text,
            event.new_capture_id::text,
            event.state,
            event.detected_at::text
     FROM source_change_events event
     JOIN source_documents document ON document.id = event.document_id
     WHERE event.state = $1
     ORDER BY event.detected_at ASC
     LIMIT $2`,
    [state, Math.max(1, Math.min(limit, 500))],
  );
  return result.rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    title: row.title,
    url: row.canonical_url,
    previousCaptureId: row.previous_capture_id,
    newCaptureId: row.new_capture_id,
    state: row.state,
    detectedAt: row.detected_at,
  }));
}

export async function reviewSourceChange(
  db: SqlExecutor,
  id: string,
  state: 'reviewed' | 'ignored',
  reviewerId: string,
  note: string,
): Promise<void> {
  const reviewer = reviewerId.trim(),
    rationale = note.trim();
  if (!reviewer || !rationale) throw new Error('reviewer and note are required');
  await db.transaction(async (tx) => {
    const updated = await tx.query<{ id: string }>(
      `UPDATE source_change_events
       SET state = $2, reviewed_at = now(), reviewer_id = $3, review_note = $4
       WHERE id = $1 AND state = 'pending'
       RETURNING id::text`,
      [id, state, reviewer, rationale],
    );
    if (!updated.rows[0]) throw new Error('source change is not pending');
    await tx.query(
      `INSERT INTO review_events (
         subject_type, subject_id, action, reviewer_id, rationale
       ) VALUES ('source-change', $1, $2, $3, $4)`,
      [id, state === 'reviewed' ? 'approved' : 'rejected', reviewer, rationale],
    );
  });
}
