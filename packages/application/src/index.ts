import type {
  BlocklistDelta,
  BlocklistManifest,
  FullBlocklist,
  FullSyncRequired,
  Platform,
} from '@isnotreal/protocol';
/** Read-side publication port. Persistence/HTTP implementations are deliberately absent. */
export interface BlocklistPublicationReader {
  manifest(platform: Platform): Promise<BlocklistManifest>;
  full(platform: Platform): Promise<FullBlocklist>;
  delta(platform: Platform, fromVersion: string): Promise<BlocklistDelta | FullSyncRequired>;
}
