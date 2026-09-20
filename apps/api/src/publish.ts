import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  FileArtifactStore,
  PgSqlExecutor,
  publishCurrentState,
} from '@isnotreal/persistence/runtime';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const cause = process.env.CAUSE_SLUG;
  const keyPath = process.env.PUBLICATION_SIGNING_KEY_FILE;
  const keyId = process.env.PUBLICATION_SIGNING_KEY_ID;
  if (!url || !cause || !keyPath || !keyId)
    throw new Error(
      'DATABASE_URL, CAUSE_SLUG, PUBLICATION_SIGNING_KEY_FILE and PUBLICATION_SIGNING_KEY_ID are required',
    );
  const ttl = Number(process.env.PUBLICATION_TTL_HOURS ?? 48);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 720)
    throw new Error('invalid PUBLICATION_TTL_HOURS');
  const privateKeyPem = await readFile(keyPath, 'utf8');
  const db = PgSqlExecutor.create({
    connectionString: url,
    maxConnections: 4,
    applicationName: 'isnotreal-publisher',
  });
  try {
    const causes =
      cause === 'all'
        ? (
            await db.query<{ slug: string }>(
              `SELECT DISTINCT c.slug FROM causes c JOIN reason_causes rc ON rc.cause_id=c.id WHERE c.active ORDER BY c.slug`,
            )
          ).rows.map((c) => c.slug)
        : [cause];
    for (const slug of causes) {
      const result = await publishCurrentState(
        db,
        new FileArtifactStore(resolve(process.env.PUBLICATION_ROOT ?? '.local/publications')),
        {
          cause: slug,
          compilerVersion: process.env.COMPILER_VERSION ?? 'dev',
          sourceRevision: process.env.SOURCE_REVISION ?? 'manual',
          expiresInMs: ttl * 3600000,
          signing: { keyId, privateKeyPem },
        },
      );
      console.log(JSON.stringify(result));
      if (!result.activated) process.exitCode = 2;
    }
  } finally {
    await db.close();
  }
}
void main().catch(() => {
  console.error('Publication failed; verify database, cause and signing-key configuration.');
  process.exitCode = 1;
});
