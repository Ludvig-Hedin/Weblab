import type { CloudJournalDraft } from './journal-drafts';

/** A confirmed save can close only the exact submitted draft in its still-current owner. */
export function acknowledgeJournalDraft(
    current: CloudJournalDraft | null,
    submitted: CloudJournalDraft,
    activeScope: string | null,
): CloudJournalDraft | null {
    const owner = JSON.stringify([submitted.projectId, submitted.branchId, submitted.actorId]);
    return current === submitted && activeScope === owner ? null : current;
}
