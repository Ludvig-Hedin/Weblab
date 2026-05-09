import type { Skill as DbSkill } from '../../schema';

/**
 * Plain shape of a skill returned to the AI / UI. Matches `SkillInfo` in
 * `@weblab/ai/skills` (shape) so the scoped loader can splice DB skills
 * into the same array as filesystem and embedded skills without conversion.
 */
export interface SkillRecord {
    id: string;
    userId: string;
    projectId: string | null;
    name: string;
    description: string;
    content: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export const fromDbSkill = (row: DbSkill): SkillRecord => ({
    id: row.id,
    userId: row.userId,
    projectId: row.projectId ?? null,
    name: row.name,
    description: row.description,
    content: row.content,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});
