// cPanel "Setup Node.js App" startup file. ops/deploy.sh copies it into the app root
// (~/isnotreal/app) on every deploy; it is not run from inside a release.
//
// It loads the public runtime's settings from ~/isnotreal/config and then starts the
// release that ~/isnotreal/current points at. Keeping the app root outside the
// releases lets each release own a normal node_modules directory, which CloudLinux's
// Node selector does not allow inside an app root.
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { realpathSync } from 'node:fs';
import { loadConfigFiles } from './config.mjs';

const home = process.env.ISNOTREAL_HOME ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = join(home, 'config');
// Never set these through the cPanel UI: LiteSpeed corrupts quoted values and
// `cloudlinux-selector get` prints them. The files win over anything inherited.
Object.assign(
  process.env,
  loadConfigFiles([join(configDir, 'db-app.json'), join(configDir, 'runtime.json')]),
);

const release = realpathSync(join(home, 'current'));
process.chdir(release);
await import(pathToFileURL(join(release, 'apps/api/dist/serve.js')).href);
