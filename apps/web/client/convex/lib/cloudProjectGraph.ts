import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { CLOUD_EDITOR_TAG, cloudError, cloudPath } from './cloudEditor';
import { importSourcePath } from './cloudImportManifest';

export type CloudProjectFile = { path: string; kind: 'file' | 'directory'; text?: string; storageId?: Id<'_storage'>; hash: string; bytes: number };

/** Called only inside an authorized, quota-checked creation transaction. */
type ProjectGraphArgs = {
    workspaceId: Id<'workspaces'>; userId: Id<'users'>; name: string; creationId: string;
    files: CloudProjectFile[]; profile?: 'imported-source-v1'; sourcePilotId?: Id<'projects'>;
};
type ProjectGraph = { projectId: Id<'projects'>; branchId: Id<'branches'> };
export function insertCloudProjectGraph(ctx: MutationCtx, args: ProjectGraphArgs & { includeStateId: true }): Promise<ProjectGraph & { stateId: Id<'cloudEditorStates'> }>;
export function insertCloudProjectGraph(ctx: MutationCtx, args: ProjectGraphArgs): Promise<ProjectGraph>;
export async function insertCloudProjectGraph(ctx: MutationCtx, args: ProjectGraphArgs & { includeStateId?: true }): Promise<ProjectGraph & { stateId?: Id<'cloudEditorStates'> }> {
    const now = Date.now();
    const projectId = await ctx.db.insert('projects', {
        name: args.name,
        tags: [CLOUD_EDITOR_TAG],
        storageMode: 'cloud',
        runtimeMetadata: { framework: 'nextjs', cloudEditor: { version: 1 } },
        workspaceId: args.workspaceId,
        createdByUserId: args.userId,
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
        userId: args.userId,
        role: 'manager',
        updatedAt: now,
    });
    const canvasId = await ctx.db.insert('canvases', { projectId });
    await ctx.db.insert('userCanvases', {
        userId: args.userId,
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
        if (args.profile === 'imported-source-v1') importSourcePath(file.path); else cloudPath(file.path);
        if (paths.has(file.path))
            return cloudError('CLOUD_INVALID_CHANGES');
        paths.add(file.path);
        await ctx.db.insert('cloudEditorFiles', {
            ...file,
            kind: file.kind,
            projectId,
            branchId,
        });
    }
    const stateId = await ctx.db.insert('cloudEditorStates', {
        projectId,
        branchId,
        workspaceId: args.workspaceId,
        createdByUserId: args.userId,
        creationId: args.creationId,
        sourcePilotId: args.sourcePilotId,
        version: 1,
        profile: args.profile,
        revision: 1,
        bytes: args.files.reduce((sum, file) => sum + file.bytes, 0),
        fileCount: args.files.length,
        generation: 0,
        status: 'stopped',
        updatedAt: now,
    });
    return { projectId, branchId, ...(args.includeStateId ? { stateId } : {}) };
}
