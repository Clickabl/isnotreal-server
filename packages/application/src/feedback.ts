/** One catalog drives public forms, request validation and the private inbox. */
export const submissionCatalog = [
  {
    code: 'add-evidence',
    label: 'Add evidence',
    queue: 'evidence',
    help: 'Explain what the source establishes, with a link to the original record.',
  },
  {
    code: 'incorrect-information',
    label: 'Correct a fact',
    queue: 'evidence',
    help: 'Identify the incorrect statement and the supporting correction.',
  },
  {
    code: 'changed-position',
    label: 'A position changed',
    queue: 'evidence',
    help: 'Link the later statement or action. Historical facts are not erased.',
  },
  {
    code: 'wrong-identifier',
    label: 'The wrong account or website',
    queue: 'evidence',
    help: 'Explain the identity mismatch. Do not include private account information.',
  },
  {
    code: 'missing-identifier',
    label: 'Add a public account or website',
    queue: 'evidence',
    help: 'Link the public profile and explain who controls it.',
  },
  {
    code: 'company-relationship',
    label: 'A company relationship',
    queue: 'evidence',
    help: 'Describe the specific ownership or operating relationship, not an inferred position.',
  },
  {
    code: 'suggest-alternative',
    label: 'Suggest an alternative',
    queue: 'evidence',
    help: 'Describe what it replaces and link the service or creator.',
  },
  {
    code: 'new-entity',
    label: 'Add a person or organization',
    queue: 'evidence',
    help: 'Identify the public subject and the specific sourced action.',
  },
  {
    code: 'product-feedback',
    label: 'Product feedback',
    queue: 'product',
    help: 'Tell us what would make this work better. No evidence URL is required.',
  },
  {
    code: 'bug-report',
    label: 'Something is broken',
    queue: 'product',
    help: 'Describe the steps, what happened, and what you expected. Do not paste access tokens or private browsing history.',
  },
  {
    code: 'accessibility-feedback',
    label: 'Accessibility issue',
    queue: 'product',
    help: 'Describe the barrier and the assistive technology involved, only if relevant.',
  },
  {
    code: 'abuse-report',
    label: 'Abuse or privacy concern',
    queue: 'safety',
    help: 'Identify the public record or behavior without reposting private or harmful information.',
  },
] as const;
export type SubmissionType = (typeof submissionCatalog)[number]['code'];
export type FeedbackQueue = (typeof submissionCatalog)[number]['queue'];
export const feedbackStates = [
  'pending',
  'triaged',
  'accepted',
  'rejected',
  'duplicate',
  'spam',
] as const;
export type FeedbackState = (typeof feedbackStates)[number];
export const feedbackQueue = (type: string): FeedbackQueue =>
  submissionCatalog.find((item) => item.code === type)?.queue ?? 'evidence';
export class SubmissionConflictError extends Error {
  constructor() {
    super('This request identifier was already used for different content');
    this.name = 'SubmissionConflictError';
  }
}
export class SubmissionTargetNotFoundError extends Error {
  constructor() {
    super('The selected entity no longer exists');
    this.name = 'SubmissionTargetNotFoundError';
  }
}
