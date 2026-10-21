import { isImportedCloudProfile, MAX_IMPORT_BYTES, sourceProfileCapabilities } from './lib/cloudImportManifest';
import { assertImportedTextChanges, getPreparedImport } from './lib/cloudImportedState';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import {
    authorizeCloudPreviewStart,
    hasCloudPreviewLock,
    requireCloudAccess,
} from './cloudEditorAccess';
import { commitCloudEditorUploads } from './cloudEditorUploads';
import { getCloudPreviewTicket } from './cloudPreviewAccess';
import {
    assertCloudRevision,
    assertOperationId,
    CLOUD_EDITOR_TAG,
    cloudChange,
    cloudError,
    cloudPath,
    cloudScope,
    inlineSourceBytes,
    MAX_CLOUD_FILES,
    MAX_CLOUD_INLINE_BYTES,
    MAX_CLOUD_PROJECT_BYTES,
    MAX_CLOUD_TEXT_BYTES,
} from './lib/cloudEditor';
import { isCloudPilotProject, readPilotMetadata, validatePilotContent } from './lib/cloudPilot';
import { requireCloudProjectCapability } from './lib/cloudProjectAdmission';
import { getCapabilities, requireCap } from './lib/permissions';

const syncRef = makeFunctionReference<
    'action',
    {
        projectId: Id<'projects'>;
        branchId: Id<'branches'>;
        allowCreate?: boolean;
        requestGeneration?: number;
    },
    null
>('cloudEditorRuntime:sync');
const storedChange = v.object({
    path: v.string(),
    kind: v.union(v.literal('file'), v.literal('directory'), v.literal('delete')),
    text: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    hash: v.string(),
    bytes: v.number(),
});

function requireEnabled(): void {
    if (process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true') cloudError('CLOUD_DISABLED');
}

async function enrolled(
    ctx: QueryCtx | MutationCtx,
    scope: { projectId: Id<'projects'>; branchId: Id<'branches'> },
    write = false,
) {
    if (write) return requireCloudAccess(ctx, scope, 'designer');
    const access = await requireCloudProjectCapability(ctx, scope);
    const branch = await ctx.db.get(scope.branchId);
    const state = await ctx.db
        .query('cloudEditorStates')
        .withIndex('by_branchId', (q) => q.eq('branchId', scope.branchId))
        .unique();
    if (
        !branch ||
        branch.projectId !== scope.projectId ||
        !state ||
        state.projectId !== scope.projectId ||
        state.version !== 1
    )
        return cloudError('CLOUD_NOT_ENROLLED');
    if (isImportedCloudProfile(state.profile)) {
        const importedAccess = await requireCloudAccess(ctx, scope);
        if (!importedAccess.canReadSource) return cloudError('CLOUD_ROLE_REQUIRED');
    }
    return { ...access, branch, state };
}

async function filesFor(ctx: QueryCtx | MutationCtx, branchId: Id<'branches'>) {
    const files = await ctx.db
        .query('cloudEditorFiles')
        .withIndex('by_branchId_path', (q) => q.eq('branchId', branchId))
        .take(MAX_CLOUD_FILES + 1);
    if (files.length > MAX_CLOUD_FILES) return cloudError('CLOUD_FILE_LIMIT');
    return files;
}

export const _operation = internalQuery({
    args: {
        ...cloudScope,
        actorId: v.id('users'),
        expectedRevision: v.number(),
        operationId: v.string(),
        fingerprint: v.string(),
        changes: v.optional(v.array(cloudChange)),
    },
    handler: async (ctx, args) => {
        requireEnabled();
        const { state, user } = await enrolled(ctx, args, true);
        if (user._id !== args.actorId) return cloudError('CLOUD_ACTOR_CHANGED');
        const op = await ctx.db
            .query('cloudEditorOperations')
            .withIndex('by_branchId_operationId', (q) =>
                q.eq('branchId', args.branchId).eq('operationId', args.operationId),
            )
            .unique();
        if (op) {
            if (op.userId !== user._id || op.fingerprint !== args.fingerprint)
                return cloudError('CLOUD_INVALID_OPERATION');
            return {
                revision: op.revision,
                currentRevision: state.revision,
                storageIds: op.storageIds,
            };
        }
        if (state.revision !== args.expectedRevision) return cloudError('CLOUD_CONFLICT');
        if (state.profile === 'imported-next-v1') {
            const preparation = await getPreparedImport(ctx, state);
            if (!preparation || !args.changes) return cloudError('CLOUD_IMPORT_PREPARATION_REQUIRED');
            const changes = await Promise.all(args.changes.map(async change => {
                const text = typeof change.content === 'string' ? change.content : undefined;
                const bytes = text === undefined ? 0 : new TextEncoder().encode(text).byteLength;
                const hash = text === undefined ? '' : Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
                return { path: change.path, kind: change.directory ? 'directory' as const : change.content === null ? 'delete' as const : 'file' as const, text, bytes, hash };
            }));
            await assertImportedTextChanges(await filesFor(ctx, args.branchId), changes, preparation.policy);
        }
        return null;
    },
});

export const snapshot = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const { state, user } = await enrolled(ctx, scope);
        const files = await filesFor(ctx, scope.branchId);
        if (files.some(file => file.projectId !== scope.projectId || file.branchId !== scope.branchId))
            return cloudError('CLOUD_NOT_ENROLLED');
        return {
            ...(isImportedCloudProfile(state.profile) ? { importedAuthority: {
                preparationId: state.preparationId ?? null, designRevision: state.designRevision ?? null,
            } } : {}),
            actorId: user._id,
            profile: state.profile ?? 'starter-v1',
            revision: state.revision,
            files: await Promise.all(
                files.map(async (f) => ({
                    path: f.path,
                    kind: f.kind,
                    text: f.text ?? null,
                    storageId: isImportedCloudProfile(state.profile) ? null : f.storageId ?? null,
                    hash: f.hash,
                    bytes: f.bytes,
                })),
            ),
        };
    },
});

export const status = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const { state, user } = await enrolled(ctx, scope);
        return {
            actorId: user._id,
            ...(isImportedCloudProfile(state.profile) ? { importedAuthority: {
                preparationId: state.preparationId ?? null, designRevision: state.designRevision ?? null,
            } } : {}),
            profile: state.profile ?? 'starter-v1',
            capabilities: sourceProfileCapabilities(state.profile),
            revision: state.revision,
            appliedRevision: state.appliedRevision ?? null,
            status: state.status,
            previewUrl: state.previewUrl ?? null,
            error: state.error ?? null,
            previewToken: await getCloudPreviewTicket(ctx, scope),
            expiresAt: state.expiresAt ?? null,
            enabled: process.env.WEBLAB_CLOUD_EDITOR_ENABLED === 'true' && sourceProfileCapabilities(state.profile).preview,
        };
    },
});

export const workspace = query({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        await requireCap(ctx, 'workspace.view', { workspaceId });
        const caps = await getCapabilities(ctx, { workspaceId });
        const states = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
            .take(4);
        const projects: Array<{ id: Id<'projects'>; name: string }> = [];
        for (const state of states) {
            if (
                !(await getCapabilities(ctx, { projectId: state.projectId })).includes(
                    'project.view',
                )
            )
                continue;
            const project = await ctx.db.get(state.projectId);
            if (project) projects.push({ id: project._id, name: project.name });
        }
        return {
            enabled: process.env.WEBLAB_CLOUD_EDITOR_ENABLED === 'true',
            canCreate: caps.includes('project.create') && states.length < 3,
            projects,
        };
    },
});

export const prepare = query({
    args: { workspaceId: v.id('workspaces'), sourcePilotId: v.optional(v.id('projects')) },
    handler: async (ctx, { workspaceId, sourcePilotId }) => {
        requireEnabled();
        await requireCap(ctx, 'project.create', { workspaceId });
        if (!sourcePilotId) return null;
        const { project } = await requireCap(ctx, 'project.update', { projectId: sourcePilotId });
        if (project?.workspaceId !== workspaceId || !isCloudPilotProject(project))
            return cloudError('CLOUD_INVALID_MIGRATION');
        const { itemId } = readPilotMetadata(project.runtimeMetadata);
        const id = ctx.db.normalizeId('cmsItems', itemId);
        const item = id ? await ctx.db.get(id) : null;
        const collection = item ? await ctx.db.get(item.collectionId) : null;
        if (
            !item ||
            item.archivedAt !== undefined ||
            item.remoteId ||
            collection?.projectId !== project._id
        )
            return cloudError('CLOUD_INVALID_MIGRATION');
        return { content: validatePilotContent(item.values), revision: item.revision ?? 0 };
    },
});

export const _create = internalMutation({
    args: {
        workspaceId: v.id('workspaces'),
        name: v.string(),
        creationId: v.string(),
        sourcePilotId: v.optional(v.id('projects')),
        sourcePilotRevision: v.optional(v.number()),
        files: v.array(storedChange),
    },
    handler: async (ctx, args) => {
        requireEnabled();
        assertOperationId(args.creationId);
        const { user } = await requireCap(ctx, 'project.create', { workspaceId: args.workspaceId });
        const prior = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_createdByUserId_creationId', (q) =>
                q.eq('createdByUserId', user._id).eq('creationId', args.creationId),
            )
            .unique();
        if (prior) {
            if (prior.workspaceId !== args.workspaceId)
                return cloudError('CLOUD_INVALID_OPERATION');
            await requireCap(ctx, 'project.view', { projectId: prior.projectId });
            return { projectId: prior.projectId, branchId: prior.branchId };
        }
        if (args.sourcePilotId) {
            const { project } = await requireCap(ctx, 'project.update', {
                projectId: args.sourcePilotId,
            });
            if (
                !project ||
                project.workspaceId !== args.workspaceId ||
                !isCloudPilotProject(project)
            )
                return cloudError('CLOUD_INVALID_MIGRATION');
            const previous = await ctx.db
                .query('cloudEditorStates')
                .withIndex('by_sourcePilotId', (q) => q.eq('sourcePilotId', args.sourcePilotId))
                .first();
            if (previous) {
                await requireCap(ctx, 'project.view', { projectId: previous.projectId });
                return { projectId: previous.projectId, branchId: previous.branchId };
            }
        }
        if (args.sourcePilotId) {
            const project = await ctx.db.get(args.sourcePilotId);
            const metadata = readPilotMetadata(project?.runtimeMetadata);
            const itemId = ctx.db.normalizeId('cmsItems', metadata.itemId);
            const item = itemId ? await ctx.db.get(itemId) : null;
            if (!item || (item.revision ?? 0) !== args.sourcePilotRevision)
                return cloudError('CLOUD_CONFLICT');
        }
        const existing = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
            .take(3);
        if (existing.length >= 3) return cloudError('CLOUD_PROJECT_LIMIT');
        const name = args.name.trim();
        if (!name || name.length > 80) return cloudError('CLOUD_INVALID_NAME');
        if (!args.files.length || args.files.length > MAX_CLOUD_FILES)
            return cloudError('CLOUD_FILE_LIMIT');
        const total = args.files.reduce((sum, f) => sum + f.bytes, 0);
        if (
            total > MAX_CLOUD_PROJECT_BYTES ||
            inlineSourceBytes(args.files) > MAX_CLOUD_INLINE_BYTES
        )
            return cloudError('CLOUD_PROJECT_TOO_LARGE');
        const now = Date.now();
        const projectId = await ctx.db.insert('projects', {
            name,
            tags: [CLOUD_EDITOR_TAG],
            storageMode: 'cloud',
            runtimeMetadata: { framework: 'nextjs', cloudEditor: { version: 1 } },
            workspaceId: args.workspaceId,
            createdByUserId: user._id,
            accessMode: 'restricted',
            updatedAt: now,
        });
        const branchId = await ctx.db.insert('branches', {
            projectId,
            name: 'main',
            isDefault: true,
            updatedAt: now,
            sandboxId: '',
            runtimeType: 'cloud',
            runtimeMetadata: {
                cloud: { provider: 'vercel_sandbox', sourceVersion: 1, port: 3000 },
            },
        });
        await ctx.db.insert('projectMembers', {
            projectId,
            userId: user._id,
            role: 'manager',
            updatedAt: now,
        });
        const canvasId = await ctx.db.insert('canvases', { projectId });
        await ctx.db.insert('userCanvases', {
            userId: user._id,
            canvasId,
            scale: 0.56,
            x: 120,
            y: 120,
        });
        const groupId = crypto.randomUUID();
        for (const f of [
            { name: 'Desktop', width: 1440, height: 960, x: 0, order: 0 },
            { name: 'Phone', width: 390, height: 844, x: 1500, order: 1 },
        ])
            await ctx.db.insert('frames', {
                canvasId,
                branchId,
                url: '',
                x: f.x,
                y: 0,
                width: f.width,
                height: f.height,
                groupId,
                breakpointId: f.name.toLowerCase(),
                breakpointName: f.name,
                breakpointOrder: f.order,
            });
        await ctx.db.insert('conversations', {
            projectId,
            displayName: 'New conversation',
            updatedAt: now,
        });
        const paths = new Set<string>();
        for (const file of args.files) {
            cloudPath(file.path);
            if (paths.has(file.path) || file.kind === 'delete')
                return cloudError('CLOUD_INVALID_CHANGES');
            paths.add(file.path);
            await ctx.db.insert('cloudEditorFiles', {
                ...file,
                kind: file.kind,
                projectId,
                branchId,
            });
        }
        await ctx.db.insert('cloudEditorStates', {
            projectId,
            branchId,
            workspaceId: args.workspaceId,
            createdByUserId: user._id,
            creationId: args.creationId,
            sourcePilotId: args.sourcePilotId,
            version: 1,
            revision: 1,
            bytes: total,
            fileCount: args.files.length,
            generation: 0,
            status: 'stopped',
            updatedAt: now,
        });
        return { projectId, branchId };
    },
});

export const _commit = internalMutation({
    args: {
        ...cloudScope,
        actorId: v.id('users'),
        expectedRevision: v.number(),
        operationId: v.string(),
        fingerprint: v.string(),
        attemptId: v.optional(v.id('cloudEditorUploadAttempts')),
        changes: v.array(storedChange),
    },
    handler: async (ctx, args) => {
        requireEnabled();
        assertCloudRevision(args.expectedRevision);
        assertOperationId(args.operationId);
        const { state, user } = await enrolled(ctx, args, true);
        if (user._id !== args.actorId) return cloudError('CLOUD_ACTOR_CHANGED');
        const prior = await ctx.db
            .query('cloudEditorOperations')
            .withIndex('by_branchId_operationId', (q) =>
                q.eq('branchId', args.branchId).eq('operationId', args.operationId),
            )
            .unique();
        if (prior) {
            if (prior.userId !== user._id || prior.fingerprint !== args.fingerprint)
                return cloudError('CLOUD_INVALID_OPERATION');
            return {
                revision: prior.revision,
                currentRevision: state.revision,
                storageIds: prior.storageIds,
            };
        }
        if (state.revision !== args.expectedRevision) return cloudError('CLOUD_CONFLICT');
        if (!args.changes.length || args.changes.length > MAX_CLOUD_FILES)
            return cloudError('CLOUD_INVALID_CHANGES');
        const files = await filesFor(ctx, args.branchId);
        if (state.profile === 'imported-next-v1') {
            const preparation = await getPreparedImport(ctx, state);
            if (!preparation) return cloudError('CLOUD_IMPORT_PREPARATION_REQUIRED');
            await assertImportedTextChanges(files, args.changes, preparation.policy);
        }
        const next = new Map<string, { kind: 'file' | 'directory'; bytes: number; text?: string }>(
            files.map((f) => [f.path, f]),
        );
        const oldByPath = new Map(files.map((f) => [f.path, f]));
        const changedPaths = new Set<string>();
        let total = state.profile === 'imported-next-v1' ? files.reduce((sum, file) => sum + file.bytes, 0) : state.bytes;
        for (const change of args.changes) {
            cloudPath(change.path);
            if (change.path === '.weblab' && change.kind === 'file')
                return cloudError('CLOUD_INVALID_DIRECTORY');
            if (changedPaths.has(change.path)) return cloudError('CLOUD_DUPLICATE_PATH');
            changedPaths.add(change.path);
            const old = oldByPath.get(change.path);
            total -= old?.bytes ?? 0;
            if (change.kind === 'delete') {
                if (old) await ctx.db.delete(old._id);
                next.delete(change.path);
            } else {
                total += change.bytes;
                const value = {
                    ...change,
                    kind: change.kind,
                    projectId: args.projectId,
                    branchId: args.branchId,
                };
                if (old) await ctx.db.replace(old._id, value);
                else await ctx.db.insert('cloudEditorFiles', value);
                next.set(change.path, value);
            }
        }
        if (
            next.size > MAX_CLOUD_FILES ||
            total > (isImportedCloudProfile(state.profile) ? MAX_IMPORT_BYTES : MAX_CLOUD_PROJECT_BYTES) ||
            inlineSourceBytes(next.values()) > MAX_CLOUD_INLINE_BYTES
        )
            return cloudError('CLOUD_PROJECT_TOO_LARGE');
        for (const [path, file] of next) {
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
                const parent = next.get(parts.slice(0, i).join('/'));
                if (parent?.kind === 'file') return cloudError('CLOUD_PATH_COLLISION');
            }
            if (file.kind === 'directory' && file.bytes !== 0)
                return cloudError('CLOUD_INVALID_DIRECTORY');
        }
        const storageIds = args.changes.flatMap((change) =>
            change.storageId ? [change.storageId] : [],
        );
        await commitCloudEditorUploads(ctx, { ...args, userId: user._id, storageIds });
        const revision = state.revision + 1;
        assertCloudRevision(revision);
        await ctx.db.patch(state._id, {
            revision,
            ...(isImportedCloudProfile(state.profile) ? { designRevision: revision } : {}),
            bytes: total,
            fileCount: next.size,
            updatedAt: Date.now(),
        });
        await ctx.db.insert('cloudEditorOperations', {
            projectId: args.projectId,
            branchId: args.branchId,
            userId: user._id,
            operationId: args.operationId,
            fingerprint: args.fingerprint,
            revision,
            storageIds,
            createdAt: Date.now(),
        });
        await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
        await ctx.scheduler.runAfter(0, syncRef, {
            projectId: args.projectId,
            branchId: args.branchId,
        });
        return { revision, currentRevision: revision, storageIds };
    },
});

export const ensurePreview = mutation({
    args: cloudScope,
    handler: async (ctx, scope) => {
        requireEnabled();
        const { state, canDesign, canPreview, user } = await requireCloudAccess(ctx, scope);
        if (!canPreview) return cloudError('CLOUD_ROLE_REQUIRED');
        if (
            (state.leaseUntil ?? 0) > Date.now() ||
            (state.status === 'ready' &&
                state.previewGatewayVersion === 2 &&
                state.appliedRevision === state.revision &&
                (state.expiresAt ?? 0) > Date.now() + 60_000)
        )
            return null;
        // Multiple tabs and duplicate clicks share one pending start, not multiple allowances.
        if (
            state.previewStartRequest &&
            (await authorizeCloudPreviewStart(ctx, scope, state.previewStartRequest.generation))
        )
            return null;
        const requestGeneration = (state.previewRequestGeneration ?? 0) + 1;
        if (!Number.isSafeInteger(requestGeneration))
            return cloudError('CLOUD_INVALID_PREVIEW_ALLOWANCE');
        if (!canDesign) {
            if (
                state.status === 'ready' &&
                state.previewGatewayVersion === 2 &&
                state.sandboxId &&
                (state.expiresAt ?? 0) > Date.now() + 60_000
            ) {
                await ctx.scheduler.runAfter(0, syncRef, scope);
                return null;
            }
            if (!(await hasCloudPreviewLock(ctx, scope)))
                return cloudError('CLOUD_PREVIEW_PREPARATION_REQUIRED');
            const allowance = state.contentPreviewAllowance;
            if (!allowance || allowance.expiresAt <= Date.now() || allowance.remainingStarts < 1)
                return cloudError('CLOUD_PREVIEW_ALLOWANCE_REQUIRED');
            // Failed/uncertain starts keep the reservation; replacing the allowance
            // cancels requests from its previous generation, including queued work.
            await ctx.db.patch(state._id, {
                contentPreviewAllowance: {
                    ...allowance,
                    remainingStarts: allowance.remainingStarts - 1,
                },
            });
        }
        await ctx.db.patch(state._id, {
            previewRequestGeneration: requestGeneration,
            previewStartRequest: {
                generation: requestGeneration,
                actorId: user._id,
                kind: canDesign ? 'design' : 'content',
                expiresAt: Date.now() + 5 * 60_000,
                ...(!canDesign
                    ? { allowanceGeneration: state.contentPreviewAllowance?.generation ?? 0 }
                    : {}),
            },
        });
        await ctx.scheduler.runAfter(0, syncRef, {
            ...scope,
            allowCreate: true,
            requestGeneration,
        });
        return null;
    },
});

export const _previewStartAuthorized = internalQuery({
    args: { ...cloudScope, requestGeneration: v.number(), token: v.optional(v.string()) },
    handler: async (ctx, args) =>
        authorizeCloudPreviewStart(ctx, args, args.requestGeneration, args.token),
});

export const _runtimeInput = internalQuery({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const state = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_branchId', (q) => q.eq('branchId', scope.branchId))
            .unique();
        if (!state || state.projectId !== scope.projectId || !sourceProfileCapabilities(state.profile).preview || !(await ctx.db.get(scope.projectId)))
            return null;
        const files = await filesFor(ctx, scope.branchId);
        const preparation = await getPreparedImport(ctx, state);
        if (files.some(file => file.projectId !== scope.projectId || file.branchId !== scope.branchId)) return cloudError('CLOUD_NOT_ENROLLED');
        return {
            state,
            policy: preparation?.policy ?? null,
            files: await Promise.all(
                files.map(async (f) => ({
                    ...f,
                    url: f.storageId ? await ctx.storage.getUrl(f.storageId) : null,
                })),
            ),
        };
    },
});

export const _lease = internalMutation({
    args: { ...cloudScope, token: v.string() },
    handler: async (ctx, scope) => {
        requireEnabled();
        const state = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_branchId', (q) => q.eq('branchId', scope.branchId))
            .unique();
        if (!state || state.projectId !== scope.projectId || !sourceProfileCapabilities(state.profile).preview || !(await ctx.db.get(scope.projectId)))
            return null;
        await getPreparedImport(ctx, state);
        if (state.leaseUntil && state.leaseUntil > Date.now()) return null;
        if (
            state.status === 'ready' && state.previewGatewayVersion === 2 &&
            state.appliedRevision === state.revision &&
            (state.expiresAt ?? 0) > Date.now() + 60_000
        )
            return null;
        const reuse =
            state.status === 'ready' && state.previewGatewayVersion === 2 &&
            !!state.sandboxId &&
            (state.expiresAt ?? 0) > Date.now() + 60_000;
        const starts = (state.runtimeStarts ?? []).filter((time) => time > Date.now() - 3_600_000);
        if (starts.length >= 4 && !reuse) {
            await ctx.db.patch(state._id, {
                status: 'error',
                error: 'Preview restart limit reached. Your files are saved. Try again later.',
            });
            return null;
        }
        await ctx.db.patch(state._id, {
            generation: state.generation + 1,
            leaseToken: scope.token,
            leaseUntil: Date.now() + 240_000,
            status: 'starting',
            error: undefined,
        });
        return { reuse, generation: state.generation + 1 };
    },
});

export const _runtimeReady = internalMutation({
    args: {
        ...cloudScope,
        token: v.string(),
        revision: v.number(),
        sandboxId: v.string(),
        previewUrl: v.string(),
        expiresAt: v.number(),
        previewToken: v.string(),
        paths: v.array(v.string()),
        dependencyHash: v.string(),
        requestGeneration: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const state = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_branchId', (q) => q.eq('branchId', args.branchId))
            .unique();
        if (
            !state ||
            state.projectId !== args.projectId ||
            !sourceProfileCapabilities(state.profile).preview ||
            state.leaseToken !== args.token ||
            (state.leaseUntil ?? 0) <= Date.now()
        )
            return false;
        const preparation = await getPreparedImport(ctx, state);
        if (preparation) {
            const policy = preparation.policy;
            const body = JSON.stringify({ profile: 'imported-next-v1', profileVersion: 1, preparationVersion: 1,
                policyHash: policy.policyHash, node: policy.node, bun: policy.bun, archive: policy.bunArchiveSha256, pins: policy.pinnedFiles });
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), byte => byte.toString(16).padStart(2, '0')).join('');
            if (args.dependencyHash !== hash || !Number.isSafeInteger(args.revision) ||
                args.revision < preparation.preparedRevision || args.revision > state.revision) return false;
            const files = await filesFor(ctx, args.branchId);
            const paths = new Set(args.paths);
            if (paths.size !== args.paths.length || paths.size !== files.length ||
                files.some(file => file.projectId !== args.projectId || !paths.has(file.path))) return false;
        }
        if (
            args.requestGeneration !== undefined &&
            !(await authorizeCloudPreviewStart(ctx, args, args.requestGeneration, args.token))
        )
            return false;
        const project = await ctx.db.get(args.projectId);
        const branch = await ctx.db.get(args.branchId);
        if (!project || !branch || branch.projectId !== project._id) return false;
        const slot = await ctx.db
            .query('cloudEditorSlots')
            .withIndex('by_token', (q) => q.eq('token', args.token))
            .unique();
        if (slot)
            await ctx.db.patch(slot._id, { sandboxId: args.sandboxId, expiresAt: args.expiresAt });
        await ctx.db.patch(state._id, {
            status: 'ready',
            appliedRevision: args.revision,
            sandboxId: args.sandboxId,
            previewUrl: args.previewUrl,
            previewToken: args.previewToken,
            previewGatewayVersion: 2,
            expiresAt: args.expiresAt,
            materializedPaths: args.paths,
            dependencyHash: args.dependencyHash,
            leaseToken: undefined,
            leaseUntil: undefined,
            error: undefined,
            ...(args.requestGeneration !== undefined &&
            state.previewStartRequest?.generation === args.requestGeneration
                ? { previewStartRequest: undefined }
                : {}),
        });
        await ctx.db.patch(branch._id, {
            sandboxId: args.sandboxId,
            runtimeMetadata: {
                cloud: {
                    provider: 'vercel_sandbox',
                    sourceVersion: 1,
                    sandboxId: args.sandboxId,
                    previewUrl: args.previewUrl,
                    port: 3000,
                },
            },
        });
        await ctx.db.patch(project._id, { sandboxId: args.sandboxId, sandboxUrl: args.previewUrl });
        const frames = await ctx.db
            .query('frames')
            .withIndex('by_branch', (q) => q.eq('branchId', args.branchId))
            .collect();
        for (const frame of frames) {
            let pathname = '/';
            try {
                pathname = new URL(frame.url).pathname;
            } catch {
                /* An unprovisioned frame has no URL. */
            }
            await ctx.db.patch(frame._id, { url: new URL(pathname, args.previewUrl).toString() });
        }
        if (state.revision > args.revision)
            await ctx.scheduler.runAfter(0, syncRef, {
                projectId: args.projectId,
                branchId: args.branchId,
            });
        return true;
    },
});

export const _runtimeFailed = internalMutation({
    args: {
        ...cloudScope,
        token: v.string(),
        message: v.string(),
        requestGeneration: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const state = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_branchId', (q) => q.eq('branchId', args.branchId))
            .unique();
        if (state?.projectId === args.projectId && state.leaseToken === args.token)
            await ctx.db.patch(state._id, {
                status: 'error',
                error: args.message.slice(0, 500),
                leaseUntil: undefined,
                leaseToken: undefined,
                ...(args.requestGeneration !== undefined &&
                state.previewStartRequest?.generation === args.requestGeneration
                    ? { previewStartRequest: undefined }
                    : {}),
            });
        return null;
    },
});

export const _asset = internalQuery({
    args: { ...cloudScope, path: v.string(), expectedHash: v.string() },
    handler: async (ctx, args) => {
        const { state } = await enrolled(ctx, args);
        // Imported media must use the authenticated, bounded import proxy.
        if (isImportedCloudProfile(state.profile)) return cloudError('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        const file = await ctx.db
            .query('cloudEditorFiles')
            .withIndex('by_branchId_path', (q) =>
                q.eq('branchId', args.branchId).eq('path', args.path),
            )
            .unique();
        if (!file?.storageId || file.projectId !== args.projectId || file.branchId !== args.branchId ||
            file.kind !== 'file' || file.hash !== args.expectedHash)
            return cloudError('CLOUD_CONFLICT');
        return { storageId: file.storageId, bytes: file.bytes, hash: file.hash };
    },
});

/** The initial dependency resolution becomes durable before its preview is adopted. */
export const _sealDependencies = internalMutation({
    args: {
        ...cloudScope,
        token: v.string(),
        revision: v.number(),
        text: v.string(),
        hash: v.string(),
    },
    handler: async (ctx, args) => {
        const state = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_branchId', (q) => q.eq('branchId', args.branchId))
            .unique();
        if (state?.profile === 'imported-next-v1') return cloudError('CLOUD_IMPORT_PINNED_FILE');
        if (
            !state ||
            state.projectId !== args.projectId ||
            !sourceProfileCapabilities(state.profile).preview ||
            state.leaseToken !== args.token ||
            (state.leaseUntil ?? 0) <= Date.now() ||
            state.revision !== args.revision
        )
            return cloudError('CLOUD_CONFLICT');
        if (
            state.previewStartRequest?.kind !== 'design' ||
            !(await authorizeCloudPreviewStart(
                ctx,
                args,
                state.previewStartRequest.generation,
                args.token,
            ))
        )
            return cloudError('CLOUD_PREVIEW_PREPARATION_REQUIRED');
        const prior = await ctx.db
            .query('cloudEditorFiles')
            .withIndex('by_branchId_path', (q) =>
                q.eq('branchId', args.branchId).eq('path', 'bun.lock'),
            )
            .unique();
        if (prior) return cloudError('CLOUD_CONFLICT');
        const bytes = new TextEncoder().encode(args.text).byteLength;
        if (
            !bytes ||
            bytes > MAX_CLOUD_TEXT_BYTES ||
            state.bytes + bytes > MAX_CLOUD_PROJECT_BYTES ||
            state.fileCount >= MAX_CLOUD_FILES
        )
            return cloudError('CLOUD_PROJECT_TOO_LARGE');
        await ctx.db.insert('cloudEditorFiles', {
            projectId: args.projectId,
            branchId: args.branchId,
            path: 'bun.lock',
            kind: 'file',
            text: args.text,
            bytes,
            hash: args.hash,
        });
        if (inlineSourceBytes(await filesFor(ctx, args.branchId)) > MAX_CLOUD_INLINE_BYTES)
            return cloudError('CLOUD_PROJECT_TOO_LARGE');
        const revision = state.revision + 1;
        await ctx.db.patch(state._id, {
            revision,
            bytes: state.bytes + bytes,
            fileCount: state.fileCount + 1,
            updatedAt: Date.now(),
        });
        return revision;
    },
});

/** Two runtime allocations at once across this isolated deployment, including uncertain starts. */
export const _reserveRuntime = internalMutation({
    args: { ...cloudScope, token: v.string(), requestGeneration: v.number() },
    handler: async (ctx, args) => {
        requireEnabled();
        const state = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_branchId', (q) => q.eq('branchId', args.branchId))
            .unique();
        if (
            !state ||
            state.projectId !== args.projectId ||
            !sourceProfileCapabilities(state.profile).preview ||
            state.leaseToken !== args.token ||
            (state.leaseUntil ?? 0) <= Date.now()
        )
            return false;
        await getPreparedImport(ctx, state);
        if (
            !state.previewStartRequest ||
            state.previewStartRequest.reservedToken !== undefined ||
            !(await authorizeCloudPreviewStart(ctx, args, args.requestGeneration, args.token))
        )
            return false;
        const starts = (state.runtimeStarts ?? []).filter((time) => time > Date.now() - 3_600_000);
        if (starts.length >= 4) return false;
        for (let slot = 1; slot <= 2; slot++) {
            const row = await ctx.db
                .query('cloudEditorSlots')
                .withIndex('by_slot', (q) => q.eq('slot', slot))
                .unique();
            if (row && row.expiresAt > Date.now()) continue;
            const value = {
                slot,
                projectId: args.projectId,
                branchId: args.branchId,
                token: args.token,
                expiresAt: Date.now() + 20 * 60_000,
            };
            if (row) await ctx.db.replace(row._id, value);
            else await ctx.db.insert('cloudEditorSlots', value);
            await ctx.db.patch(state._id, {
                runtimeStarts: [...starts, Date.now()],
                previewStartRequest: { ...state.previewStartRequest, reservedToken: args.token },
            });
            return true;
        }
        return false;
    },
});
export const _releaseRuntimeSlot = internalMutation({
    args: { token: v.optional(v.string()), sandboxId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const slots = await ctx.db.query('cloudEditorSlots').take(3);
        for (const row of slots)
            if (
                (args.token && row.token === args.token) ||
                (args.sandboxId && row.sandboxId === args.sandboxId)
            )
                await ctx.db.delete(row._id);
        return null;
    },
});

export const _created = internalQuery({
    args: { workspaceId: v.id('workspaces'), creationId: v.string() },
    handler: async (ctx, args) => {
        const { user } = await requireCap(ctx, 'workspace.view', { workspaceId: args.workspaceId });
        const state = await ctx.db
            .query('cloudEditorStates')
            .withIndex('by_createdByUserId_creationId', (q) =>
                q.eq('createdByUserId', user._id).eq('creationId', args.creationId),
            )
            .unique();
        if (!state) return null;
        if (state.workspaceId !== args.workspaceId) return cloudError('CLOUD_INVALID_OPERATION');
        await requireCap(ctx, 'project.view', { projectId: state.projectId });
        return { projectId: state.projectId, branchId: state.branchId };
    },
});

export const _collectReceipts = internalMutation({
    args: {},
    handler: async (ctx) => {
        const expired = await ctx.db
            .query('cloudEditorOperations')
            .withIndex('by_createdAt', (q) => q.lt('createdAt', Date.now() - 30 * 24 * 60 * 60_000))
            .take(100);
        for (const operation of expired) await ctx.db.delete(operation._id);
        if (expired.length === 100)
            await ctx.scheduler.runAfter(
                0,
                makeFunctionReference<'mutation', Record<string, never>, null>(
                    'cloudEditor:_collectReceipts',
                ),
                {},
            );
        return null;
    },
});
