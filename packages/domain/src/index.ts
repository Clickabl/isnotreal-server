import type { AccountReference } from '@isnotreal/protocol';
export type EntityId = string;
export type RecordId = string;
/** ISO 8601 UTC instant, validated at future runtime boundaries. */
export type Timestamp = string;
/** YYYY-MM-DD; null dates mean unknown rather than fabricated precision. */
export type EvidenceDate = string;
export type NonEmpty<T> = readonly [T, ...T[]];
export interface CanonicalEntity {
  readonly id: EntityId;
  readonly kind: 'person' | 'organization';
  readonly displayName: string;
  readonly createdAt: Timestamp;
}
export interface PlatformAccount extends AccountReference {
  readonly entityId: EntityId;
  /** Sources establishing account ownership, not assumptions from a handle. */
  readonly identitySourceIds: NonEmpty<RecordId>;
  readonly verifiedAt: Timestamp;
}
export interface SourceRecord {
  readonly id: RecordId;
  readonly url: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly publishedOn: EvidenceDate | null;
  readonly accessedAt: Timestamp;
  readonly archivedUrl: string | null;
}
export interface EvidenceRecord {
  readonly id: RecordId;
  readonly sourceIds: NonEmpty<RecordId>;
  readonly occurredOn: EvidenceDate | null;
  readonly recordedAt: Timestamp;
  /** Specific excerpt or observation with enough context to assess it. */
  readonly description: string;
  readonly quotation: string | null;
  readonly sourceLocator: string | null;
}
export interface ReasonRecord {
  readonly id: RecordId;
  readonly entityId: EntityId;
  readonly kind: 'action' | 'statement' | 'affiliation';
  /** Specific documented claim; never an unsupported broad label. */
  readonly factualSummary: string;
  readonly evidenceIds: NonEmpty<RecordId>;
  readonly revision: number;
  readonly state: 'draft' | 'under-review' | 'published' | 'withdrawn';
  readonly createdAt: Timestamp;
}
export interface ReviewEvent {
  readonly id: RecordId;
  readonly subject: {
    readonly type: 'entity' | 'account' | 'reason' | 'evidence' | 'dispute' | 'publication';
    readonly id: RecordId;
    readonly revision: number;
  };
  readonly action: 'submitted' | 'approved' | 'rejected' | 'corrected' | 'withdrawn';
  readonly reviewerId: string;
  readonly rationale: string;
  readonly at: Timestamp;
  readonly supersedesEventId: RecordId | null;
}
export interface DisputeRecord {
  readonly id: RecordId;
  readonly entityId: EntityId;
  readonly reasonIds: readonly RecordId[];
  readonly statement: string;
  readonly supportingSourceIds: readonly RecordId[];
  readonly state: 'open' | 'under-review' | 'resolved' | 'dismissed';
  readonly submittedAt: Timestamp;
  /** Private reference; personal contact details never enter public models. */
  readonly submitterContactRef: string | null;
}
export interface CorrectionRecord {
  readonly id: RecordId;
  readonly disputeId: RecordId | null;
  readonly reasonId: RecordId;
  readonly previousRevision: number;
  readonly correctedRevision: number;
  readonly explanation: string;
  readonly reviewEventId: RecordId;
  readonly correctedAt: Timestamp;
}
/** Editorial inclusion decision is distinct from evidence being a fact. */
export interface InclusionDecision extends AccountReference {
  readonly id: RecordId;
  readonly entityId: EntityId;
  readonly reasonIds: NonEmpty<RecordId>;
  readonly policyVersion: string;
  readonly decision: 'include' | 'exclude';
  readonly reviewEventId: RecordId;
  readonly decidedAt: Timestamp;
}
