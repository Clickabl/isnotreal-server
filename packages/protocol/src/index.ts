export const PROTOCOL_SCHEMA_VERSION = 4 as const;

export type Platform = 'x' | 'tiktok' | 'instagram' | 'youtube';
export type PublicationChannel = Platform | 'domain' | 'domain-subdomains';
export type ListKind = 'filter' | 'highlight';
export type IdentifierValue = string;
export type PublicEntityId = string;
export type ReasonCode = string;
export type PublicationVersion = string;

export interface AccountReference {
  readonly platform: Platform;
  readonly accountId: IdentifierValue;
}

export interface IdentifierReference {
  readonly channel: PublicationChannel;
  readonly identifier: IdentifierValue;
}

export type CompiledEntry = readonly [
  identifier: IdentifierValue,
  entityId: PublicEntityId,
  reasonCodes: readonly ReasonCode[],
];

export interface PublicationManifest {
  readonly schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
  readonly channel: PublicationChannel;
  readonly list: ListKind;
  readonly version: PublicationVersion;
  readonly reasonCatalogVersion: number;
  readonly generatedAt: string;
  readonly expiresAt: string;
}

export interface FullPublication extends PublicationManifest {
  readonly entries: readonly CompiledEntry[];
}

export interface PublicationDelta {
  readonly schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
  readonly channel: PublicationChannel;
  readonly list: ListKind;
  readonly fromVersion: PublicationVersion;
  readonly toVersion: PublicationVersion;
  readonly reasonCatalogVersion: number;
  readonly added: readonly CompiledEntry[];
  readonly removed: readonly IdentifierValue[];
}

export interface FullSyncRequired {
  readonly schemaVersion: typeof PROTOCOL_SCHEMA_VERSION;
  readonly code: 'FULL_SYNC_REQUIRED';
  readonly channel: PublicationChannel;
  readonly list: ListKind;
  readonly currentVersion: PublicationVersion;
  readonly currentReasonCatalogVersion: number;
}
