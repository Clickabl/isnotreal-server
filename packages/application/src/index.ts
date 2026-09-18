import type { EntityKind } from '@isnotreal/domain';
export { PROTOCOL_SCHEMA_VERSION } from '@isnotreal/protocol';
export type { ListKind, PublicationChannel, PublicEntityId } from '@isnotreal/protocol';
import {
  PROTOCOL_SCHEMA_VERSION,
  type CompiledEntry,
  type FullPublication,
  type FullSyncRequired,
  type ListKind,
  type PublicationChannel,
  type PublicationDelta,
  type PublicationManifest,
  type PublicEntityId,
  type ReasonCode,
} from '@isnotreal/protocol';

export interface PublicSource {
  readonly url: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly retrievedAt: string;
  readonly primary: boolean;
}

export interface PublicAssertionDetail {
  readonly id: string;
  readonly summary: string;
  readonly occurredOn: string | null;
  readonly sources: readonly PublicSource[];
}

export interface PublicReasonDetail {
  readonly code: ReasonCode;
  readonly label: string;
  readonly description: string;
  readonly assertions: readonly PublicAssertionDetail[];
}

export type ReasonSubjectScope = 'person' | 'company' | 'organization' | 'any';

export type ReasonEvidenceMode =
  | 'public-statement'
  | 'named-campaign-membership'
  | 'documented-action'
  | 'authoritative-list'
  | 'contract-or-supply'
  | 'financial-relationship'
  | 'organizational-policy'
  | 'leadership-attribution'
  | 'other';

export type ReasonValidityMode =
  'historical-event' | 'current-status' | 'current-list-membership' | 'current-relationship';

export interface ReasonEvidenceRequirement {
  readonly subjectScope: ReasonSubjectScope;
  readonly evidenceMode: ReasonEvidenceMode;
  readonly validityMode: ReasonValidityMode;
  readonly publicCriteria: string;
  readonly exclusionCriteria: string;
  readonly primaryOrAuthoritativeRequired: boolean;
  readonly minimumEvidenceItems: number;
  readonly reverifyAfterDays: number | null;
  readonly inheritancePolicy: 'none' | 'relationship-context-only';
}

export interface ReasonCampaignBinding {
  readonly slug: string;
  readonly name: string;
  readonly membershipRole: string;
}

export interface ReasonAuthoritySource {
  readonly url: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly role:
    'canonical-campaign-record' | 'authoritative-list' | 'official-guidance' | 'methodology';
}

export interface ReasonCatalogEntry {
  readonly code: ReasonCode;
  readonly label: string;
  readonly description: string;
  readonly category: string;
  readonly defaultList: ListKind | 'none';
  readonly evidenceRequirement: ReasonEvidenceRequirement | null;
  readonly campaigns: readonly ReasonCampaignBinding[];
  readonly authoritySources: readonly ReasonAuthoritySource[];
}

export interface PublicEntitySummary {
  readonly publicId: PublicEntityId;
  readonly slug: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly lists: readonly ListKind[];
}

export interface PublicIdentifierSummary {
  readonly kind: string;
  readonly value: string;
  readonly displayValue: string;
  readonly matchScope: 'exact' | 'include-subdomains';
}

export interface PublicRelationshipSummary {
  readonly direction: 'outbound' | 'inbound';
  readonly relationshipType: string;
  readonly entity: PublicEntitySummary;
  readonly ownershipPercent: number | null;
  readonly validFrom: string | null;
}

export interface PublicEntityProfile extends PublicEntitySummary {
  readonly identifiers: readonly PublicIdentifierSummary[];
  readonly relationships: readonly PublicRelationshipSummary[];
  readonly reasons: readonly PublicReasonDetail[];
}

export interface AlternativeOption {
  readonly entity: PublicEntitySummary;
  readonly relationshipType: string;
  readonly contextKey: string;
  readonly rationale: string | null;
  readonly destinationUrl: string | null;
  readonly destinationChannel: string | null;
}

export interface SubmissionInput {
  readonly entityPublicId: PublicEntityId | null;
  readonly identifierKind: string | null;
  readonly identifierValue: string | null;
  readonly submissionType:
    | 'add-evidence'
    | 'incorrect-information'
    | 'changed-position'
    | 'wrong-identifier'
    | 'missing-identifier'
    | 'company-relationship'
    | 'suggest-alternative'
    | 'new-entity';
  readonly proposedList: ListKind | null;
  readonly proposedReasonCode: ReasonCode | null;
  readonly narrative: string;
  readonly sourceUrls: readonly string[];
  readonly submitterContactRef: string | null;
}

export interface SubmissionReceipt {
  readonly id: string;
  readonly submittedAt: string;
  readonly state: 'pending';
}

export interface PublicEntityDirectory {
  byPublicId(publicId: PublicEntityId): Promise<PublicEntityProfile | null>;
  bySlug(slug: string): Promise<PublicEntityProfile | null>;
  search(query: string, limit: number): Promise<readonly PublicEntitySummary[]>;
}

export interface ReasonCatalogReader {
  version(): Promise<number>;
  list(): Promise<readonly ReasonCatalogEntry[]>;
  byCode(code: ReasonCode): Promise<ReasonCatalogEntry | null>;
}

export interface AlternativeDirectory {
  list(
    sourceEntityPublicId: PublicEntityId,
    contextKey: string | null,
    channel: string | null,
  ): Promise<readonly AlternativeOption[]>;
  preferred(
    sourceEntityPublicId: PublicEntityId,
    contextKey: string | null,
    channel: string | null,
  ): Promise<AlternativeOption | null>;
}

export interface SubmissionWriter {
  create(input: SubmissionInput): Promise<SubmissionReceipt>;
}

export interface PublicationReader {
  manifest(channel: PublicationChannel, list: ListKind): Promise<PublicationManifest>;
  full(channel: PublicationChannel, list: ListKind): Promise<FullPublication>;
  delta(
    channel: PublicationChannel,
    list: ListKind,
    fromVersion: string,
  ): Promise<PublicationDelta | FullSyncRequired>;
}

export interface PublicationCandidate {
  readonly channel: PublicationChannel;
  readonly list: ListKind;
  readonly identifier: string;
  readonly entityId: PublicEntityId;
  readonly reasonCodes: readonly ReasonCode[];
}

export interface PublicationCandidateReader {
  candidates(channel: PublicationChannel, list: ListKind): Promise<readonly PublicationCandidate[]>;
}

export function compileEntries(
  candidates: readonly PublicationCandidate[],
  channel: PublicationChannel,
  list: ListKind,
): readonly CompiledEntry[] {
  const byIdentifier = new Map<
    string,
    { entityId: PublicEntityId; reasonCodes: Set<ReasonCode> }
  >();

  for (const candidate of candidates) {
    if (candidate.channel !== channel || candidate.list !== list) continue;
    if (candidate.reasonCodes.length === 0) {
      throw new Error(`publication candidate ${candidate.identifier} has no reason codes`);
    }

    const existing = byIdentifier.get(candidate.identifier);
    if (existing && existing.entityId !== candidate.entityId) {
      throw new Error(`identifier ${candidate.identifier} resolves to multiple entities`);
    }

    const target = existing ?? {
      entityId: candidate.entityId,
      reasonCodes: new Set<ReasonCode>(),
    };
    for (const code of candidate.reasonCodes) target.reasonCodes.add(code);
    byIdentifier.set(candidate.identifier, target);
  }

  const sorted = [...byIdentifier.entries()].sort(([left], [right]) => left.localeCompare(right));
  const entries: CompiledEntry[] = [];
  for (const [identifier, value] of sorted) {
    entries.push([identifier, value.entityId, [...value.reasonCodes].sort()]);
  }
  return entries;
}

export function compileFullPublication(input: {
  readonly channel: PublicationChannel;
  readonly list: ListKind;
  readonly version: string;
  readonly reasonCatalogVersion: number;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly candidates: readonly PublicationCandidate[];
}): FullPublication {
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    channel: input.channel,
    list: input.list,
    version: input.version,
    reasonCatalogVersion: input.reasonCatalogVersion,
    generatedAt: input.generatedAt,
    expiresAt: input.expiresAt,
    entries: compileEntries(input.candidates, input.channel, input.list),
  };
}

export function compilePublicationDelta(
  previous: FullPublication,
  next: FullPublication,
): PublicationDelta {
  if (previous.channel !== next.channel || previous.list !== next.list) {
    throw new Error('cannot diff publications from different channels or lists');
  }

  const previousByIdentifier = new Map(previous.entries.map((entry) => [entry[0], entry]));
  const nextByIdentifier = new Map(next.entries.map((entry) => [entry[0], entry]));
  const added: CompiledEntry[] = [];
  const removed: string[] = [];

  for (const [identifier, entry] of nextByIdentifier) {
    const oldEntry = previousByIdentifier.get(identifier);
    if (!oldEntry || !sameEntry(oldEntry, entry)) added.push(entry);
  }
  for (const identifier of previousByIdentifier.keys()) {
    if (!nextByIdentifier.has(identifier)) removed.push(identifier);
  }

  added.sort(([left], [right]) => left.localeCompare(right));
  removed.sort((left, right) => left.localeCompare(right));

  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    channel: next.channel,
    list: next.list,
    fromVersion: previous.version,
    toVersion: next.version,
    reasonCatalogVersion: next.reasonCatalogVersion,
    added,
    removed,
  };
}

function sameEntry(left: CompiledEntry, right: CompiledEntry): boolean {
  if (left[1] !== right[1] || left[2].length !== right[2].length) return false;
  return left[2].every((reasonCode, index) => reasonCode === right[2][index]);
}
