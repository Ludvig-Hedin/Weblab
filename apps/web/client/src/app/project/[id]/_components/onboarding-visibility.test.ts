import { describe, expect, it } from 'bun:test';

import { resolveOnboardingVisibility } from './onboarding-visibility';

describe('resolveOnboardingVisibility', () => {
    it('stays undecided while the per-user flag query is still loading', () => {
        expect(
            resolveOnboardingVisibility({ suppressed: false, user: undefined, localSeen: false }),
        ).toBeNull();
    });

    it('never shows for an existing user who already saw it (the reported bug)', () => {
        // Even with a cleared localforage cache (localSeen=false), the durable
        // per-user flag wins — so an existing user on a new browser/device does
        // NOT re-see the tour.
        expect(
            resolveOnboardingVisibility({
                suppressed: false,
                user: { hasSeenEditorOnboarding: true },
                localSeen: false,
            }),
        ).toBe(false);
    });

    it('shows for a genuinely new user once both signals resolve', () => {
        expect(
            resolveOnboardingVisibility({
                suppressed: false,
                user: { hasSeenEditorOnboarding: false },
                localSeen: false,
            }),
        ).toBe(true);
    });

    it('waits for the local cache before showing (avoids a flash)', () => {
        expect(
            resolveOnboardingVisibility({ suppressed: false, user: {}, localSeen: null }),
        ).toBeNull();
    });

    it('respects the local cache when the server flag is not yet set', () => {
        expect(resolveOnboardingVisibility({ suppressed: false, user: {}, localSeen: true })).toBe(
            false,
        );
    });

    it('never shows while suppressed (AI creation flow)', () => {
        expect(
            resolveOnboardingVisibility({
                suppressed: true,
                user: { hasSeenEditorOnboarding: false },
                localSeen: false,
            }),
        ).toBe(false);
    });

    it('never shows when not signed in', () => {
        expect(
            resolveOnboardingVisibility({ suppressed: false, user: null, localSeen: false }),
        ).toBe(false);
    });
});
