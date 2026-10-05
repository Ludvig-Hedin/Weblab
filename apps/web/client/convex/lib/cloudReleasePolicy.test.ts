import { describe, expect, it } from 'bun:test';
import { aliasReceiptMatches, canReleaseDestination, destinationKey, releasePath, releaseRequestMatches } from './cloudReleasePolicy';

describe('cloud release boundaries', () => {
    it('canonicalizes only one exact provider-owned test hostname', () => {
        expect(destinationKey('team_a', 'prj_b', 'review-site.vercel.app')).toBe('team_a/prj_b/review-site.vercel.app');
        for (const host of ['site.com', 'https://site.vercel.app', 'site.vercel.app.evil.test', '../x.vercel.app', 'a.b.vercel.app']) {
            expect(() => destinationKey('team_a', 'prj_b', host)).toThrow();
        }
    });
    it('requires the correlated alias receipt and both expected pointers', () => {
        const input = { expectedPrevious: 'old', observedPrevious: 'old', expectedTarget: 'new', observedTarget: 'new', expectedHostname: 'site.vercel.app', observedHostname: 'site.vercel.app' };
        expect(aliasReceiptMatches(input)).toBe(true);
        expect(aliasReceiptMatches({ ...input, observedPrevious: 'outside-writer' })).toBe(false);
        expect(aliasReceiptMatches({ ...input, observedTarget: 'old' })).toBe(false);
        expect(aliasReceiptMatches({ ...input, observedHostname: 'another.vercel.app' })).toBe(false);
    });
    it('does not unlock unknown or sending work even when its worker stopped', () => {
        for (const stage of ['unknown', 'sending', 'queued', 'observing'] as const) {
            for (const scheduler of ['success', 'failed', 'canceled']) expect(canReleaseDestination(stage, scheduler)).toBe(false);
        }
        expect(canReleaseDestination('confirmed', 'inProgress')).toBe(false);
        expect(canReleaseDestination('confirmed', 'success')).toBe(true);
        expect(canReleaseDestination('failed', 'failed')).toBe(true);
    });
    it('rejects caller-key reuse for another version or kind', () => {
        const prior = { kind: 'publish' as const, releaseId: 'one', sourceHash: 'hash', expectedLiveReleaseId: 'old' };
        expect(releaseRequestMatches(prior, prior)).toBe(true);
        expect(releaseRequestMatches(prior, { ...prior, kind: 'rollback' })).toBe(false);
        expect(releaseRequestMatches(prior, { ...prior, releaseId: 'two' })).toBe(false);
        expect(releaseRequestMatches(prior, { ...prior, sourceHash: 'changed' })).toBe(false);
    });
    it('requires the original live confirmation, including explicit no-live confirmation', () => {
        const prior = { kind: 'publish' as const, releaseId: 'one', sourceHash: 'hash', expectedLiveReleaseId: 'old' };
        const firstPublish = { ...prior, expectedLiveReleaseId: null };
        expect(releaseRequestMatches(prior, { ...prior, expectedLiveReleaseId: 'changed' })).toBe(false);
        expect(releaseRequestMatches(prior, firstPublish)).toBe(false);
        expect(releaseRequestMatches(firstPublish, prior)).toBe(false);
        expect(releaseRequestMatches(firstPublish, firstPublish)).toBe(true);
        const legacy = { kind: prior.kind, releaseId: prior.releaseId, sourceHash: prior.sourceHash };
        expect(releaseRequestMatches(legacy, prior)).toBe(false);
        expect(releaseRequestMatches(legacy, firstPublish)).toBe(false);
    });
    it('refuses private files and traversal before upload', () => {
        for (const path of ['.env.local', '.git/config', 'a/../secret', '/absolute', 'a\\b', 'key.pem']) expect(() => releasePath(path)).toThrow();
        expect(() => releasePath('src/app/journal/page.tsx')).not.toThrow();
    });
});
