/**
 * Agent Skills (https://agentskills.io/home) — read-only model of a single
 * skill discovered under <repoRoot>/skills/<name>/SKILL.md.
 */

export interface SkillSummary {
    /** Skill name from frontmatter, falls back to the directory name. */
    name: string;
    /** One-line description from frontmatter, may be empty. */
    description: string;
}

export interface SkillInfo extends SkillSummary {
    /** Full markdown body (after frontmatter is stripped). */
    content: string;
    /** Where the skill came from. Filesystem paths for fs skills, sentinels
     *  like `<embedded>/...` or `<db>/...` for the other sources. */
    location: string;
}

/**
 * Per-request scope passed to `loadSkills` so the loader can fetch DB-backed
 * user/project skills in addition to the always-on filesystem + embedded
 * sources. When `userId` is omitted the loader stays local-only (matches
 * the pre-DB behavior so non-chat callers keep working).
 *
 * `trpcCaller` is the per-request authenticated tRPC caller (typeof
 * `api` from `@/trpc/server`). Typed as `unknown` here because packages/ai
 * cannot depend on the web app's AppRouter type — the loader narrows at
 * the use site.
 */
export interface SkillScope {
    userId?: string;
    projectId?: string | null;
    trpcCaller?: unknown;
}
