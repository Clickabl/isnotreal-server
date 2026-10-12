import process from 'node:process';
import { PgSqlExecutor } from '@isnotreal/persistence/runtime';
import { migratePublicationFiles } from '@isnotreal/persistence/publication-file-migration';

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== 'import' && mode !== 'verify' && mode !== 'remove-files')
    throw new Error('Use import, verify, or remove-files');
  if (!process.env.DATABASE_URL || !process.env.PUBLICATION_ROOT)
    throw new Error('Protected database and legacy publication root required');
  if (mode === 'remove-files' && process.env.PUBLICATION_STORAGE !== 'postgres')
    throw new Error('Removal requires the PostgreSQL storage cutover');
  const db = PgSqlExecutor.create({
    connectionString: process.env.DATABASE_URL,
    maxConnections: 2,
    applicationName: 'isnotreal-publication-file-migration',
  });
  try {
    console.log(
      JSON.stringify(
        await migratePublicationFiles(db, process.env.PUBLICATION_ROOT, mode, (verified) =>
          console.error(JSON.stringify({ verified })),
        ),
      ),
    );
  } finally {
    await db.close();
  }
}
void main().catch(() => {
  console.error(
    'Publication migration stopped; legacy files and database receipts require inspection.',
  );
  process.exitCode = 1;
});
