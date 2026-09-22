import process from 'node:process';
import { FileArtifactStore, PgSqlExecutor } from '@isnotreal/persistence/runtime';
import { captureSourceDocument } from '@isnotreal/persistence/source-capture';
import {
  commitOfficialImport,
  markOfficialImportReady,
  prepareTrustedOfficialImport,
  stageCampaignImport,
} from '@isnotreal/persistence/campaign-import';
import { parseCcfpOctober2023Html } from '@isnotreal/persistence/official-source-parsers';

const databaseUrl = process.env.DATABASE_URL?.trim();
const artifactRoot = process.env.PUBLICATION_ROOT?.trim() || '.local/publications';
const actor = process.env.IMPORT_ACTOR_ID?.trim() || 'trusted-import';
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const prepare = process.argv.includes('--prepare') || process.argv.includes('--commit-if-clean');
const commitIfClean = process.argv.includes('--commit-if-clean');
const db = PgSqlExecutor.create({
  connectionString: databaseUrl,
  maxConnections: 2,
  applicationName: 'isnotreal-ccfp-import',
});
const store = new FileArtifactStore(artifactRoot);

try {
  const context = await db.query<{
    campaign_version_id: string;
    source_document_id: string;
  }>(
    `SELECT version.id::text AS campaign_version_id,
            version.source_document_id::text AS source_document_id
     FROM campaign_versions version
     JOIN campaigns campaign ON campaign.id = version.campaign_id
     WHERE campaign.slug = 'ccfp-october-2023-open-letter'
     ORDER BY version.version DESC
     LIMIT 1`,
  );
  const row = context.rows[0];
  if (!row) throw new Error('CCFP campaign seed is missing');

  const capture = await captureSourceDocument(db, store, row.source_document_id);
  const html = new TextDecoder().decode(await store.get(capture.storageKey));
  const rows = parseCcfpOctober2023Html(html);

  const existing = await db.query<{ id: string; state: string }>(
    `SELECT id::text, state
     FROM official_import_batches
     WHERE campaign_version_id = $1
       AND reason_code = 'I02'
       AND source_capture_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [row.campaign_version_id, capture.captureId],
  );

  let batchId = existing.rows[0]?.id;
  let staged:
    | {
        readonly batchId: string;
        readonly rowCount: number;
        readonly candidateRows: number;
        readonly ambiguousRows: number;
        readonly unresolvedRows: number;
      }
    | null = null;
  if (!batchId) {
    staged = await stageCampaignImport(db, {
      campaignVersionId: row.campaign_version_id,
      reasonCode: 'I02',
      sourceCaptureId: capture.captureId,
      importKind: 'signatory-list',
      createdBy: actor,
      rows,
    });
    batchId = staged.batchId;
  }

  const result: Record<string, unknown> = {
    source: 'Creative Community for Peace October 12, 2023 open letter',
    captureId: capture.captureId,
    sha256: capture.sha256,
    parsedRows: rows.length,
    batchId,
    reusedBatch: staged === null,
    staged,
  };

  if (prepare) {
    const batch = await db.query<{ state: string }>(
      `SELECT state FROM official_import_batches WHERE id = $1`,
      [batchId],
    );
    if (batch.rows[0]?.state === 'staged' || batch.rows[0]?.state === 'resolving') {
      result.prepared = await prepareTrustedOfficialImport(db, batchId, 'person', actor);
    }
    const unresolved = await db.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM official_import_rows
       WHERE batch_id = $1
         AND resolution_state IN ('candidate','ambiguous','unresolved','new-entity-needed')`,
      [batchId],
    );
    result.rowsNeedingReview = unresolved.rows[0]?.count ?? 0;

    if (commitIfClean && result.rowsNeedingReview === 0) {
      const current = await db.query<{ state: string }>(
        `SELECT state FROM official_import_batches WHERE id = $1`,
        [batchId],
      );
      if (current.rows[0]?.state !== 'ready') await markOfficialImportReady(db, batchId, actor);
      result.committed = await commitOfficialImport(db, batchId, actor);
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally {
  await db.close();
}
