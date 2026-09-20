from pathlib import Path
import json

def write(path, text):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.lstrip('\n'))

p = Path('packages/protocol/src/index.ts')
s = p.read_text().replace('PROTOCOL_SCHEMA_VERSION = 4', 'PROTOCOL_SCHEMA_VERSION = 5')
s = s.replace('export interface PublicationManifest {', '''export interface ArtifactDescriptor {
  readonly url: string;
  readonly sha256: string;
  readonly byteSize: number;
}

export interface PublicationSignature {
  readonly algorithm: 'Ed25519';
  readonly keyId: string;
  readonly value: string;
}

export interface PublicationManifest {
  readonly full?: ArtifactDescriptor;
  readonly dictionary?: ArtifactDescriptor;
  readonly signature?: PublicationSignature | null;''')
s += "\nexport { canonicalJson } from './canonical.js';\n"
p.write_text(s)
write('packages/protocol/src/canonical.ts', r'''
/** Deterministic JSON for signatures and reconstructed delta verification. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  throw new Error('unsupported canonical JSON value');
}
''')
# Keep the existing driver, migration checksums and artifact-store boundary.
p = Path('packages/persistence/src/runtime.ts')
s = p.read_text()
s = s[:s.index('type FullPublicationPayload =')]
a = s.index('import {\n  PROTOCOL_SCHEMA_VERSION,')
b = s.index('export interface PgRuntimeOptions', a)
s = s[:a] + "import type { SqlExecutor, SqlQueryResult } from './index.js';\nexport { PostgresPublishedArtifactReader, publishCurrentState, PublicationUnavailableError } from './publications.js';\nexport type { PublishCurrentStateOptions, PublishCurrentStateResult } from './publications.js';\n\n" + s[b:]
s += "\nfunction sha256(value: string | Uint8Array): string {\n  return createHash('sha256').update(value).digest('hex');\n}\n"
p.write_text(s)
write('packages/persistence/src/publications.ts', r'''
import { createHash, createPrivateKey, sign } from 'node:crypto';
import {
  PROTOCOL_SCHEMA_VERSION, canonicalJson,
  type FullPublication, type PublicationManifest, type PublicationDelta,
  type FullSyncRequired, type PublicationChannel, type ListKind,
} from '@isnotreal/protocol';
import { compileFullPublication, compilePublicationDelta, type PublicationReader } from '@isnotreal/application';
import { PostgresPublicationCandidateReader, type SqlExecutor } from './index.js';
import type { ArtifactStore } from './runtime.js';

export class PublicationUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() { super('No compatible publication is available for this cause'); }
}
interface ArtifactRow {
  storage_key: string; sha256: string; byte_size: string; version: string;
}
const channels: readonly PublicationChannel[] = ['x', 'tiktok', 'instagram', 'youtube', 'domain', 'domain-subdomains'];
const lists: readonly ListKind[] = ['filter', 'highlight'];
const MAX_BYTES = 64 * 1024 * 1024;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

export class PostgresPublishedArtifactReader implements PublicationReader {
  constructor(private readonly db: SqlExecutor, private readonly store: ArtifactStore) {}
  async manifest(cause: string, channel: PublicationChannel, list: ListKind): Promise<PublicationManifest> {
    return this.read<PublicationManifest>(cause, channel, list, 'manifest');
  }
  async full(cause: string, channel: PublicationChannel, list: ListKind): Promise<FullPublication> {
    return this.read<FullPublication>(cause, channel, list, 'full');
  }
  async delta(cause: string, channel: PublicationChannel, list: ListKind, fromVersion: string): Promise<PublicationDelta | FullSyncRequired> {
    const current = await this.manifest(cause, channel, list);
    if (fromVersion === current.version) return {
      schemaVersion: PROTOCOL_SCHEMA_VERSION, cause, channel, list,
      fromVersion, toVersion: current.version, reasonCatalogVersion: current.reasonCatalogVersion,
      added: [], removed: [],
    };
    const row = await this.metadata(cause, channel, list, 'delta', fromVersion);
    if (!row || row.version !== current.version) return {
      schemaVersion: PROTOCOL_SCHEMA_VERSION, code: 'FULL_SYNC_REQUIRED', cause, channel, list,
      currentVersion: current.version, currentReasonCatalogVersion: current.reasonCatalogVersion,
    };
    const value = await this.decode<PublicationDelta>(row);
    if (value.cause !== cause || value.channel !== channel || value.list !== list ||
        value.fromVersion !== fromVersion || value.toVersion !== current.version ||
        value.schemaVersion !== PROTOCOL_SCHEMA_VERSION) throw new Error('delta identity mismatch');
    return value;
  }
  private async metadata(cause: string, channel: PublicationChannel, list: ListKind, kind: string, base: string | null = null): Promise<ArtifactRow | null> {
    const result = await this.db.query<ArtifactRow>(`SELECT a.storage_key, a.sha256, a.byte_size::text, a.version
      FROM publications p JOIN causes c ON c.id=p.cause_id
      JOIN publication_artifacts a ON a.publication_id=p.id
      WHERE c.slug=$1 AND c.active AND p.state='active' AND p.protocol_version=$5
        AND a.channel=$2 AND a.list_kind=$3 AND a.artifact_kind=$4
        AND ($6::text IS NULL OR a.base_version=$6) LIMIT 1`,
      [cause, channel, list, kind, PROTOCOL_SCHEMA_VERSION, base]);
    return result.rows[0] ?? null;
  }
  private async decode<T>(row: ArtifactRow): Promise<T> {
    const bytes = await this.store.get(row.storage_key);
    if (bytes.length > MAX_BYTES || bytes.length !== Number(row.byte_size) || digest(bytes) !== row.sha256) {
      throw new Error('publication artifact integrity failure');
    }
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
  }
  private async read<T extends PublicationManifest>(cause: string, channel: PublicationChannel, list: ListKind, kind: string): Promise<T> {
    const row = await this.metadata(cause, channel, list, kind);
    if (!row) throw new PublicationUnavailableError();
    const value = await this.decode<T>(row);
    if (value.schemaVersion !== PROTOCOL_SCHEMA_VERSION || value.cause !== cause ||
        value.channel !== channel || value.list !== list || value.version !== row.version) {
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
  readonly cause: string; readonly publicationId: string; readonly version: string;
  readonly activated: boolean; readonly fullArtifactCount: number;
  readonly deltaArtifactCount: number; readonly warnings: readonly string[];
}
interface PublicationRow { id: string; sequence: string; generated_at: string; expires_at: string }

export async function publishCurrentState(db: SqlExecutor, store: ArtifactStore, options: PublishCurrentStateOptions): Promise<PublishCurrentStateResult> {
  const cause = options.cause ?? 'israel-palestine';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cause)) throw new Error('invalid cause');
  if (!options.signing && !options.allowUnsignedDevelopment) throw new Error('publication signing key is required');
  const key = options.signing ? createPrivateKey(options.signing.privateKeyPem) : null;
  if (key && key.asymmetricKeyType !== 'ed25519') throw new Error('an Ed25519 signing key is required');
  if (options.signing && !/^[A-Za-z0-9._-]{1,100}$/.test(options.signing.keyId)) throw new Error('invalid signing key id');
  const ttl = options.expiresInMs ?? 48 * 60 * 60 * 1000;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 30 * 86400000) throw new Error('invalid publication TTL');
  const snapshot = await db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const c = await tx.query<{ id: string }>('SELECT id::text FROM causes WHERE slug=$1 AND active', [cause]);
    const causeId = c.rows[0]?.id;
    if (!causeId) throw new Error('unknown or inactive cause');
    const catalog = await tx.query<{ version: number }>("SELECT version FROM reason_catalog_versions WHERE state='active'");
    const catalogVersion = catalog.rows[0]?.version;
    if (!catalogVersion) throw new Error('no active reason catalog');
    const publication = await tx.query<PublicationRow>(`INSERT INTO publications
      (cause_id, protocol_version, reason_catalog_version, compiler_version, source_revision, state, expires_at)
      VALUES ($1,$2,$3,$4,$5,'building',$6)
      RETURNING id::text, sequence::text, generated_at::text, expires_at::text`,
      [causeId, PROTOCOL_SCHEMA_VERSION, catalogVersion, options.compilerVersion, options.sourceRevision, new Date(Date.now()+ttl).toISOString()]);
    const p = publication.rows[0];
    if (!p) throw new Error('publication creation failed');
    const reasons = await tx.query<{ code: string; label: string }>(`SELECT e.reason_code AS code,e.label
      FROM reason_catalog_entries e JOIN reason_catalog_versions v ON v.id=e.catalog_version_id
      JOIN reason_causes rc ON rc.reason_code=e.reason_code
      WHERE v.version=$1 AND rc.cause_id=$2 ORDER BY e.reason_code`, [catalogVersion, causeId]);
    const reader = new PostgresPublicationCandidateReader(tx);
    const payloads: FullPublication[] = [];
    for (const channel of channels) for (const list of lists) {
      payloads.push(compileFullPublication({cause, channel, list, version:p.sequence,
        reasonCatalogVersion:catalogVersion, generatedAt:new Date(p.generated_at).toISOString(),
        expiresAt:new Date(p.expires_at).toISOString(), candidates:await reader.candidates(cause,channel,list)}));
    }
    const policies = await tx.query<{ id: string }>(`SELECT DISTINCT policy_revision_id::text AS id
      FROM membership_decisions WHERE cause_id=$1 AND state='active'`, [causeId]);
    for (const policy of policies.rows) await tx.query(`INSERT INTO publication_policy_revisions (publication_id,policy_revision_id) VALUES ($1,$2)`,[p.id,policy.id]);
    return {p, causeId, catalogVersion, payloads, labels:reasons.rows.map(r => [r.code,r.label])};
  });
  const {p,causeId,catalogVersion,payloads,labels} = snapshot;
  const warnings: string[] = [];
  let deltaArtifactCount = 0;
  const records: {channel:PublicationChannel;list:ListKind;kind:string;base:string|null;path:string;hash:string;size:number;count:number}[] = [];
  const previous = new PostgresPublishedArtifactReader(db,store);
  async function save(path:string,value:unknown) {
    const bytes = encode(value);
    if (bytes.length>MAX_BYTES) throw new Error('publication exceeds client size budget');
    await store.put(path,bytes);
    return {url:`/data/${path}`,sha256:digest(bytes),byteSize:bytes.length};
  }
  try {
    const prefix = `publications/${cause}/${p.sequence}`;
    const dictionary = await save(`${prefix}/dictionary.json`,{schemaVersion:PROTOCOL_SCHEMA_VERSION,catalogVersion,labels});
    for (const payload of payloads) {
      const {channel,list} = payload;
      const path = `${prefix}/${channel}/${list}/full.json`;
      const full = await save(path,payload);
      records.push({channel,list,kind:'full',base:null,path,hash:full.sha256,size:full.byteSize,count:payload.entries.length});
      const {entries: _entries,...header} = payload;
      void _entries;
      const unsigned = {...header,full,dictionary};
      const signature = key && options.signing ? {algorithm:'Ed25519' as const,keyId:options.signing.keyId,
        value:sign(null,Buffer.from(canonicalJson(unsigned)),key).toString('base64')} : null;
      const manifest = {...unsigned,signature};
      const manifestPath = `${prefix}/${channel}/${list}/manifest.json`;
      const descriptor = await save(manifestPath,manifest);
      records.push({channel,list,kind:'manifest',base:null,path:manifestPath,hash:descriptor.sha256,size:descriptor.byteSize,count:0});
      try {
        const old = await previous.full(cause,channel,list);
        const delta = compilePublicationDelta(old,payload);
        const deltaPath = `${prefix}/${channel}/${list}/from-${old.version}.delta.json`;
        const d = await save(deltaPath,delta);
        records.push({channel,list,kind:'delta',base:old.version,path:deltaPath,hash:d.sha256,size:d.byteSize,count:delta.added.length+delta.removed.length});
        deltaArtifactCount++;
      } catch (error) {
        if (!(error instanceof PublicationUnavailableError)) warnings.push(`Full sync required for ${channel}/${list}`);
      }
    }
    const activated = await db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`publication:${cause}`]);
      for (const r of records) await tx.query(`INSERT INTO publication_artifacts
        (publication_id,channel,list_kind,artifact_kind,version,base_version,storage_key,sha256,byte_size,entry_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[p.id,r.channel,r.list,r.kind,p.sequence,r.base,r.path,r.hash,r.size,r.count]);
      const newer = await tx.query<{ id:string }>(`SELECT id::text FROM publications WHERE cause_id=$1 AND state='active' AND sequence>$2::bigint`,[causeId,p.sequence]);
      if (newer.rows.length) {
        await tx.query("UPDATE publications SET state='retired' WHERE id=$1",[p.id]);
        return false;
      }
      await tx.query("UPDATE publications SET state='retired' WHERE cause_id=$1 AND state='active'",[causeId]);
      await tx.query("UPDATE publications SET state='active',activated_at=now() WHERE id=$1 AND state='building'",[p.id]);
      return true;
    });
    return {cause,publicationId:p.id,version:p.sequence,activated,fullArtifactCount:payloads.length,deltaArtifactCount,warnings};
  } catch (error) {
    await db.query("UPDATE publications SET state='failed' WHERE id=$1 AND state='building'",[p.id]);
    throw error;
  }
}
''')
write('apps/api/src/publish.ts', r'''
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FileArtifactStore, PgSqlExecutor, publishCurrentState } from '@isnotreal/persistence/runtime';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const cause = process.env.CAUSE_SLUG;
  const keyPath = process.env.PUBLICATION_SIGNING_KEY_FILE;
  const keyId = process.env.PUBLICATION_SIGNING_KEY_ID;
  if (!url || !cause || !keyPath || !keyId) throw new Error('DATABASE_URL, CAUSE_SLUG, PUBLICATION_SIGNING_KEY_FILE and PUBLICATION_SIGNING_KEY_ID are required');
  const ttl = Number(process.env.PUBLICATION_TTL_HOURS ?? 48);
  if (!Number.isFinite(ttl) || ttl<=0 || ttl>720) throw new Error('invalid PUBLICATION_TTL_HOURS');
  const privateKeyPem = await readFile(keyPath,'utf8');
  const db = PgSqlExecutor.create({connectionString:url,maxConnections:4,applicationName:'isnotreal-publisher'});
  try {
    const causes = cause==='all' ? (await db.query<{slug:string}>(`SELECT DISTINCT c.slug FROM causes c JOIN reason_causes rc ON rc.cause_id=c.id WHERE c.active ORDER BY c.slug`)).rows.map(c=>c.slug) : [cause];
    for (const slug of causes) {
      const result = await publishCurrentState(db,new FileArtifactStore(resolve(process.env.PUBLICATION_ROOT ?? '.local/publications')),
        {cause:slug,compilerVersion:process.env.COMPILER_VERSION ?? 'dev',sourceRevision:process.env.SOURCE_REVISION ?? 'manual',
        expiresInMs:ttl*3600000,signing:{keyId,privateKeyPem}});
      console.log(JSON.stringify(result));
      if (!result.activated) process.exitCode=2;
    }
  } finally { await db.close(); }
}
void main().catch(() => { console.error('Publication failed; verify database, cause and signing-key configuration.'); process.exitCode=1; });
''')
# Correct the not-yet-deployed cause constraint migration without guessing PostgreSQL's truncated name.
p=Path('db/migrations/0020_causes.sql'); s=p.read_text()
s=s.replace('ALTER TABLE membership_proposals\n  DROP CONSTRAINT membership_proposals_entity_id_assertion_id_reason_code_pro_key;', '''DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid='membership_proposals'::regclass AND contype='u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (entity_id, assertion_id, reason_code, proposed_list)'
  LOOP EXECUTE format('ALTER TABLE membership_proposals DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;'''); p.write_text(s)
write('db/migrations/0024_import_cause_guard.sql', r'''
BEGIN;
-- Old import helpers may omit cause. Resolve only a unique explicit reason binding;
-- ambiguous multi-cause reasons must use a cause-aware editor, never a guessed default.
CREATE FUNCTION fill_unique_proposal_cause() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE choices uuid[];
BEGIN
  IF NEW.cause_id IS NULL THEN
    SELECT array_agg(rc.cause_id) INTO choices FROM reason_causes rc JOIN causes c ON c.id=rc.cause_id
      WHERE rc.reason_code=NEW.reason_code AND c.active;
    IF coalesce(cardinality(choices),0) <> 1 THEN RAISE EXCEPTION 'explicit cause required for this reason'; END IF;
    NEW.cause_id := choices[1];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reason_causes WHERE reason_code=NEW.reason_code AND cause_id=NEW.cause_id) THEN
    RAISE EXCEPTION 'reason does not belong to cause';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_proposal_cause BEFORE INSERT OR UPDATE ON membership_proposals
FOR EACH ROW EXECUTE FUNCTION fill_unique_proposal_cause();
COMMIT;
''')
# Reuse the existing audited validation expression, correcting evidence stance and source independence.
base=Path('db/migrations/0015_enforce_reason_alignment.sql').read_text()
validation=base[base.index('CREATE VIEW membership_reason_validation AS'):base.index('CREATE OR REPLACE VIEW publication_candidates AS')]
validation=validation.replace('count(DISTINCT asl.capture_id)', 'count(DISTINCT sd.id)')
validation=validation.replace('WHERE asl.assertion_id = a.id','WHERE asl.assertion_id = a.id AND asl.stance = \'supports\'')
projection=Path('db/migrations/0021_cause_scoped_publication_candidates.sql').read_text()
projection=projection[projection.index('CREATE VIEW publication_candidates AS'):projection.rindex('COMMIT;')]
write('db/migrations/0025_supporting_evidence_gate.sql', 'BEGIN;\nDROP VIEW publication_candidates;\nDROP VIEW membership_reason_validation;\n'+validation+projection+'COMMIT;\n')
