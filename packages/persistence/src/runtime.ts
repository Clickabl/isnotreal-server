import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import {
  PROTOCOL_SCHEMA_VERSION,
  compileFullPublication,
  compilePublicationDelta,
  type ListKind,
  type PublicationCandidate,
  type PublicationChannel,
  type PublicationReader,
} from '@isnotreal/application';
import {
  PostgresPublicationCandidateReader,
  type SqlExecutor,
  type SqlQueryResult,
} from './index.js';

export interface PgRuntimeOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMs?: number;
  readonly connectionTimeoutMs?: number;
  readonly applicationName?: string;
}

export class PgSqlExecutor implements SqlExecutor {
  private constructor(private readonly pool: Pool) {}

  static create(options: PgRuntimeOptions): PgSqlExecutor {
    const config: PoolConfig = {
      connectionString: options.connectionString,
      max: options.maxConnections ?? 20,
      idleTimeoutMillis: options.idleTimeoutMs ?? 30_000,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
      application_name: options.applicationName ?? 'isnotreal-server',
    };
    return new PgSqlExecutor(new Pool(config));
  }

  async query<Row extends object>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.pool.query(sql, [...params]);
    return { rows: result.rows as Row[] };
  }

  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PgClientExecutor(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original error. A broken connection will be discarded by pg.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PgClientExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends object>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.client.query(sql, [...params]);
    return { rows: result.rows as Row[] };
  }

  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return work(this);
  }
}

interface AppliedMigrationRow {
  readonly filename: string;
  readonly checksum: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

export async function applySqlMigrations(
  db: SqlExecutor,
  migrationsDirectory: string,
): Promise<MigrationResult> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const existing = await db.query<AppliedMigrationRow>(
    'SELECT filename, checksum FROM schema_migrations ORDER BY filename',
  );
  const appliedByName = new Map(existing.rows.map((row) => [row.filename, row.checksum]));
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && /^\d{4}_[a-z0-9_]+\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const filename of filenames) {
    const sql = await readFile(resolve(migrationsDirectory, filename), 'utf8');
    const checksum = sha256(sql);
    const previousChecksum = appliedByName.get(filename);
    if (previousChecksum !== undefined) {
      if (previousChecksum !== checksum) {
        throw new Error(`migration checksum mismatch: ${filename}`);
      }
      alreadyApplied.push(filename);
      continue;
    }

    const body = stripTransactionEnvelope(sql, filename);
    await db.transaction(async (tx) => {
      await tx.query(body);
      await tx.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
        filename,
        checksum,
      ]);
    });
    applied.push(filename);
  }

  return { applied, alreadyApplied };
}

function stripTransactionEnvelope(sql: string, filename: string): string {
  if (!/^\s*BEGIN;\s*/i.test(sql) || !/\s*COMMIT;\s*$/i.test(sql)) {
    throw new Error(`migration must be wrapped in BEGIN/COMMIT: ${filename}`);
  }
  return sql.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
}

export interface ArtifactStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

export class FileArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.pathForKey(key);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, target);
  }

  async get(key: string): Promise<Uint8Array> {
    return readFile(this.pathForKey(key));
  }

  private pathForKey(key: string): string {
    if (!/^[A-Za-z0-9._/-]+$/.test(key) || key.startsWith('/') || key.includes('..')) {
      throw new Error('invalid artifact storage key');
    }
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error('artifact storage key escaped root');
    }
    return target;
  }
}

type FullPublicationPayload = Awaited<ReturnType<PublicationReader['full']>>;
type DeltaPublicationPayload = Awaited<ReturnType<PublicationReader['delta']>>;

interface ArtifactMetadataRow {
  readonly version: string;
  readonly reason_catalog_version: number;
  readonly generated_at: string;
  readonly expires_at: string;
  readonly storage_key: string;
  readonly sha256: string;
  readonly byte_size: string;
  readonly base_version: string | null;
}

const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

export class PostgresPublishedArtifactReader implements PublicationReader {
  constructor(
    private readonly db: SqlExecutor,
    private readonly store: ArtifactStore,
  ) {}

  async manifest(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
  ): ReturnType<PublicationReader['manifest']> {
    const metadata = await this.currentFullMetadata(cause, channel, list);
    return {
      schemaVersion: PROTOCOL_SCHEMA_VERSION,
      cause,
      channel,
      list,
      version: metadata.version,
      reasonCatalogVersion: metadata.reason_catalog_version,
      generatedAt: metadata.generated_at,
      expiresAt: metadata.expires_at,
    };
  }

  async full(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
  ): ReturnType<PublicationReader['full']> {
    const metadata = await this.currentFullMetadata(cause, channel, list);
    return this.readFull(metadata, cause, channel, list);
  }

  async delta(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
    fromVersion: string,
  ): ReturnType<PublicationReader['delta']> {
    const current = await this.currentFullMetadata(cause, channel, list);
    if (fromVersion === current.version) {
      return {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        cause,
        channel,
        list,
        fromVersion,
        toVersion: current.version,
        reasonCatalogVersion: current.reason_catalog_version,
        added: [],
        removed: [],
      };
    }

    const result = await this.db.query<ArtifactMetadataRow>(
      `SELECT
         pa.version,
         p.reason_catalog_version,
         p.generated_at::text,
         p.expires_at::text,
         pa.storage_key,
         pa.sha256,
         pa.byte_size::text,
         pa.base_version
       FROM publications p
       JOIN publication_artifacts pa ON pa.publication_id = p.id
       JOIN causes cause ON cause.id = p.cause_id
       WHERE p.state = 'active'
         AND cause.slug = $1
         AND pa.channel = $2
         AND pa.list_kind = $3
         AND pa.artifact_kind = 'delta'
         AND pa.base_version = $4
         AND pa.version = $5
       LIMIT 1`,
      [cause, channel, list, fromVersion, current.version],
    );
    const metadata = result.rows[0];
    if (!metadata) {
      return {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        code: 'FULL_SYNC_REQUIRED',
        cause,
        channel,
        list,
        currentVersion: current.version,
        currentReasonCatalogVersion: current.reason_catalog_version,
      };
    }

    const bytes = await this.readVerifiedBytes(metadata);
    return parseDeltaPublication(
      bytes,
      cause,
      channel,
      list,
      fromVersion,
      current.version,
      current.reason_catalog_version,
    );
  }

  private async currentFullMetadata(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
  ): Promise<ArtifactMetadataRow> {
    const result = await this.db.query<ArtifactMetadataRow>(
      `SELECT
         pa.version,
         p.reason_catalog_version,
         p.generated_at::text,
         p.expires_at::text,
         pa.storage_key,
         pa.sha256,
         pa.byte_size::text,
         pa.base_version
       FROM publications p
       JOIN publication_artifacts pa ON pa.publication_id = p.id
       JOIN causes cause ON cause.id = p.cause_id
       WHERE p.state = 'active'
         AND cause.slug = $1
         AND pa.channel = $2
         AND pa.list_kind = $3
         AND pa.artifact_kind = 'full'
       LIMIT 1`,
      [cause, channel, list],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`no active publication artifact for ${channel}/${list}`);
    return row;
  }

  private async readFull(
    metadata: ArtifactMetadataRow,
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
  ): Promise<FullPublicationPayload> {
    const bytes = await this.readVerifiedBytes(metadata);
    return parseFullPublication(
      bytes,
      cause,
      channel,
      list,
      metadata.version,
      metadata.reason_catalog_version,
    );
  }

  private async readVerifiedBytes(metadata: ArtifactMetadataRow): Promise<Uint8Array> {
    const expectedSize = Number(metadata.byte_size);
    if (
      !Number.isSafeInteger(expectedSize) ||
      expectedSize < 0 ||
      expectedSize > MAX_ARTIFACT_BYTES
    ) {
      throw new Error('publication artifact size is invalid');
    }
    const bytes = await this.store.get(metadata.storage_key);
    if (bytes.byteLength !== expectedSize) throw new Error('publication artifact size mismatch');
    if (sha256(bytes) !== metadata.sha256)
      throw new Error('publication artifact checksum mismatch');
    return bytes;
  }
}

interface PublicationInsertRow {
  readonly id: string;
  readonly sequence: string;
  readonly reason_catalog_version: number;
  readonly generated_at: string;
  readonly expires_at: string;
}

interface PolicyRevisionRow {
  readonly policy_revision_id: string;
}

interface ExistingFullArtifactRow extends ArtifactMetadataRow {
  readonly cause_slug: string;
  readonly channel: PublicationChannel;
  readonly list_kind: ListKind;
}

interface ArtifactRecord {
  readonly cause: string;
  readonly channel: PublicationChannel;
  readonly list: ListKind;
  readonly kind: 'full' | 'delta';
  readonly version: string;
  readonly baseVersion: string | null;
  readonly storageKey: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly entryCount: number;
}

export interface PublishCurrentStateOptions {
  readonly compilerVersion: string;
  readonly sourceRevision: string;
  readonly expiresInMs?: number;
}

export interface PublishCurrentStateResult {
  readonly publicationId: string;
  readonly version: string;
  readonly activated: boolean;
  readonly fullArtifactCount: number;
  readonly deltaArtifactCount: number;
  readonly warnings: readonly string[];
}

const publicationChannels: readonly PublicationChannel[] = [
  'x',
  'tiktok',
  'instagram',
  'youtube',
  'domain',
  'domain-subdomains',
];
const publicationLists: readonly ListKind[] = ['filter', 'highlight'];

export async function publishCurrentState(
  db: SqlExecutor,
  store: ArtifactStore,
  options: PublishCurrentStateOptions,
): Promise<PublishCurrentStateResult> {
  const expiresInMs = options.expiresInMs ?? 48 * 60 * 60 * 1_000;
  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    throw new Error('publication expiry must be positive');
  }

  const snapshot = await loadPublicationSnapshot(db);
  const previous = await loadActiveFullArtifacts(db);
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  const inserted = await db.query<PublicationInsertRow>(
    `INSERT INTO publications (
       protocol_version, reason_catalog_version, compiler_version, source_revision, state, expires_at
     ) VALUES ($1, $2, $3, $4, 'building', $5)
     RETURNING
       id::text,
       sequence::text,
       reason_catalog_version,
       generated_at::text,
       expires_at::text`,
    [
      PROTOCOL_SCHEMA_VERSION,
      snapshot.reasonCatalogVersion,
      options.compilerVersion,
      options.sourceRevision,
      expiresAt,
    ],
  );
  const publication = inserted.rows[0];
  if (!publication) throw new Error('publication insert did not return a row');

  const artifacts: ArtifactRecord[] = [];
  const warnings: string[] = [];

  try {
    const fullByKey = new Map<string, FullPublicationPayload>();
    for (const cause of snapshot.causes) {
      for (const channel of publicationChannels) {
        for (const list of publicationLists) {
          const key = publicationKey(cause, channel, list);
          const payload = compileFullPublication({
            cause,
            channel,
            list,
            version: publication.sequence,
            reasonCatalogVersion: publication.reason_catalog_version,
            generatedAt: publication.generated_at,
            expiresAt: publication.expires_at,
            candidates: snapshot.candidates.get(key) ?? [],
          });
          fullByKey.set(key, payload);
          artifacts.push(
            await writeArtifact(
              store,
              `publications/${publication.sequence}/${cause}/${channel}/${list}/full.json`,
              cause,
              channel,
              list,
              'full',
              publication.sequence,
              null,
              payload,
              payload.entries.length,
            ),
          );
        }
      }
    }

    for (const [key, previousMetadata] of previous) {
      const next = fullByKey.get(key);
      if (!next) continue;
      try {
        const previousBytes = await readVerifiedBytesFromStore(store, previousMetadata);
        const old = parseFullPublication(
          previousBytes,
          previousMetadata.cause_slug,
          previousMetadata.channel,
          previousMetadata.list_kind,
          previousMetadata.version,
          previousMetadata.reason_catalog_version,
        );
        const delta = compilePublicationDelta(old, next);
        artifacts.push(
          await writeArtifact(
            store,
            `publications/${publication.sequence}/${next.cause}/${next.channel}/${next.list}/from-${old.version}.delta.json`,
            next.cause,
            next.channel,
            next.list,
            'delta',
            publication.sequence,
            old.version,
            delta,
            delta.added.length + delta.removed.length,
          ),
        );
      } catch (error) {
        warnings.push(`delta skipped for ${key}: ${errorMessage(error)}`);
      }
    }

    await db.transaction(async (tx) => {
      for (const policyRevisionId of snapshot.policyRevisionIds) {
        await tx.query(
          `INSERT INTO publication_policy_revisions (publication_id, policy_revision_id)
           VALUES ($1, $2)`,
          [publication.id, policyRevisionId],
        );
      }
      for (const artifact of artifacts) {
        await tx.query(
          `INSERT INTO publication_artifacts (
             publication_id, channel, list_kind, artifact_kind, version, base_version,
             storage_key, sha256, byte_size, entry_count
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            publication.id,
            artifact.channel,
            artifact.list,
            artifact.kind,
            artifact.version,
            artifact.baseVersion,
            artifact.storageKey,
            artifact.sha256,
            artifact.byteSize,
            artifact.entryCount,
          ],
        );
      }
      await tx.query(
        "UPDATE publications SET state = 'ready' WHERE id = $1 AND state = 'building'",
        [publication.id],
      );
    });

    const activated = await activatePublication(db, publication.id, publication.sequence);
    return {
      publicationId: publication.id,
      version: publication.sequence,
      activated,
      fullArtifactCount: artifacts.filter((artifact) => artifact.kind === 'full').length,
      deltaArtifactCount: artifacts.filter((artifact) => artifact.kind === 'delta').length,
      warnings,
    };
  } catch (error) {
    try {
      await db.query(
        "UPDATE publications SET state = 'failed' WHERE id = $1 AND state IN ('building', 'ready')",
        [publication.id],
      );
    } catch {
      // The original publication failure is more useful to the caller.
    }
    throw error;
  }
}

interface PublicationSnapshot {
  readonly candidates: ReadonlyMap<string, readonly PublicationCandidate[]>;
  readonly policyRevisionIds: readonly string[];
  readonly reasonCatalogVersion: number;
  readonly causes: readonly string[];
}

async function loadPublicationSnapshot(db: SqlExecutor): Promise<PublicationSnapshot> {
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const reader = new PostgresPublicationCandidateReader(tx);
    const candidates = new Map<string, readonly PublicationCandidate[]>();
    const causesResult = await tx.query<{ slug: string }>(
      `SELECT slug FROM causes WHERE active = true ORDER BY sort_order, slug`,
    );
    for (const cause of causesResult.rows.map((row) => row.slug)) {
      for (const channel of publicationChannels) {
        for (const list of publicationLists) {
          candidates.set(
            publicationKey(cause, channel, list),
            await reader.candidates(cause, channel, list),
          );
        }
      }
    }
    const revisions = await tx.query<PolicyRevisionRow>(
      `SELECT DISTINCT policy_revision_id::text
       FROM membership_decisions
       WHERE state = 'active'
       ORDER BY policy_revision_id::text`,
    );
    const causesResult = await tx.query<{ slug: string }>(
      `SELECT slug FROM causes WHERE active = true ORDER BY sort_order, slug`,
    );
    const reasonCatalog = await tx.query<{ version: number }>(
      `SELECT version FROM reason_catalog_versions WHERE state = 'active' LIMIT 1`,
    );
    const reasonCatalogVersion = reasonCatalog.rows[0]?.version;
    if (!reasonCatalogVersion) throw new Error('no active reason catalog version');
    return {
      candidates,
      policyRevisionIds: revisions.rows.map((row) => row.policy_revision_id),
      reasonCatalogVersion,
      causes: causesResult.rows.map((row) => row.slug),
    };
  });
}

async function loadActiveFullArtifacts(
  db: SqlExecutor,
): Promise<ReadonlyMap<string, ExistingFullArtifactRow>> {
  const result = await db.query<ExistingFullArtifactRow>(
    `SELECT
       pa.channel,
       pa.list_kind,
       pa.version,
       p.reason_catalog_version,
       p.generated_at::text,
       p.expires_at::text,
       pa.storage_key,
       pa.sha256,
       pa.byte_size::text,
       pa.base_version
     FROM publications p
     JOIN publication_artifacts pa ON pa.publication_id = p.id
     WHERE p.state = 'active' AND pa.artifact_kind = 'full'`,
  );
  return new Map(result.rows.map((row) => [publicationKey(row.channel, row.list_kind), row]));
}

async function activatePublication(
  db: SqlExecutor,
  publicationId: string,
  sequence: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('isnotreal-publication-activate'))");
    const latest = await tx.query<{ max_sequence: string | null }>(
      `SELECT max(sequence)::text AS max_sequence
       FROM publications
       WHERE state IN ('building', 'ready', 'active')`,
    );
    if (latest.rows[0]?.max_sequence !== sequence) {
      await tx.query(
        "UPDATE publications SET state = 'retired' WHERE id = $1 AND state = 'ready'",
        [publicationId],
      );
      return false;
    }

    await tx.query("UPDATE publications SET state = 'retired' WHERE state = 'active'");
    const activated = await tx.query<{ id: string }>(
      `UPDATE publications
       SET state = 'active', activated_at = now()
       WHERE id = $1 AND state = 'ready'
       RETURNING id::text`,
      [publicationId],
    );
    return activated.rows.length === 1;
  });
}

async function writeArtifact(
  store: ArtifactStore,
  storageKey: string,
  cause: string,
  channel: PublicationChannel,
  list: ListKind,
  kind: 'full' | 'delta',
  version: string,
  baseVersion: string | null,
  payload: unknown,
  entryCount: number,
): Promise<ArtifactRecord> {
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  await store.put(storageKey, bytes);
  return {
    cause,
    channel,
    list,
    kind,
    version,
    baseVersion,
    storageKey,
    sha256: sha256(bytes),
    byteSize: bytes.byteLength,
    entryCount,
  };
}

async function readVerifiedBytesFromStore(
  store: ArtifactStore,
  metadata: ArtifactMetadataRow,
): Promise<Uint8Array> {
  const expectedSize = Number(metadata.byte_size);
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize < 0 ||
    expectedSize > MAX_ARTIFACT_BYTES
  ) {
    throw new Error('publication artifact size is invalid');
  }
  const bytes = await store.get(metadata.storage_key);
  if (bytes.byteLength !== expectedSize) throw new Error('publication artifact size mismatch');
  if (sha256(bytes) !== metadata.sha256) throw new Error('publication artifact checksum mismatch');
  return bytes;
}

function parseFullPublication(
  bytes: Uint8Array,
  cause: string,
  channel: PublicationChannel,
  list: ListKind,
  version: string,
  reasonCatalogVersion: number,
): FullPublicationPayload {
  const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (!isRecord(parsed)) throw new Error('publication artifact is not an object');
  if (
    parsed.schemaVersion !== PROTOCOL_SCHEMA_VERSION ||
    parsed.cause !== cause ||
    parsed.channel !== channel ||
    parsed.list !== list ||
    parsed.version !== version ||
    parsed.reasonCatalogVersion !== reasonCatalogVersion ||
    typeof parsed.generatedAt !== 'string' ||
    typeof parsed.expiresAt !== 'string' ||
    !Array.isArray(parsed.entries) ||
    !parsed.entries.every(isCompiledEntry)
  ) {
    throw new Error('publication artifact failed validation');
  }
  return parsed as unknown as FullPublicationPayload;
}

function parseDeltaPublication(
  bytes: Uint8Array,
  cause: string,
  channel: PublicationChannel,
  list: ListKind,
  fromVersion: string,
  toVersion: string,
  reasonCatalogVersion: number,
): DeltaPublicationPayload {
  const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (!isRecord(parsed)) throw new Error('delta artifact is not an object');
  if (
    parsed.schemaVersion !== PROTOCOL_SCHEMA_VERSION ||
    parsed.cause !== cause ||
    parsed.channel !== channel ||
    parsed.list !== list ||
    parsed.fromVersion !== fromVersion ||
    parsed.toVersion !== toVersion ||
    parsed.reasonCatalogVersion !== reasonCatalogVersion ||
    !Array.isArray(parsed.added) ||
    !parsed.added.every(isCompiledEntry) ||
    !Array.isArray(parsed.removed) ||
    !parsed.removed.every((identifier) => typeof identifier === 'string')
  ) {
    throw new Error('delta artifact failed validation');
  }
  return parsed as unknown as DeltaPublicationPayload;
}

function isCompiledEntry(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string' &&
    Array.isArray(value[2]) &&
    value[2].every((reason) => typeof reason === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicationKey(cause: string, channel: PublicationChannel, list: ListKind): string {
  return `${cause}:${channel}:${list}`;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
