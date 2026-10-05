import { describe, expect, it } from 'bun:test';
import type { Id } from '@convex/_generated/dataModel';
import { createReleaseIntent, releaseConfirmationChanged, releaseResultUncertain } from './state';

const release = (id: string) => id as Id<'cloudReleases'>;
describe('release confirmation and uncertain result', () => {
    it('keeps rollback target, baseline and retry key pinned when another release becomes live', () => {
        const requests: string[] = [];
        const keyFor = (scope: string) => { requests.push(scope); return `operation:${scope}`; };
        let liveReleaseId: Id<'cloudReleases'> | null = release('B');
        const confirmation = createReleaseIntent(release('A'), 'rollback', liveReleaseId, keyFor);
        liveReleaseId = release('C');
        expect(releaseConfirmationChanged(confirmation, liveReleaseId)).toBe(true);
        expect(confirmation.expectedLiveReleaseId).toBe(release('B'));
        expect(confirmation.operationKey).toBe('operation:rollback/A/B');
        expect(requests).toEqual(['rollback/A/B']);
        const reopened = createReleaseIntent(release('A'), 'rollback', liveReleaseId, keyFor);
        expect(reopened.expectedLiveReleaseId).toBe(release('C'));
        expect(reopened.operationKey).not.toBe(confirmation.operationKey);
    });
    it('also pins an empty live baseline instead of adopting a first concurrent publication', () => {
        const confirmation = createReleaseIntent(release('A'), 'publish', null, scope => scope);
        expect(confirmation.expectedLiveReleaseId).toBeNull();
        expect(confirmation.operationKey).toBe('publish/A/empty');
        expect(releaseConfirmationChanged(confirmation, null)).toBe(false);
        expect(releaseConfirmationChanged(confirmation, release('B'))).toBe(true);
    });
    it('distinguishes unknown outcomes from queued work and completed failures', () => {
        expect(releaseResultUncertain([{ stage: 'queued' }, { stage: 'sending' }])).toBe(false);
        expect(releaseResultUncertain([{ stage: 'confirmed' }, { stage: 'failed' }])).toBe(false);
        expect(releaseResultUncertain([{ stage: 'unknown' }])).toBe(true);
        expect(releaseResultUncertain([{ stage: 'confirmed' }, { stage: 'unknown' }])).toBe(true);
    });
});
