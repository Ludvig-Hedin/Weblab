import { describe, expect, it } from 'bun:test';

import type { GitHubRepo } from './github-tab.utils';
import { sortRepos } from './github-tab.utils';

const repo = (full_name: string, updated_at?: string | null): GitHubRepo => ({
    id: Math.floor(Math.random() * 1e9),
    full_name,
    private: false,
    updated_at,
});

describe('sortRepos', () => {
    it('orders most recently updated first', () => {
        const out = sortRepos([
            repo('a/old', '2020-01-01T00:00:00Z'),
            repo('a/new', '2026-01-01T00:00:00Z'),
            repo('a/mid', '2023-01-01T00:00:00Z'),
        ]);
        expect(out.map((r) => r.full_name)).toEqual(['a/new', 'a/mid', 'a/old']);
    });

    it('breaks ties alphabetically (case-insensitive) when timestamps match', () => {
        const ts = '2025-05-01T00:00:00Z';
        const out = sortRepos([repo('z/zeta', ts), repo('a/Alpha', ts), repo('m/Mike', ts)]);
        expect(out.map((r) => r.full_name)).toEqual(['a/Alpha', 'm/Mike', 'z/zeta']);
    });

    it('treats missing/null updated_at as oldest (epoch 0)', () => {
        const out = sortRepos([
            repo('a/no-date', null),
            repo('a/dated', '2024-01-01T00:00:00Z'),
            repo('a/undef'),
        ]);
        // dated first; the two undateds (epoch 0) fall back to A-Z.
        expect(out.map((r) => r.full_name)).toEqual(['a/dated', 'a/no-date', 'a/undef']);
    });

    it('does not mutate the input array', () => {
        const input = [repo('a/b', '2021-01-01T00:00:00Z'), repo('a/a', '2026-01-01T00:00:00Z')];
        const snapshot = input.map((r) => r.full_name);
        sortRepos(input);
        expect(input.map((r) => r.full_name)).toEqual(snapshot);
    });

    it('handles empty input', () => {
        expect(sortRepos([])).toEqual([]);
    });
});
