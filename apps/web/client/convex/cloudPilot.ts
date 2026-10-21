import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { PilotSnapshot } from './lib/cloudPilot';
import { mutation, query } from './_generated/server';
import { ensureDefaultWeblabSourceId } from './cmsSources';
import {
    CLOUD_PILOT_COLLECTION,
    CLOUD_PILOT_TAG,
    CLOUD_PILOT_TEMPLATE,
    initialPilotContent,
    isCloudPilotProject,
    pilotContentValidator,
    pilotError,
    readPilotMetadata,
    validatePilotContent,
} from './lib/cloudPilot';
import { cmsRevision, nextCmsRevision } from './lib/cmsRevision';
import { getCapabilities, requireCap } from './lib/permissions';

// This new, fixed-template renderer never provisions a sandbox or unlocks old cloud APIs.
function enabled(): boolean {
    return process.env.WEBLAB_CLOUD_PILOT_ENABLED === 'true';
}

function requireEnabled(): void {
    if (!enabled()) pilotError('PILOT_DISABLED');
}

async function loadPilot(ctx: QueryCtx, project: Doc<'projects'>) {
    if (!isCloudPilotProject(project)) return pilotError('PILOT_UNSUPPORTED');
    const metadata = readPilotMetadata(project.runtimeMetadata);
    const itemId = ctx.db.normalizeId('cmsItems', metadata.itemId);
    const item = itemId ? await ctx.db.get(itemId) : null;
    const collection = item ? await ctx.db.get(item.collectionId) : null;
    const source = collection ? await ctx.db.get(collection.sourceId) : null;
    if (
        !item ||
        item.archivedAt !== undefined ||
        item.remoteId ||
        !collection ||
        collection.projectId !== project._id ||
        collection.slug !== CLOUD_PILOT_COLLECTION ||
        !source ||
        source.projectId !== project._id ||
        source.type !== 'weblab'
    ) {
        return pilotError('PILOT_DAMAGED');
    }
    return {
        item,
        content: validatePilotContent(item.values),
        template: metadata.template,
    };
}

export const workspace = query({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        const { user } = await requireCap(ctx, 'workspace.view', { workspaceId });
        const caps = await getCapabilities(ctx, { workspaceId });
        const existing = await findOwnedPilot(ctx, user._id, workspaceId);
        const canViewExisting = existing
            ? (await getCapabilities(ctx, { projectId: existing._id })).includes('project.view')
            : false;
        return {
            enabled: enabled(),
            canCreate: caps.includes('project.create'),
            existingProject:
                existing && canViewExisting ? { id: existing._id, name: existing.name } : null,
        };
    },
});

async function findOwnedPilot(ctx: QueryCtx, userId: Id<'users'>, workspaceId: Id<'workspaces'>) {
    const owned = await ctx.db
        .query('projects')
        .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', userId))
        .take(501);
    if (owned.length > 500) return pilotError('PILOT_LIMIT');
    return owned.find(
        (project) => project.workspaceId === workspaceId && isCloudPilotProject(project),
    );
}

export const create = mutation({
    args: { workspaceId: v.id('workspaces'), name: v.string() },
    handler: async (ctx, { workspaceId, name }) => {
        requireEnabled();
        const { user } = await requireCap(ctx, 'project.create', { workspaceId });
        const trimmed = name.trim();
        if (!trimmed || trimmed.length > 80) return pilotError('PILOT_INVALID_NAME');
        // One experiment per builder/workspace. Retrying an uncertain response reopens it.
        const existing = await findOwnedPilot(ctx, user._id, workspaceId);
        if (existing) {
            await requireCap(ctx, 'project.update', { projectId: existing._id });
            await loadPilot(ctx, existing);
            return existing._id;
        }
        const now = Date.now();
        const projectId = await ctx.db.insert('projects', {
            name: trimmed,
            tags: [CLOUD_PILOT_TAG],
            updatedAt: now,
            storageMode: 'cloud',
            runtimeMetadata: {},
            workspaceId,
            createdByUserId: user._id,
            accessMode: 'restricted',
        });
        await ctx.db.insert('projectMembers', {
            projectId,
            userId: user._id,
            role: 'manager',
            updatedAt: now,
        });
        const sourceId = await ensureDefaultWeblabSourceId(ctx, projectId);
        const collectionId = await ctx.db.insert('cmsCollections', {
            projectId,
            sourceId,
            name: trimmed,
            slug: CLOUD_PILOT_COLLECTION,
            updatedAt: now,
        });
        const fieldKeys = [
            'title',
            'description',
            'imageUrl',
            'imageAlt',
            'ctaLabel',
            'ctaHref',
            'alignment',
        ] as const;
        for (const [order, key] of fieldKeys.entries()) {
            await ctx.db.insert('cmsFields', {
                collectionId,
                key,
                name: key,
                type: key === 'alignment' ? 'option' : 'text',
                required: key === 'title' || key === 'alignment',
                order,
                updatedAt: now,
                config: key === 'alignment' ? { options: ['left', 'center'], multiple: false } : {},
            });
        }
        const itemId = await ctx.db.insert('cmsItems', {
            collectionId,
            slug: 'home',
            status: 'draft',
            revision: 1,
            values: initialPilotContent(trimmed),
            updatedAt: now,
        });
        await ctx.db.patch(projectId, {
            runtimeMetadata: {
                framework: 'nextjs',
                cloudPilot: { template: CLOUD_PILOT_TEMPLATE, itemId },
            },
        });
        return projectId;
    },
});

async function snapshot(ctx: QueryCtx, projectId: Id<'projects'>): Promise<PilotSnapshot> {
    const { project } = await requireCap(ctx, 'project.view', { projectId });
    if (!project) return pilotError('PILOT_DAMAGED');
    const { item, content, template } = await loadPilot(ctx, project);
    const caps = await getCapabilities(ctx, { projectId });
    return {
        projectId,
        name: project.name,
        template,
        content,
        revision: cmsRevision(item),
        updatedAt: item.updatedAt,
        canEdit: caps.includes('project.update'),
        enabled: enabled(),
    };
}

/** Reads remain available when the experiment is paused; writes fail closed. */
export const get = query({
    args: { projectId: v.id('projects') },
    handler: (ctx, { projectId }) => snapshot(ctx, projectId),
});

export const save = mutation({
    args: {
        projectId: v.id('projects'),
        expectedRevision: v.number(),
        content: pilotContentValidator,
    },
    handler: async (ctx, { projectId, expectedRevision, content }) => {
        requireEnabled();
        const { project } = await requireCap(ctx, 'project.update', { projectId });
        if (!project) return pilotError('PILOT_DAMAGED');
        const { item } = await loadPilot(ctx, project);
        if (cmsRevision(item) !== expectedRevision) return pilotError('PILOT_CONFLICT');
        const revision = nextCmsRevision(item, expectedRevision);
        await ctx.db.patch(item._id, {
            values: validatePilotContent(content),
            revision,
            status: 'draft',
            updatedAt: Date.now(),
        });
        await ctx.db.patch(projectId, { updatedAt: Date.now() });
        return snapshot(ctx, projectId);
    },
});
