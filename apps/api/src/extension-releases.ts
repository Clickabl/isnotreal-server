import { readFile } from 'node:fs/promises';

// Extension software versions, published by editing a JSON file on the server (see
// docs/SERVER_HANDOFF.md). This is metadata only: executable code still reaches
// users through the browser stores, or through Firefox's signed self-distribution
// update manifest. Nothing here lets the server run code inside the extension.

export type ExtensionBrowser = 'chromium' | 'firefox' | 'safari';

export interface ExtensionRelease {
  /** Newest version users should be running. */
  readonly latest: string;
  /** Older versions should tell the user they must update. */
  readonly minimum: string;
  /** Store listing or download page. */
  readonly url?: string;
}

export interface FirefoxSelfDistribution {
  readonly geckoId: string;
  readonly updates: readonly { version: string; link: string; sha256: string }[];
}

export interface ExtensionReleases {
  readonly browsers: Partial<Record<ExtensionBrowser, ExtensionRelease>>;
  readonly firefoxSelfDistribution?: FirefoxSelfDistribution;
}

const version = /^\d{1,5}(?:\.\d{1,5}){0,3}$/;
const sha256 = /^[0-9a-f]{64}$/;

export function parseExtensionReleases(raw: unknown): ExtensionReleases {
  const root = record(raw, 'releases');
  const browsers: Partial<Record<ExtensionBrowser, ExtensionRelease>> = {};
  for (const [name, value] of Object.entries(record(root.browsers ?? {}, 'browsers'))) {
    if (name !== 'chromium' && name !== 'firefox' && name !== 'safari') {
      throw new Error(`unknown browser ${name}`);
    }
    const entry = record(value, name);
    const latest = versionString(entry.latest, `${name}.latest`);
    const minimum = versionString(entry.minimum ?? latest, `${name}.minimum`);
    if (compareVersions(minimum, latest) > 0) throw new Error(`${name}.minimum is above latest`);
    browsers[name] = {
      latest,
      minimum,
      ...(entry.url === undefined ? {} : { url: httpsUrl(entry.url, `${name}.url`) }),
    };
  }
  if (root.firefoxSelfDistribution === undefined) return { browsers };
  const firefox = record(root.firefoxSelfDistribution, 'firefoxSelfDistribution');
  if (typeof firefox.geckoId !== 'string' || !/^[^\s]{3,200}$/.test(firefox.geckoId)) {
    throw new Error('firefoxSelfDistribution.geckoId is required');
  }
  if (!Array.isArray(firefox.updates)) throw new Error('firefoxSelfDistribution.updates');
  const updates = firefox.updates.map((value, index) => {
    const update = record(value, `updates[${index}]`);
    if (typeof update.sha256 !== 'string' || !sha256.test(update.sha256)) {
      throw new Error(`updates[${index}].sha256 must be lowercase hex`);
    }
    return {
      version: versionString(update.version, `updates[${index}].version`),
      link: httpsUrl(update.link, `updates[${index}].link`),
      sha256: update.sha256,
    };
  });
  return { browsers, firefoxSelfDistribution: { geckoId: firefox.geckoId, updates } };
}

/** Firefox update manifest: https://extensionworkshop.com/documentation/manage/updating-your-extension/ */
export function firefoxUpdateManifest(distribution: FirefoxSelfDistribution): unknown {
  return {
    addons: {
      [distribution.geckoId]: {
        updates: distribution.updates.map((update) => ({
          version: update.version,
          update_link: update.link,
          update_hash: `sha256:${update.sha256}`,
        })),
      },
    },
  };
}

export async function readExtensionReleases(path: string | undefined): Promise<ExtensionReleases> {
  if (!path) return { browsers: {} };
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { browsers: {} };
    throw error;
  }
  return parseExtensionReleases(JSON.parse(text));
}

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function versionString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !version.test(value))
    throw new Error(`${name} is not a version`);
  return value;
}

function httpsUrl(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a URL`);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${name} must use https`);
  return url.href;
}
