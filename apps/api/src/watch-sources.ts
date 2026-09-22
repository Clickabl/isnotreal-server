import process from 'node:process';
import { FileArtifactStore, PgSqlExecutor } from '@isnotreal/persistence/runtime';
import { watchOfficialSources } from '@isnotreal/persistence/source-watch';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const db = PgSqlExecutor.create({
  connectionString: databaseUrl,
  maxConnections: 2,
  applicationName: 'isnotreal-source-watch',
});
const store = new FileArtifactStore(process.env.PUBLICATION_ROOT?.trim() || '.local/publications');
try {
  const result = await watchOfficialSources(db, store);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.changed > 0) process.exitCode = 2;
} finally {
  await db.close();
}
