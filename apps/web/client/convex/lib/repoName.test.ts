import { describe, expect, it } from 'bun:test';

import { deriveRepoName } from './repoName';

describe('deriveRepoName', () => {
    it('returns the last path segment', () => {
        expect(deriveRepoName('https://github.com/owner/repo')).toBe('repo');
    });

    it('preserves dots in the repo name (e.g. next.js)', () => {
        expect(deriveRepoName('https://github.com/vercel/next.js')).toBe('next.js');
    });

    it('strips a trailing .git', () => {
        expect(deriveRepoName('https://github.com/owner/repo.git')).toBe('repo');
    });

    it('ignores a trailing slash', () => {
        expect(deriveRepoName('https://github.com/owner/repo/')).toBe('repo');
    });

    it('strips a query string', () => {
        expect(deriveRepoName('https://github.com/owner/repo?tab=readme')).toBe('repo');
    });

    it('strips a fragment', () => {
        expect(deriveRepoName('https://github.com/owner/repo#install')).toBe('repo');
    });

    it('handles .git + query together', () => {
        expect(deriveRepoName('https://github.com/owner/repo.git?foo=bar')).toBe('repo');
    });

    it('handles trailing slash + query together', () => {
        expect(deriveRepoName('https://github.com/owner/repo/?ref=main')).toBe('repo');
    });

    it('trims surrounding whitespace', () => {
        expect(deriveRepoName('  https://github.com/owner/repo  ')).toBe('repo');
    });

    it('falls back for an empty string', () => {
        expect(deriveRepoName('')).toBe('Imported project');
    });

    it('falls back for whitespace-only input', () => {
        expect(deriveRepoName('   ')).toBe('Imported project');
    });

    it('falls back when only slashes/query remain', () => {
        expect(deriveRepoName('/?x=1')).toBe('Imported project');
    });
});
