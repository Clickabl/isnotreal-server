import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SqlExecutor } from './index.js';
import { PostgresArtifactStore, validatePublicationKey } from './runtime.js';

/** Preserve exact legacy URLs/bytes before removing their loose-file representation. */
export async function migratePublicationFiles(
  db: SqlExecutor,
  rootDirectory: string,
  mode: 'import' | 'verify' | 'remove-files',
  progress: (count: number) => void = () => {},
): Promise<{ files: number; bytes: number; removed: number }> {
  const root = resolve(rootDirectory);
  const files: { key: string; path: string; hash: string; size: number; mtime: number }[] = [];
  const directories: string[] = [];
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  async function walk(directory: string, key: string): Promise<void> {
    if (!(await lstat(directory)).isDirectory()) throw new Error('invalid publication directory');
    directories.push(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name),
        storageKey = `${key}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, storageKey);
      else if (entry.isFile()) {
        validatePublicationKey(storageKey);
        const stat = await lstat(path);
        if (!stat.isFile() || stat.size > 64 * 1024 * 1024)
          throw new Error('invalid legacy publication file');
        files.push({ key: storageKey, path, hash: '', size: stat.size, mtime: stat.mtimeMs });
      } else throw new Error('publication migration refuses links or special files');
    }
  }
  await walk(join(root, 'publications'), 'publications');
  const metadata = await db.query<{ storage_key: string; sha256: string; byte_size: string }>(
    'SELECT storage_key,sha256,byte_size::text FROM publication_artifacts',
  );
  const expected = new Map(metadata.rows.map((row) => [row.storage_key, row]));
  const store = new PostgresArtifactStore(db);
  let bytes = 0;
  for (const [index, file] of files.entries()) {
    const value = await readFile(file.path);
    file.hash = hash(value);
    if (value.length !== file.size) throw new Error('legacy publication changed during migration');
    const row = expected.get(file.key);
    if (row && (row.sha256 !== file.hash || Number(row.byte_size) !== file.size))
      throw new Error('legacy publication does not match its database receipt');
    if (mode === 'import') await store.put(file.key, value);
    const persisted = await store.get(file.key);
    if (persisted.length !== file.size || hash(persisted) !== file.hash)
      throw new Error('database publication verification failed');
    bytes += value.length;
    if (index % 1000 === 0) progress(index + 1);
  }
  // All files have been verified before any deletion. Interruption is resumable:
  // database inserts are immutable/idempotent and only verified files are removed.
  let removed = 0;
  if (mode === 'remove-files') {
    for (const file of files) {
      const stat = await lstat(file.path);
      if (
        !stat.isFile() ||
        stat.size !== file.size ||
        stat.mtimeMs !== file.mtime ||
        hash(await readFile(file.path)) !== file.hash
      )
        throw new Error('legacy publication changed before removal');
      await unlink(file.path);
      removed++;
    }
    for (const directory of directories.reverse()) await rmdir(directory);
  }
  return { files: files.length, bytes, removed };
}
