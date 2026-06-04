// Pure helper — derives a readable project name from a git clone URL. Extracted
// from `projectActions.createFromGit` so it can be unit-tested with bun:test
// (the repo's CI runner) without a convex-test harness.

/**
 * Last non-empty path segment of a git URL, with `.git` and any `?query`/`#hash`
 * stripped. Falls back to `'Imported project'` for empty/segmentless input.
 *
 * Examples:
 *   https://github.com/vercel/next.js        → 'next.js'
 *   https://github.com/owner/repo.git        → 'repo'
 *   https://github.com/owner/repo/?tab=x     → 'repo'
 */
export function deriveRepoName(repoUrl: string): string {
    const beforeQuery = (repoUrl ?? '').trim().split(/[?#]/)[0] ?? ''; // drop query/fragment
    const cleaned = beforeQuery.replace(/\.git$/, '');
    const segment = cleaned.split('/').filter(Boolean).pop();
    return segment && segment.length > 0 ? segment : 'Imported project';
}
