from pathlib import Path

Path('ops/libpq-run.mjs').write_text(r'''import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';

const [environmentName, command, ...args] = process.argv.slice(2);
if (!['DATABASE_URL', 'PG_ADMIN_URL', 'PG_ADMIN_DB_URL', 'EDITOR_DATABASE_URL', 'RESTORE_DATABASE_URL'].includes(environmentName) ||
    !['psql', 'pg_dump', 'pg_restore'].includes(command)) {
  throw new Error('Invalid database utility invocation');
}
const value = process.env[environmentName];
if (!value) throw new Error('Database connection setting is missing');
const url = new URL(value);
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Expected a PostgreSQL URL');
const database = decodeURIComponent(url.pathname.slice(1));
if (!database) throw new Error('A database name is required');
const env = { ...process.env,
  PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: database,
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
};
const mapping = { sslmode:'PGSSLMODE', sslrootcert:'PGSSLROOTCERT', sslcert:'PGSSLCERT', sslkey:'PGSSLKEY',
  connect_timeout:'PGCONNECT_TIMEOUT', application_name:'PGAPPNAME', options:'PGOPTIONS', channel_binding:'PGCHANNELBINDING' };
for (const [key, setting] of url.searchParams) {
  if (!(key in mapping)) throw new Error('Unsupported libpq URL parameter');
  env[mapping[key]] = setting;
}
// The URI and passwords are not put into child command arguments or printed.
const result = spawnSync(command, command === 'pg_restore' ? ['--dbname', database, ...args] : args, { env, stdio: 'inherit' });
if (result.error) throw new Error('PostgreSQL utility could not start');
process.exitCode = result.status ?? 1;
''')
for name, variable in [('db-bootstrap','PG_ADMIN_URL'),('db-grants','PG_ADMIN_DB_URL'),('server-doctor','DATABASE_URL'),('backup-db','DATABASE_URL')]:
 p=Path(f'ops/{name}.sh'); s=p.read_text()
 s=s.replace(f'PGDATABASE="${variable}" psql',f'node ops/libpq-run.mjs {variable} psql')
 s=s.replace(f'PGDATABASE="${variable}" pg_dump',f'node ops/libpq-run.mjs {variable} pg_dump')
 p.write_text(s)
p=Path('ops/db-shell.sh');s=p.read_text().replace('export PGDATABASE="$EDITOR_DATABASE_URL"\nexec psql', 'exec node ops/libpq-run.mjs EDITOR_DATABASE_URL psql');p.write_text(s)
p=Path('ops/restore-db.sh');s=p.read_text().replace('PGDATABASE="$RESTORE_DATABASE_URL" pg_restore', 'node ops/libpq-run.mjs RESTORE_DATABASE_URL pg_restore').replace(' --dbname="$RESTORE_DATABASE_URL"','');p.write_text(s)
