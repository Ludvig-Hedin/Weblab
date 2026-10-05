import { validatePilotContent } from '@convex/lib/cloudPilot';

import type { PilotDraft } from './draft';
import type { PilotContent, PilotSnapshot } from '@convex/lib/cloudPilot';
import { createDraft, hasConflict, isDirty, sameContent } from './draft';

export function draftStorageKey(userId: string, projectId: string): string {
    return `weblab.cloud-pilot.draft:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}`;
}

export function serializeDraft(state: PilotDraft): string | null {
    if (!isDirty(state) && !state.pending && !hasConflict(state)) return null;
    return JSON.stringify({
        baseRevision: state.base.revision,
        content: state.content,
        pending: state.pending,
    });
}

/** Cached text is only a draft. Permission and the latest revision always come from cloud. */
export function restoreDraft(snapshot: PilotSnapshot, stored: string | null): PilotDraft {
    const clean = createDraft(snapshot);
    if (!stored) return clean;
    try {
        const value: unknown = JSON.parse(stored);
        if (
            !value ||
            typeof value !== 'object' ||
            !('baseRevision' in value) ||
            !('content' in value)
        )
            return clean;
        if (
            typeof value.baseRevision !== 'number' ||
            !Number.isSafeInteger(value.baseRevision) ||
            value.baseRevision < 0 ||
            value.baseRevision > snapshot.revision
        )
            return clean;
        const content = value.content;
        if (!content || typeof content !== 'object' || Array.isArray(content)) return clean;
        const fields = {
            title: 160,
            description: 2000,
            imageUrl: 2048,
            imageAlt: 200,
            ctaLabel: 60,
            ctaHref: 2048,
        };
        const record = content as Record<string, unknown>;
        if (
            Object.keys(record).length !== 7 ||
            (record.alignment !== 'left' && record.alignment !== 'center')
        )
            return clean;
        for (const [key, limit] of Object.entries(fields)) {
            if (typeof record[key] !== 'string' || record[key].length > limit) return clean;
        }
        // The server may have accepted a save before this tab received its response.
        // Equal content is already persisted, even when the cached revision is older.
        if (sameContent(content as PilotContent, snapshot.content)) return clean;
        // A user may keep typing while a save is in flight. Confirm only that exact
        // submission at its next revision; retain the newer local edits as unsaved.
        if (snapshot.revision === value.baseRevision + 1 && 'pending' in value) {
            try {
                const submitted = validatePilotContent(value.pending);
                if (sameContent(submitted, snapshot.content)) {
                    return { ...clean, content: content as PilotContent };
                }
            } catch {
                // Invalid pending metadata cannot acknowledge a write or discard a draft.
            }
        }
        return {
            ...clean,
            base: { ...snapshot, revision: value.baseRevision },
            content: content as PilotContent,
        };
    } catch {
        return clean;
    }
}
