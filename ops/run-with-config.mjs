// Run a command with settings from chmod-600 JSON files layered over the inherited
// environment. Used by ops/deploy.sh and the cPanel cron jobs.
//
//   node ops/run-with-config.mjs config/db-owner.json[,config/extra.json] -- command args...
//
// Values from the files always win. On the cPanel/LiteSpeed host the web server injects
// its own copies of some variables and strips double quotes from them, so inherited
// values cannot be trusted to override the protected files.
import process from 'node:process';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { loadConfigFiles } from './cpanel/config.mjs';

const separator = process.argv.indexOf('--');
const files = process.argv[2];
if (!files || separator !== 3 || separator === process.argv.length - 1) {
  console.error(
    'Usage: node ops/run-with-config.mjs <file.json>[,<file.json>...] -- <command> [args...]',
  );
  process.exit(2);
}
const [command, ...args] = process.argv.slice(separator + 1);
const env = { ...process.env, ...loadConfigFiles(files.split(',')) };
const result = spawnSync(command, args, { env, stdio: 'inherit' });
if (result.error) {
  console.error(`${command}: ${result.error.message}`);
  process.exit(127);
}
process.exit(result.status ?? 1);
