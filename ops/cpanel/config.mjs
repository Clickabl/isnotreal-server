import { readFileSync, statSync } from 'node:fs';

/**
 * Read flat JSON objects of string settings. Later files override earlier ones.
 * Refuses files that other accounts could read, because they hold credentials.
 */
export function loadConfigFiles(paths) {
  const settings = {};
  for (const path of paths) {
    if ((statSync(path).mode & 0o077) !== 0) {
      throw new Error(`${path} must not be readable by group or others (chmod 600)`);
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw new Error(`${path} must contain valid JSON`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${path} must contain a JSON object`);
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') throw new Error(`${path}: ${key} must be a string`);
      settings[key] = value;
    }
  }
  return settings;
}
