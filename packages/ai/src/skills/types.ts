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
    /** Absolute path to the SKILL.md on disk. */
    location: string;
}
