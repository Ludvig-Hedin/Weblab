import { CLOUD_PILOT_TEMPLATE, initialPilotContent } from '@convex/lib/cloudPilot';
import { describe, expect, test } from 'bun:test';

import type { Id } from '@convex/_generated/dataModel';
import type { PilotSnapshot } from '@convex/lib/cloudPilot';
import { createDraft, hasConflict, isDirty, pilotDraftReducer } from './draft';
import { draftStorageKey, restoreDraft, serializeDraft } from './session-draft';

function snapshot(revision = 1, title = 'Original'): PilotSnapshot {
    return {
        projectId: 'project-test' as Id<'projects'>,
        name: 'Pilot',
        template: CLOUD_PILOT_TEMPLATE,
        content: initialPilotContent(title),
        revision,
        updatedAt: revision,
        canEdit: true,
        enabled: true,
    };
}

describe('pilot draft durability', () => {
    test('clean drafts follow a newer cloud snapshot', () => {
        const state = pilotDraftReducer(createDraft(snapshot()), {
            type: 'remote',
            snapshot: snapshot(2, 'Remote'),
        });
        expect(state.content.title).toBe('Remote');
        expect(isDirty(state)).toBe(false);
    });

    test('remote writes do not replace unsaved local content', () => {
        let state = createDraft(snapshot());
        state = pilotDraftReducer(state, {
            type: 'edit',
            content: initialPilotContent('Local'),
        });
        state = pilotDraftReducer(state, {
            type: 'remote',
            snapshot: snapshot(2, 'Remote'),
        });
        expect(state.content.title).toBe('Local');
        expect(state.base.revision).toBe(1);
        expect(hasConflict(state)).toBe(true);
        state = pilotDraftReducer(state, { type: 'reload' });
        expect(state.content.title).toBe('Remote');
        expect(isDirty(state)).toBe(false);
        expect(hasConflict(state)).toBe(false);
    });

    test('a failed save keeps the draft and original revision for retry', () => {
        let state = createDraft(snapshot());
        state = pilotDraftReducer(state, {
            type: 'edit',
            content: initialPilotContent('Local'),
        });
        state = pilotDraftReducer(state, { type: 'saving' });
        state = pilotDraftReducer(state, { type: 'failed', error: 'Offline' });
        expect(state.content.title).toBe('Local');
        expect(state.base.revision).toBe(1);
        expect(state.pending).toBeNull();
        expect(state.error).toBe('Offline');
        expect(isDirty(state)).toBe(true);
    });

    test('own realtime echo is not a conflict while save is pending', () => {
        let state = createDraft(snapshot());
        state = pilotDraftReducer(state, {
            type: 'edit',
            content: initialPilotContent('Local'),
        });
        state = pilotDraftReducer(state, { type: 'saving' });
        state = pilotDraftReducer(state, {
            type: 'remote',
            snapshot: snapshot(2, 'Local'),
        });
        expect(hasConflict(state)).toBe(false);
        state = pilotDraftReducer(state, {
            type: 'saved',
            snapshot: snapshot(2, 'Local'),
        });
        expect(isDirty(state)).toBe(false);
        expect(state.base.revision).toBe(2);
    });

    test('edits made after a save starts survive its response', () => {
        let state = createDraft(snapshot());
        state = pilotDraftReducer(state, {
            type: 'edit',
            content: initialPilotContent('Submitted'),
        });
        state = pilotDraftReducer(state, { type: 'saving' });
        state = pilotDraftReducer(state, {
            type: 'edit',
            content: initialPilotContent('Newer local'),
        });
        state = pilotDraftReducer(state, {
            type: 'saved',
            snapshot: snapshot(2, 'Submitted'),
        });
        expect(state.content.title).toBe('Newer local');
        expect(state.base.content.title).toBe('Submitted');
        expect(isDirty(state)).toBe(true);
    });

    test('late save response does not hide a newer competing revision', () => {
        let state = createDraft(snapshot());
        state = pilotDraftReducer(state, {
            type: 'edit',
            content: initialPilotContent('Submitted'),
        });
        state = pilotDraftReducer(state, { type: 'saving' });
        state = pilotDraftReducer(state, {
            type: 'remote',
            snapshot: snapshot(3, 'Someone else'),
        });
        state = pilotDraftReducer(state, {
            type: 'saved',
            snapshot: snapshot(2, 'Submitted'),
        });
        expect(state.latest.revision).toBe(3);
        expect(hasConflict(state)).toBe(true);
        expect(state.content.title).toBe('Submitted');
    });

    test('old realtime delivery does not roll back a successful save', () => {
        let state = createDraft(snapshot(3, 'Current'));
        state = pilotDraftReducer(state, {
            type: 'remote',
            snapshot: snapshot(2, 'Old'),
        });
        expect(state.content.title).toBe('Current');
        expect(state.base.revision).toBe(3);
    });

    test('back navigation restores an unsaved draft without treating it as saved', () => {
        const draft = pilotDraftReducer(createDraft(snapshot()), {
            type: 'edit',
            content: initialPilotContent('Local'),
        });
        const restored = restoreDraft(snapshot(), serializeDraft(draft));
        expect(restored.content.title).toBe('Local');
        expect(isDirty(restored)).toBe(true);
        expect(restored.base.revision).toBe(1);
        expect(serializeDraft(createDraft(snapshot()))).toBeNull();
    });

    test('restoring after someone else saved requires explicit conflict resolution', () => {
        const draft = pilotDraftReducer(createDraft(snapshot()), {
            type: 'edit',
            content: initialPilotContent('Local'),
        });
        const restored = restoreDraft(snapshot(2, 'Remote'), serializeDraft(draft));
        expect(restored.content.title).toBe('Local');
        expect(hasConflict(restored)).toBe(true);
        expect(restored.base.revision).toBe(1);
        expect(restored.latest.revision).toBe(2);
        expect(pilotDraftReducer(restored, { type: 'reload' }).content.title).toBe('Remote');
    });

    test('a save accepted before reload is recognized when cloud content matches', () => {
        const restored = restoreDraft(
            snapshot(2, 'Same'),
            JSON.stringify({ baseRevision: 1, content: initialPilotContent('Same') }),
        );
        const state = pilotDraftReducer(restored, {
            type: 'remote',
            snapshot: snapshot(2, 'Same'),
        });
        expect(hasConflict(state)).toBe(false);
        expect(isDirty(state)).toBe(false);
        expect(state.base.revision).toBe(2);
        expect(serializeDraft(state)).toBeNull();
    });

    test('restores edits typed after an acknowledged in-flight save without a false conflict', () => {
        let state = pilotDraftReducer(createDraft(snapshot()), {
            type: 'edit',
            content: initialPilotContent('Submitted'),
        });
        state = pilotDraftReducer(state, { type: 'saving' });
        state = pilotDraftReducer(state, {
            type: 'edit',
            content: initialPilotContent('Newer local'),
        });
        const stored = serializeDraft(state);
        const restored = restoreDraft(snapshot(2, 'Submitted'), stored);
        expect(restored.content.title).toBe('Newer local');
        expect(restored.base.revision).toBe(2);
        expect(isDirty(restored)).toBe(true);
        expect(hasConflict(restored)).toBe(false);
        expect(hasConflict(restoreDraft(snapshot(3, 'Submitted'), stored))).toBe(true);
    });

    test('session recovery is scoped by account and project and rejects malformed cache', () => {
        expect(draftStorageKey('user-a', 'project-a')).not.toBe(
            draftStorageKey('user-b', 'project-a'),
        );
        expect(draftStorageKey('user-a', 'project-a')).not.toBe(
            draftStorageKey('user-a', 'project-b'),
        );
        expect(restoreDraft(snapshot(), '{bad').content.title).toBe('Original');
        expect(
            restoreDraft(
                snapshot(),
                JSON.stringify({ baseRevision: 1, content: { title: 'Partial' } }),
            ).content.title,
        ).toBe('Original');
        expect(
            restoreDraft(
                snapshot(),
                JSON.stringify({
                    baseRevision: 1,
                    content: { ...initialPilotContent('Bad'), alignment: ['left'] },
                }),
            ).content.title,
        ).toBe('Original');
        expect(
            restoreDraft(
                snapshot(),
                JSON.stringify({
                    baseRevision: 99,
                    content: initialPilotContent('Future'),
                }),
            ).content.title,
        ).toBe('Original');
    });

    test('temporarily invalid input still survives navigation for correction', () => {
        const draft = pilotDraftReducer(createDraft(snapshot()), {
            type: 'edit',
            content: initialPilotContent(''),
        });
        const restored = restoreDraft(snapshot(), serializeDraft(draft));
        expect(restored.content.title).toBe('');
        expect(isDirty(restored)).toBe(true);
    });
});
