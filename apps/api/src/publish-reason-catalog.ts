import process from 'node:process';
import { publishReasonCatalogVersion } from '@isnotreal/persistence/reason-catalog';
import { PgSqlExecutor } from '@isnotreal/persistence/runtime';

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const notes = process.env.REASON_CATALOG_NOTES?.trim() || 'Reason catalog publication';

  const db = PgSqlExecutor.create({
    connectionString: databaseUrl,
    maxConnections: 2,
    applicationName: 'isnotreal-reason-catalog-publisher',
  });

  try {
    const result = await publishReasonCatalogVersion(db, { notes });
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
  console.error(error instanceof Error ? error.message : 'reason catalog publication failed');
  process.exitCode = 1;
});
