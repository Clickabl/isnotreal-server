import { resolve } from 'node:path';
import process from 'node:process';
import { PgSqlExecutor, applySqlMigrations } from '@isnotreal/persistence/runtime';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const db = PgSqlExecutor.create({
    connectionString: databaseUrl,
    maxConnections: 2,
    applicationName: 'isnotreal-migrate',
  });
  try {
    const result = await applySqlMigrations(
      db,
      resolve(process.env.MIGRATIONS_DIR ?? 'db/migrations'),
    );
    console.log(
      JSON.stringify({ applied: result.applied, alreadyApplied: result.alreadyApplied }, null, 2),
    );
  } finally {
    await db.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'migration failed');
  process.exitCode = 1;
});
