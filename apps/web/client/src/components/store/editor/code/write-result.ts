/** A refusal cannot succeed by repeating the same source edit. */
export class RejectedSourceEdit extends Error {}

export type SourceWriteResult = 'saved' | 'noop' | 'rejected' | 'retryable';
