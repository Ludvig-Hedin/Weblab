import { describe, expect, it } from 'bun:test';

import { parseRepoUrl } from './parse-repo-url';

describe('parseRepoUrl', () => {
    it('parses a plain https GitHub URL', () => {
        expect(parseRepoUrl('https://github.com/owner/repo')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('strips a trailing .git suffix', () => {
        expect(parseRepoUrl('https://github.com/owner/repo.git')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('ignores a trailing slash', () => {
        expect(parseRepoUrl('https://github.com/owner/repo/')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('drops a /tree/<branch> address-bar suffix', () => {
        expect(parseRepoUrl('https://github.com/owner/repo/tree/main')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('drops a /tree/<branch>/<subdir> suffix', () => {
        expect(parseRepoUrl('https://github.com/owner/repo/tree/main/packages/app')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('ignores query strings and hashes', () => {
        expect(parseRepoUrl('https://github.com/owner/repo?tab=readme#install')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('accepts http and www host variants', () => {
        expect(parseRepoUrl('http://www.github.com/owner/repo')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('preserves dots, hyphens, and underscores in owner/repo', () => {
        expect(parseRepoUrl('https://github.com/my-org/my.cool_repo')).toEqual({
            owner: 'my-org',
            repo: 'my.cool_repo',
        });
    });

    it('handles a .git suffix combined with a query string', () => {
        expect(parseRepoUrl('https://github.com/owner/repo.git?foo=bar')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('throws on a non-GitHub URL', () => {
        expect(() => parseRepoUrl('https://gitlab.com/owner/repo')).toThrow('Invalid GitHub URL');
    });

    it('throws on a GitHub URL missing the repo segment', () => {
        expect(() => parseRepoUrl('https://github.com/owner')).toThrow('Invalid GitHub URL');
    });

    it('throws on an empty string', () => {
        expect(() => parseRepoUrl('')).toThrow('Invalid GitHub URL');
    });

    it('throws on a scp-style SSH remote (https only is supported)', () => {
        // `git@github.com:owner/repo.git` uses a colon, not a slash, after the
        // host — documents that the address-bar parser is https-only.
        expect(() => parseRepoUrl('git@github.com:owner/repo.git')).toThrow('Invalid GitHub URL');
    });
});
