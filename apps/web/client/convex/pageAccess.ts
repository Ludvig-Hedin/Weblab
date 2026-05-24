import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { vPageAccessType } from './lib/enums';
import { hashPassword } from './lib/passwordHash';
import { requireCap } from './lib/permissions';

// Convex port of src/server/api/routers/page-access/index.ts.
//
// PBKDF2 password hashing runs under Web Crypto (works in the default V8
// runtime) — see lib/passwordHash.ts. Never exposes the stored hash to
// the client.

const PAGE_PATH = v.string();

function assertPagePath(pagePath: string): void {
    if (!pagePath.startsWith('/')) {
        throw new Error('BAD_REQUEST: pagePath must start with "/"');
    }
    if (pagePath.length === 0) throw new Error('BAD_REQUEST: pagePath required');
}

export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('pageAccess')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        return rows.map(({ passwordHash: _drop, ...rest }) => rest);
    },
});

export const get = query({
    args: {
        projectId: v.id('projects'),
        pagePath: PAGE_PATH,
    },
    handler: async (ctx, { projectId, pagePath }) => {
        assertPagePath(pagePath);
        await requireCap(ctx, 'project.view', { projectId });
        const row = await ctx.db
            .query('pageAccess')
            .withIndex('by_project_path', (q) =>
                q.eq('projectId', projectId).eq('pagePath', pagePath),
            )
            .unique();
        if (!row) return { accessType: 'public' as const, hasPassword: false };
        return {
            accessType: row.accessType,
            hasPassword: Boolean(row.passwordHash),
        };
    },
});

export const upsert = mutation({
    args: {
        projectId: v.id('projects'),
        pagePath: PAGE_PATH,
        accessType: vPageAccessType,
        password: v.optional(v.string()),
    },
    handler: async (ctx, { projectId, pagePath, accessType, password }) => {
        assertPagePath(pagePath);
        await requireCap(ctx, 'project.publish', { projectId });

        if (accessType === 'password' && password !== undefined && password.length < 4) {
            throw new Error('BAD_REQUEST: Password must be at least 4 characters');
        }
        if (password !== undefined && password.length > 256) {
            throw new Error('BAD_REQUEST: Password too long');
        }

        const existing = await ctx.db
            .query('pageAccess')
            .withIndex('by_project_path', (q) =>
                q.eq('projectId', projectId).eq('pagePath', pagePath),
            )
            .unique();

        const now = Date.now();

        if (accessType === 'public') {
            if (existing) {
                await ctx.db.patch(existing._id, {
                    accessType: 'public',
                    passwordHash: undefined,
                    updatedAt: now,
                });
            }
            return { accessType: 'public' as const, hasPassword: false };
        }

        // accessType === 'password'
        let nextHash: string | undefined = existing?.passwordHash;
        if (password !== undefined && password.length > 0) {
            nextHash = await hashPassword(password);
        }
        if (!nextHash) {
            throw new Error(
                'BAD_REQUEST: A password is required when switching this page to password-protected.',
            );
        }

        if (existing) {
            await ctx.db.patch(existing._id, {
                accessType: 'password',
                passwordHash: nextHash,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert('pageAccess', {
                projectId,
                pagePath,
                accessType: 'password',
                passwordHash: nextHash,
                updatedAt: now,
            });
        }
        return { accessType: 'password' as const, hasPassword: true };
    },
});
