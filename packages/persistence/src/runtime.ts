import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { SqlExecutor, SqlQueryResult } from './index.js';
export {
  PostgresPublishedArtifactReader,
  publishCurrentState,
  PublicationUnavailableError,
} from './publications.js';
export type { PublishCurrentStateOptions, PublishCurrentStateResult } from './publications.js';

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

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
