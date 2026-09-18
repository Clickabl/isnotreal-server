import { resolve } from 'node:path';
import process from 'node:process';
import {
  captureCurrentReasonAuthoritySources,
  captureSourceDocument,
} from '@isnotreal/persistence/source-capture';
import { FileArtifactStore, PgSqlExecutor } from '@isnotreal/persistence/runtime';

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const artifactRoot = resolve(process.env.SOURCE_CAPTURE_ROOT ?? '.local/source-captures');
  const documentId = process.env.SOURCE_DOCUMENT_ID?.trim() || null;
  const captureAllReasonAuthorities = process.env.CAPTURE_REASON_AUTHORITIES === '1';

  if ((documentId === null) === !captureAllReasonAuthorities) {
    throw new Error('set exactly one of SOURCE_DOCUMENT_ID or CAPTURE_REASON_AUTHORITIES=1');
  }

  const db = PgSqlExecutor.create({
    connectionString: databaseUrl,
    maxConnections: 2,
    applicationName: 'isnotreal-source-capture',
  });
  const store = new FileArtifactStore(artifactRoot);

  try {
    const result =
      documentId !== null
        ? await captureSourceDocument(db, store, documentId)
        : await captureCurrentReasonAuthoritySources(db, store);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.close();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'source capture failed');
  process.exitCode = 1;
});
