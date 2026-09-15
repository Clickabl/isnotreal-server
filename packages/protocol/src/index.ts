/** Public wire contract only. No entity, name, reason, evidence or source fields. */
export type Platform = 'x' | 'tiktok' | 'instagram' | 'youtube';
/** Opaque stable platform ID. Never a handle, display name, or numeric JS value. */
export type AccountId = string;
/** Opaque per-platform version: compare equality, never sort numerically. */
export type BlocklistVersion = string;
export interface AccountReference {
  readonly platform: Platform;
  readonly accountId: AccountId;
}
export interface BlocklistManifest {
  readonly schemaVersion: 1;
  readonly platform: Platform;
  readonly version: BlocklistVersion;
}
export interface FullBlocklist extends BlocklistManifest {
  readonly ids: readonly AccountId[];
}
export interface BlocklistDelta {
  readonly schemaVersion: 1;
  readonly platform: Platform;
  readonly fromVersion: BlocklistVersion;
  readonly toVersion: BlocklistVersion;
  readonly added: readonly AccountId[];
  readonly removed: readonly AccountId[];
}
export interface FullSyncRequired {
  readonly schemaVersion: 1;
  readonly code: 'FULL_SYNC_REQUIRED';
  readonly platform: Platform;
  readonly currentVersion: BlocklistVersion;
}
