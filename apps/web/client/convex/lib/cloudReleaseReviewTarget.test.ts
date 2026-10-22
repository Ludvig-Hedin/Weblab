import { describe, expect, it } from 'bun:test';
import { sameReleaseReviewTarget, type ReleaseReviewTarget } from './cloudReleaseReviewTarget';

const starter: ReleaseReviewTarget = { deploymentUrl: 'https://one.vercel.app', deploymentId: 'dpl_one', hash: 'a'.repeat(64),
    destinationId: 'destination-one', generation: 1, credentialId: 'credential-one', credentialVersion: 1,
    credentialHash: 'b'.repeat(64), providerProof: 'c'.repeat(64), teamId: 'team_one', providerProjectId: 'prj_one', hostname: 'site.vercel.app' };
const imported: ReleaseReviewTarget = { ...starter, hostingProfile: 'imported-next-hosting-v1', deployHash: 'd'.repeat(64), buildPolicyHash: 'e'.repeat(64) };

describe('review target identity across credential reads', () => {
    it('preserves starter identity and accepts a complete identical imported target', () => {
        expect(sameReleaseReviewTarget(starter, { ...starter })).toBe(true);
        expect(sameReleaseReviewTarget(imported, { ...imported })).toBe(true);
        expect(sameReleaseReviewTarget(starter, imported)).toBe(false);
        expect(sameReleaseReviewTarget(imported, starter)).toBe(false);
    });
    it('refuses partial, malformed or changed imported pins in either authorization', () => {
        for (const key of ['hostingProfile', 'deployHash', 'buildPolicyHash'] as const) {
            const partial = { ...imported }; delete partial[key];
            expect(sameReleaseReviewTarget(partial, partial)).toBe(false);
            expect(sameReleaseReviewTarget(imported, partial)).toBe(false);
        }
        for (const key of ['deployHash', 'buildPolicyHash'] as const) {
            for (const value of ['', 'f'.repeat(64), `${imported[key]}\n`]) {
                expect(sameReleaseReviewTarget(imported, { ...imported, [key]: value })).toBe(false);
            }
        }
        expect(sameReleaseReviewTarget(imported, { ...imported, generation: 2 })).toBe(false);
        expect(sameReleaseReviewTarget(imported, { ...imported, credentialHash: 'f'.repeat(64) })).toBe(false);
    });
});
