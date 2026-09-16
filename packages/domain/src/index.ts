import type {
  IdentifierValue,
  ListKind,
  Platform,
  PublicEntityId,
  ReasonCode,
} from '@isnotreal/protocol';

export type RecordId = string;
export type Timestamp = string;
export type EvidenceDate = string;
export type NonEmpty<T> = readonly [T, ...T[]];

export type EntityKind =
  | 'person'
  | 'company'
  | 'brand'
  | 'organization'
  | 'music-group'
  | 'other';
export type EntityStatus = 'active' | 'merged' | 'hidden' | 'deleted';

export interface CanonicalEntity {
  readonly id: RecordId;
  readonly publicId: PublicEntityId;
  readonly kind: EntityKind;
  readonly canonicalName: string;
  readonly slug: string;
  readonly status: EntityStatus;
  readonly mergedIntoEntityId: RecordId | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export type IdentifierKind =
  | Platform
  | 'domain'
  | 'spotify'
  | 'apple-music'
  | 'facebook'
  | 'threads'
  | 'bluesky'
  | 'imdb'
  | 'tmdb'
  | 'other';

export interface EntityIdentifier {
  readonly id: RecordId;
  readonly kind: IdentifierKind | string;
  readonly value: IdentifierValue;
  readonly normalizedValue: IdentifierValue;
  readonly displayValue: string;
  readonly matchScope: 'exact' | 'include-subdomains';
  readonly status: 'active' | 'inactive' | 'reassigned' | 'unverified';
  readonly createdAt: Timestamp;
}

export interface IdentifierAssignment {
  readonly id: RecordId;
  readonly identifierId: RecordId;
  readonly entityId: RecordId;
  readonly state: 'unverified' | 'verified' | 'revoked';
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
  readonly verificationAssertionId: RecordId | null;
  readonly recordedAt: Timestamp;
}

export interface Campaign {
  readonly id: RecordId;
  readonly slug: string;
  readonly name: string;
  readonly organizationEntityId: RecordId | null;
  readonly websiteUrl: string | null;
  readonly status: 'active' | 'ended' | 'archived';
}

export interface CampaignVersion {
  readonly id: RecordId;
  readonly campaignId: RecordId;
  readonly version: number;
  readonly label: string;
  readonly sourceDocumentId: RecordId | null;
  readonly effectiveFrom: Timestamp | null;
  readonly effectiveTo: Timestamp | null;
}

export interface SourceDocument {
  readonly id: RecordId;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly sourceType: 'primary' | 'campaign' | 'news' | 'filing' | 'archive' | 'other';
  readonly firstPublishedAt: Timestamp | null;
  readonly createdAt: Timestamp;
}

export interface SourceCapture {
  readonly id: RecordId;
  readonly documentId: RecordId;
  readonly retrievedAt: Timestamp;
  readonly contentHash: string | null;
  readonly storageUri: string | null;
  readonly captureMethod: 'manual' | 'http' | 'archive' | 'api' | 'other';
  readonly status: 'available' | 'missing' | 'blocked' | 'invalid';
}

export type AssertionState = 'draft' | 'under-review' | 'published' | 'withdrawn' | 'disputed';

export interface AssertionRecord {
  readonly id: RecordId;
  readonly primaryEntityId: RecordId | null;
  readonly actionType: string;
  readonly campaignVersionId: RecordId | null;
  readonly summary: string;
  readonly occurredOn: EvidenceDate | null;
  readonly occurredAt: Timestamp | null;
  readonly datePrecision: 'instant' | 'day' | 'month' | 'year' | 'unknown' | 'ongoing';
  readonly state: AssertionState;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export type ParticipantRole =
  | 'actor'
  | 'signer'
  | 'donor'
  | 'recipient'
  | 'supplier'
  | 'customer'
  | 'organizer'
  | 'participant'
  | 'beneficiary'
  | 'target'
  | 'other';

export interface AssertionParticipant {
  readonly assertionId: RecordId;
  readonly entityId: RecordId;
  readonly role: ParticipantRole;
}

export interface ReasonDefinition {
  readonly code: ReasonCode;
  readonly label: string;
  readonly description: string;
  readonly category: string;
  readonly defaultList: ListKind | 'none';
  readonly active: boolean;
}

export interface EntityRelationship {
  readonly id: RecordId;
  readonly fromEntityId: RecordId;
  readonly toEntityId: RecordId;
  readonly relationshipType: 'owns' | 'controls' | 'brand-of' | 'member-of' | 'licenses' | 'operates';
  readonly ownershipPercent: number | null;
  readonly evidenceAssertionId: RecordId | null;
  readonly validFrom: Timestamp | null;
  readonly validTo: Timestamp | null;
  readonly status: 'draft' | 'verified' | 'revoked';
}

export interface PolicyRevision {
  readonly id: RecordId;
  readonly policySlug: string;
  readonly version: number;
  readonly rules: Readonly<Record<string, unknown>>;
  readonly state: 'draft' | 'active' | 'retired';
  readonly effectiveAt: Timestamp | null;
}

export interface MembershipDecision {
  readonly id: RecordId;
  readonly entityId: RecordId;
  readonly list: ListKind;
  readonly decision: 'include' | 'exclude';
  readonly state: 'draft' | 'active' | 'superseded';
  readonly policyRevisionId: RecordId;
  readonly decidedAt: Timestamp;
}

export interface MembershipDecisionReason {
  readonly decisionId: RecordId;
  readonly reasonCode: ReasonCode;
  readonly assertionId: RecordId;
}

export interface CommunitySubmission {
  readonly id: RecordId;
  readonly entityId: RecordId | null;
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
  readonly state: 'pending' | 'triaged' | 'accepted' | 'rejected' | 'duplicate';
  readonly submittedAt: Timestamp;
  readonly submitterContactRef: string | null;
}

export interface AlternativeRelationship {
  readonly id: RecordId;
  readonly sourceEntityId: RecordId;
  readonly alternativeEntityId: RecordId;
  readonly contextKey: string;
  readonly relationshipType:
    | 'similar-creator'
    | 'similar-service'
    | 'direct-competitor'
    | 'indie-alternative'
    | 'local-alternative'
    | 'community-recommended'
    | 'other';
  readonly rank: number;
  readonly rationale: string | null;
  readonly state: 'proposed' | 'approved' | 'rejected' | 'retired';
}

export interface AlternativeDestination {
  readonly id: RecordId;
  readonly entityId: RecordId;
  readonly channel: string | null;
  readonly destinationUrl: string;
  readonly priority: number;
  readonly active: boolean;
  readonly verifiedAt: Timestamp | null;
}

export interface ReviewEvent {
  readonly id: RecordId;
  readonly subjectType: string;
  readonly subjectId: RecordId;
  readonly action: 'submitted' | 'approved' | 'rejected' | 'corrected' | 'withdrawn' | 'restored';
  readonly reviewerId: string;
  readonly rationale: string;
  readonly at: Timestamp;
}
