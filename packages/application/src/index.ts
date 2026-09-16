import type { EntityKind } from '@isnotreal/domain';
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

export interface PublicEntitySummary {
  readonly publicId: PublicEntityId;
  readonly slug: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly lists: readonly ListKind[];
}

export interface PublicEntityProfile extends PublicEntitySummary {
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
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly candidates: readonly PublicationCandidate[];
}): FullPublication {
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    channel: input.channel,
    list: input.list,
    version: input.version,
    generatedAt: input.generatedAt,
    expiresAt: input.expiresAt,
    entries: compileEntries(input.candidates, input.channel, input.list),
  };
}
