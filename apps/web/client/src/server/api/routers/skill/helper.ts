import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import { skills } from '@weblab/db';

import { requireCap } from '@/server/api/permissions/requireCap';

type DbOrTx = Pick<DrizzleDb, 'query'>;

/**
 * Stable skill names: lowercase letters, digits and hyphens, 2-40 chars,
 * must start and end alphanumeric. Mirrors the filesystem skill folder
 * naming convention so the same name resolves regardless of source.
 */
export const skillNameSchema = z
    .string()
    .min(2)
    .max(40)
    .regex(
        /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/,
        'Must be lowercase letters, digits, and hyphens; start and end alphanumeric',
    );

export const skillDescriptionSchema = z.string().max(200).default('');
export const skillContentSchema = z.string().max(50_000).default('');

/**
 * Authorize a skill mutation: load by id, confirm the requesting user owns
 * it. For project-scoped skills we additionally re-check project access so
 * a user that lost access to a project can no longer mutate skills they
 * scoped there.
 */
export async function verifySkillAccess(
    db: DbOrTx,
    userId: string,
    skillId: string,
): Promise<{ id: string; userId: string; projectId: string | null; name: string }> {
    const row = await db.query.skills.findFirst({
        where: eq(skills.id, skillId),
    });
    if (row?.userId !== userId) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Skill not found',
        });
    }
    if (row.projectId) {
        await requireCap(db, userId, 'project.view', { projectId: row.projectId });
    }
    return {
        id: row.id,
        userId: row.userId,
        projectId: row.projectId,
        name: row.name,
    };
}
