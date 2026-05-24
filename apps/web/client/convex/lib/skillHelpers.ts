import { z } from 'zod';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { requireCap, requireUser } from './permissions';

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
 *
 * Convex port of apps/web/client/src/server/api/routers/skill/helper.ts.
 */
export async function verifySkillAccess(
    ctx: QueryCtx | MutationCtx,
    skillId: Id<'skills'>,
): Promise<Doc<'skills'>> {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(skillId);
    if (!row || row.userId !== user._id) {
        throw new Error('NOT_FOUND: skill');
    }
    if (row.projectId) {
        await requireCap(ctx, 'project.view', { projectId: row.projectId });
    }
    return row;
}
