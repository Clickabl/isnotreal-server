import { createHash, createPrivateKey, sign } from 'node:crypto';
import {
  PROTOCOL_SCHEMA_VERSION,
  canonicalJson,
  type FullPublication,
  type PublicationManifest,
  type PublicationDelta,
  type FullSyncRequired,
  type PublicationChannel,
  type ListKind,
} from '@isnotreal/protocol';
import {
  compileFullPublication,
  compilePublicationDelta,
  type PublicationReader,
} from '@isnotreal/application';
import { PostgresPublicationCandidateReader, type SqlExecutor } from './index.js';
import type { ArtifactStore } from './runtime.js';

export class PublicationUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() {
    super('No compatible publication is available for this cause');
  }
}
interface ArtifactRow {
  storage_key: string;
  sha256: string;
  byte_size: string;
  version: string;
}
const channels: readonly PublicationChannel[] = [
  'x',
  'tiktok',
  'instagram',
  'youtube',
  'domain',
  'domain-subdomains',
];
const lists: readonly ListKind[] = ['filter', 'highlight'];
const MAX_BYTES = 64 * 1024 * 1024;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

export class PostgresPublishedArtifactReader implements PublicationReader {
  constructor(
    private readonly db: SqlExecutor,
    private readonly store: ArtifactStore,
  ) {}
  async manifest(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
  ): Promise<PublicationManifest> {
    return this.read<PublicationManifest>(cause, channel, list, 'manifest');
  }
  async full(cause: string, channel: PublicationChannel, list: ListKind): Promise<FullPublication> {
    return this.read<FullPublication>(cause, channel, list, 'full');
  }
  async delta(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
    fromVersion: string,
  ): Promise<PublicationDelta | FullSyncRequired> {
    const current = await this.manifest(cause, channel, list);
    if (fromVersion === current.version)
      return {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        cause,
        channel,
        list,
        fromVersion,
        toVersion: current.version,
        reasonCatalogVersion: current.reasonCatalogVersion,
        added: [],
        removed: [],
      };
    const row = await this.metadata(cause, channel, list, 'delta', fromVersion);
    if (!row || row.version !== current.version)
      return {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
        code: 'FULL_SYNC_REQUIRED',
        cause,
        channel,
        list,
        currentVersion: current.version,
        currentReasonCatalogVersion: current.reasonCatalogVersion,
      };
    const value = await this.decode<PublicationDelta>(row);
    if (
      value.cause !== cause ||
      value.channel !== channel ||
      value.list !== list ||
      value.fromVersion !== fromVersion ||
      value.toVersion !== current.version ||
      value.schemaVersion !== PROTOCOL_SCHEMA_VERSION
    )
      throw new Error('delta identity mismatch');
    return value;
  }
  private async metadata(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
    kind: string,
    base: string | null = null,
  ): Promise<ArtifactRow | null> {
    const result = await this.db.query<ArtifactRow>(
      `SELECT a.storage_key, a.sha256, a.byte_size::text, a.version
      FROM publications p JOIN causes c ON c.id=p.cause_id
      JOIN publication_artifacts a ON a.publication_id=p.id
      WHERE c.slug=$1 AND c.active AND p.state='active' AND p.protocol_version=$5
        AND a.channel=$2 AND a.list_kind=$3 AND a.artifact_kind=$4
        AND ($6::text IS NULL OR a.base_version=$6) LIMIT 1`,
      [cause, channel, list, kind, PROTOCOL_SCHEMA_VERSION, base],
    );
    return result.rows[0] ?? null;
  }
  private async decode<T>(row: ArtifactRow): Promise<T> {
    const bytes = await this.store.get(row.storage_key);
    if (
      bytes.length > MAX_BYTES ||
      bytes.length !== Number(row.byte_size) ||
      digest(bytes) !== row.sha256
    ) {
      throw new Error('publication artifact integrity failure');
    }
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
  }
  private async read<T extends PublicationManifest>(
    cause: string,
    channel: PublicationChannel,
    list: ListKind,
    kind: string,
  ): Promise<T> {
    const row = await this.metadata(cause, channel, list, kind);
    if (!row) throw new PublicationUnavailableError();
    const value = await this.decode<T>(row);
    if (
      value.schemaVersion !== PROTOCOL_SCHEMA_VERSION ||
      value.cause !== cause ||
      value.channel !== channel ||
      value.list !== list ||
      value.version !== row.version
    ) {
      throw new Error('publication identity mismatch');
    }
    return value;
  }
}

export interface PublishCurrentStateOptions {
  readonly cause?: string;
  readonly compilerVersion: string;
  readonly sourceRevision: string;
  readonly expiresInMs?: number;
  readonly signing?: { readonly keyId: string; readonly privateKeyPem: string };
  /** Explicit test/development escape hatch. Production clients reject unsigned data. */
  readonly allowUnsignedDevelopment?: boolean;
}
export interface PublishCurrentStateResult {
  readonly cause: string;
  readonly publicationId: string;
  readonly version: string;
  readonly activated: boolean;
  readonly fullArtifactCount: number;
  readonly deltaArtifactCount: number;
  readonly warnings: readonly string[];
}
interface PublicationRow {
  id: string;
  sequence: string;
  generated_at: string;
  expires_at: string;
}

export async function publishCurrentState(
  db: SqlExecutor,
  store: ArtifactStore,
  options: PublishCurrentStateOptions,
): Promise<PublishCurrentStateResult> {
  const cause = options.cause ?? 'israel-palestine';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cause)) throw new Error('invalid cause');
  if (!options.signing && !options.allowUnsignedDevelopment)
    throw new Error('publication signing key is required');
  const key = options.signing ? createPrivateKey(options.signing.privateKeyPem) : null;
  if (key && key.asymmetricKeyType !== 'ed25519')
    throw new Error('an Ed25519 signing key is required');
  if (options.signing && !/^[A-Za-z0-9._-]{1,100}$/.test(options.signing.keyId))
    throw new Error('invalid signing key id');
  const ttl = options.expiresInMs ?? 48 * 60 * 60 * 1000;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 30 * 86400000)
    throw new Error('invalid publication TTL');
  const snapshot = await db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const c = await tx.query<{ id: string }>(
      'SELECT id::text FROM causes WHERE slug=$1 AND active',
      [cause],
    );
    const causeId = c.rows[0]?.id;
    if (!causeId) throw new Error('unknown or inactive cause');
    const catalog = await tx.query<{ version: number }>(
      "SELECT version FROM reason_catalog_versions WHERE state='active'",
    );
    const catalogVersion = catalog.rows[0]?.version;
    if (!catalogVersion) throw new Error('no active reason catalog');
    const publication = await tx.query<PublicationRow>(
      `INSERT INTO publications
      (cause_id, protocol_version, reason_catalog_version, compiler_version, source_revision, state, expires_at)
      VALUES ($1,$2,$3,$4,$5,'building',$6)
      RETURNING id::text, sequence::text, generated_at::text, expires_at::text`,
      [
        causeId,
        PROTOCOL_SCHEMA_VERSION,
        catalogVersion,
        options.compilerVersion,
        options.sourceRevision,
        new Date(Date.now() + ttl).toISOString(),
      ],
    );
    const p = publication.rows[0];
    if (!p) throw new Error('publication creation failed');
    const reasons = await tx.query<{ code: string; label: string }>(
      `SELECT e.reason_code AS code,e.label
      FROM reason_catalog_entries e JOIN reason_catalog_versions v ON v.id=e.catalog_version_id
      JOIN reason_causes rc ON rc.reason_code=e.reason_code
      WHERE v.version=$1 AND rc.cause_id=$2 ORDER BY e.reason_code`,
      [catalogVersion, causeId],
    );
    const reader = new PostgresPublicationCandidateReader(tx);
    const payloads: FullPublication[] = [];
    for (const channel of channels)
      for (const list of lists) {
        payloads.push(
          compileFullPublication({
            cause,
            channel,
            list,
            version: p.sequence,
            reasonCatalogVersion: catalogVersion,
            generatedAt: new Date(p.generated_at).toISOString(),
            expiresAt: new Date(p.expires_at).toISOString(),
            candidates: await reader.candidates(cause, channel, list),
          }),
        );
      }
    const policies = await tx.query<{ id: string }>(
      `SELECT DISTINCT policy_revision_id::text AS id
      FROM membership_decisions WHERE cause_id=$1 AND state='active'`,
      [causeId],
    );
    for (const policy of policies.rows)
      await tx.query(
        `INSERT INTO publication_policy_revisions (publication_id,policy_revision_id) VALUES ($1,$2)`,
        [p.id, policy.id],
      );
    return {
      p,
      causeId,
      catalogVersion,
      payloads,
      labels: reasons.rows.map((r) => [r.code, r.label]),
    };
  });
  const { p, causeId, catalogVersion, payloads, labels } = snapshot;
  const warnings: string[] = [];
  let deltaArtifactCount = 0;
  const records: {
    channel: PublicationChannel;
    list: ListKind;
    kind: string;
    base: string | null;
    path: string;
    hash: string;
    size: number;
    count: number;
  }[] = [];
  const previous = new PostgresPublishedArtifactReader(db, store);
  async function save(path: string, value: unknown) {
    const bytes = encode(value);
    if (bytes.length > MAX_BYTES) throw new Error('publication exceeds client size budget');
    await store.put(path, bytes);
    return { url: `/data/${path}`, sha256: digest(bytes), byteSize: bytes.length };
  }
  try {
    const prefix = `publications/${cause}/${p.sequence}`;
    const dictionary = await save(`${prefix}/dictionary.json`, {
      schemaVersion: PROTOCOL_SCHEMA_VERSION,
      catalogVersion,
      labels,
    });
    for (const payload of payloads) {
      const { channel, list } = payload;
      const path = `${prefix}/${channel}/${list}/full.json`;
      const full = await save(path, payload);
      records.push({
        channel,
        list,
        kind: 'full',
        base: null,
        path,
        hash: full.sha256,
        size: full.byteSize,
        count: payload.entries.length,
      });
      const { entries: _entries, ...header } = payload;
      void _entries;
      const unsigned = { ...header, full, dictionary };
      const signature =
        key && options.signing
          ? {
              algorithm: 'Ed25519' as const,
              keyId: options.signing.keyId,
              value: sign(null, Buffer.from(canonicalJson(unsigned)), key).toString('base64'),
            }
          : null;
      const manifest = { ...unsigned, signature };
      const manifestPath = `${prefix}/${channel}/${list}/manifest.json`;
      const descriptor = await save(manifestPath, manifest);
      records.push({
        channel,
        list,
        kind: 'manifest',
        base: null,
        path: manifestPath,
        hash: descriptor.sha256,
        size: descriptor.byteSize,
        count: 0,
      });
      try {
        const old = await previous.full(cause, channel, list);
        const delta = compilePublicationDelta(old, payload);
        const deltaPath = `${prefix}/${channel}/${list}/from-${old.version}.delta.json`;
        const d = await save(deltaPath, delta);
        records.push({
          channel,
          list,
          kind: 'delta',
          base: old.version,
          path: deltaPath,
          hash: d.sha256,
          size: d.byteSize,
          count: delta.added.length + delta.removed.length,
        });
        deltaArtifactCount++;
      } catch (error) {
        if (!(error instanceof PublicationUnavailableError))
          warnings.push(`Full sync required for ${channel}/${list}`);
      }
    }
    const activated = await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `publication:${cause}`,
      ]);
      for (const r of records)
        await tx.query(
          `INSERT INTO publication_artifacts
        (publication_id,channel,list_kind,artifact_kind,version,base_version,storage_key,sha256,byte_size,entry_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [p.id, r.channel, r.list, r.kind, p.sequence, r.base, r.path, r.hash, r.size, r.count],
        );
      const newer = await tx.query<{ id: string }>(
        `SELECT id::text FROM publications WHERE cause_id=$1 AND state='active' AND sequence>$2::bigint`,
        [causeId, p.sequence],
      );
      if (newer.rows.length) {
        await tx.query("UPDATE publications SET state='retired' WHERE id=$1", [p.id]);
        return false;
      }
      await tx.query(
        "UPDATE publications SET state='retired' WHERE cause_id=$1 AND state='active'",
        [causeId],
      );
      await tx.query(
        "UPDATE publications SET state='active',activated_at=now() WHERE id=$1 AND state='building'",
        [p.id],
      );
      return true;
    });
    return {
      cause,
      publicationId: p.id,
      version: p.sequence,
      activated,
      fullArtifactCount: payloads.length,
      deltaArtifactCount,
      warnings,
    };
  } catch (error) {
    await db.query("UPDATE publications SET state='failed' WHERE id=$1 AND state='building'", [
      p.id,
    ]);
    throw error;
  }
}
