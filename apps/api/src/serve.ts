import process from 'node:process';
import { resolve } from 'node:path';
import { startNodeApiRuntime } from './runtime.js';

async function main(): Promise<void> {
  const databaseUrl = requiredEnv('DATABASE_URL');
  const artifactRoot = resolve(process.env.PUBLICATION_ROOT ?? '.local/publications');
  const port = parsePositiveInteger(process.env.PORT, 3_000, 65_535, true);
  const maxDatabaseConnections = parsePositiveInteger(process.env.DB_POOL_MAX, 20, 500, false);
  const adminToken = process.env.ADMIN_BEARER_TOKEN?.trim() || undefined;
  const adminActorId = process.env.ADMIN_ACTOR_ID?.trim() || undefined;
  const runtime = await startNodeApiRuntime({
    databaseUrl,
    artifactRoot,
    host: process.env.HOST ?? '0.0.0.0',
    port,
    maxDatabaseConnections,
    ...(adminToken ? { adminToken } : {}),
    ...(adminActorId ? { adminActorId } : {}),
    ...(process.env.ADMIN_DATABASE_URL ? { adminDatabaseUrl: process.env.ADMIN_DATABASE_URL } : {}),
    downloads: {
      chromium: process.env.CHROME_WEB_STORE_URL ?? '',
      firefox: process.env.FIREFOX_ADDON_URL ?? '',
      safari: process.env.SAFARI_APP_STORE_URL ?? '',
    },
  });

  console.log(`isnotreal API listening on ${runtime.host}:${runtime.port}`);
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`received ${signal}; shutting down`);
    try {
      await runtime.close();
      process.exitCode = 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'shutdown failed');
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePositiveInteger(
  raw: string | undefined,
  fallback: number,
  max: number,
  allowZero: boolean,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(value) || value < minimum || value > max) {
    throw new Error(`invalid integer setting: ${raw}`);
  }
  return value;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'server startup failed');
  process.exitCode = 1;
});
