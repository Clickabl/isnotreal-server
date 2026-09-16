import { resolve } from 'node:path';
import process from 'node:process';
import {
  FileArtifactStore,
  PgSqlExecutor,
  publishCurrentState,
} from '@isnotreal/persistence/runtime';

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const compilerVersion = process.env.COMPILER_VERSION?.trim() || 'dev';
  const sourceRevision =
    process.env.SOURCE_REVISION?.trim() || process.env.GITHUB_SHA?.trim() || 'manual';
  const artifactRoot = resolve(process.env.PUBLICATION_ROOT ?? '.local/publications');
  const ttlHours = parseTtlHours(process.env.PUBLICATION_TTL_HOURS);

  const db = PgSqlExecutor.create({
    connectionString: databaseUrl,
    maxConnections: 4,
    applicationName: 'isnotreal-publisher',
  });
  try {
    const result = await publishCurrentState(db, new FileArtifactStore(artifactRoot), {
      compilerVersion,
      sourceRevision,
      expiresInMs: ttlHours * 60 * 60 * 1_000,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.activated) process.exitCode = 2;
  } finally {
    await db.close();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseTtlHours(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 48;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 24 * 30) {
    throw new Error('PUBLICATION_TTL_HOURS must be between 0 and 720');
  }
  return value;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'publication failed');
  process.exitCode = 1;
});
