import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { entry, upsertCanvasView } from './cloudEditorEntry';

const projectId = 'projects:one' as Id<'projects'>;
const branchId = 'branches:one' as Id<'branches'>;
const actorId = 'users:client' as Id<'users'>;
const canvasId = 'canvases:one' as Id<'canvases'>;
const oldIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
beforeEach(() => {
    process.env.CLERK_JWT_ISSUER_DOMAIN = 'https://clerk.example.test';
});
afterEach(() => {
    if (oldIssuer === undefined) delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    else process.env.CLERK_JWT_ISSUER_DOMAIN = oldIssuer;
});
type Row = Record<string, unknown> & { _id: string; _creationTime: number };

// Database/auth IO only. The actual explicit admission helper and handlers run.
// No generic user gate mock and no Convex transaction/validator emulation.
function fixture() {
    const rows = new Map<string, Row>(),
        reads: string[] = [],
        writes: string[] = [];
    let subject: string | null = 'client',
        sequence = 0;
    const put = (id: string, values: Record<string, unknown>) =>
        rows.set(id, { _id: id, _creationTime: 1, ...values });
    put(actorId, { clerkUserId: 'client', email: 'client@example.com', displayName: 'Client' });
    put('workspaces:one', { createdByUserId: 'users:owner' });
    put(projectId, {
        workspaceId: 'workspaces:one',
        accessMode: 'restricted',
        name: 'Client site',
    });
    put(branchId, {
        projectId,
        name: 'Main',
        isDefault: true,
        runtimeType: 'cloud',
        runtimeMetadata: { cloud: { sourceVersion: 1 } },
    });
    put('cloudEditorStates:one', {
        projectId,
        branchId,
        workspaceId: 'workspaces:one',
        version: 1,
        createdByUserId: 'users:owner',
    });
    put('projectMembers:client', { projectId, userId: actorId, role: 'viewer' });
    put('cloudEditorGrants:client', { projectId, userId: actorId, role: 'content', publish: true });
    put(canvasId, { projectId });
    put('frames:visible', {
        canvasId,
        branchId,
        url: 'https://preview.example.com',
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
    });
    put('userCanvases:other', { userId: 'users:other', canvasId, scale: 9, x: 9, y: 9 });
    const ctx = {
        auth: {
            getUserIdentity: async () =>
                subject
                    ? {
                          subject,
                          email: 'client@example.com',
                          issuer: 'https://clerk.example.test',
                          tokenIdentifier: `https://clerk.example.test|${subject}`,
                      }
                    : null,
        },
        db: {
            get: async (id: string) => {
                reads.push(`get:${id}`);
                return structuredClone(rows.get(id) ?? null);
            },
            insert: async (table: string, values: Record<string, unknown>) => {
                const id = `${table}:new${++sequence}`;
                put(id, values);
                writes.push(`insert:${table}`);
                return id;
            },
            patch: async (id: string, values: Record<string, unknown>) => {
                Object.assign(rows.get(id)!, values);
                writes.push(`patch:${id}`);
            },
            query: (table: string) => {
                reads.push(`query:${table}`);
                if (table === 'conversations' || table === 'projectCreateRequests')
                    throw new Error('Forbidden unrelated read');
                const constraints: Array<[string, unknown]> = [];
                const index = {
                    eq: (key: string, value: unknown) => {
                        constraints.push([key, value]);
                        return index;
                    },
                };
                const matches = () =>
                    [...rows.values()].filter(
                        (row) =>
                            row._id.startsWith(`${table}:`) &&
                            constraints.every(([key, value]) => row[key] === value),
                    );
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => {
                        build(index);
                        return query;
                    },
                    collect: async () => structuredClone(matches()),
                    take: async (count: number) => structuredClone(matches().slice(0, count)),
                    first: async () => structuredClone(matches()[0] ?? null),
                    unique: async () => {
                        const values = matches();
                        if (values.length > 1) throw new Error('Nonunique');
                        return structuredClone(values[0] ?? null);
                    },
                };
                return query;
            },
        },
    } as unknown as MutationCtx;
    return {
        ctx,
        rows,
        put,
        reads,
        writes,
        signIn: (value: string | null) => {
            subject = value;
        },
    };
}

const view = { projectId, branchId, actorId, canvasId, scale: 0.5, x: -42, y: 64 };

describe('explicit existing-account cloud editor entry', () => {
    it('returns the canonical own user and compatible bootstrap without unrelated subscriptions', async () => {
        const f = fixture();
        const result = await entry._handler(f.ctx, { projectId });
        expect(result?.user).toMatchObject({
            _id: actorId,
            clerkUserId: 'client',
            email: 'client@example.com',
        });
        expect(result?.bootstrap.project._id).toBe(projectId);
        expect(result?.bootstrap.branches.map((branch) => branch._id)).toEqual([branchId]);
        expect(result?.bootstrap.canvas?.userCanvas).toBeNull();
        expect(result?.bootstrap.conversations).toEqual([]);
        expect(result?.bootstrap.creationRequest).toBeNull();
        expect(result?.capabilities).toEqual(['project.view']);
        expect(f.reads).not.toContain('query:conversations');
        expect(f.reads).not.toContain('query:projectCreateRequests');
        expect(f.writes).toEqual([]);
    });

    for (const convexAllows of [true, false]) {
        it(`requires the explicit project rows independently when Convex global admission is ${convexAllows ? 'open but Next blocks' : 'blocked but Next admits'}`, async () => {
            const prior = process.env.WEBLAB_SIGN_IN_ALLOWLIST;
            try {
                // Local main lacks the remote generic gate. This sets both
                // production dispositions without depending on that local omission;
                // the entry handler must never consult a global admission gate.
                process.env.WEBLAB_SIGN_IN_ALLOWLIST = convexAllows ? '' : 'owner@example.com';
                const f = fixture();
                expect((await entry._handler(f.ctx, { projectId }))?.user._id).toBe(actorId);
                f.rows.delete('cloudEditorGrants:client');
                expect(await entry._handler(f.ctx, { projectId })).toBeNull();
                await expect(upsertCanvasView._handler(f.ctx, view)).rejects.toThrow('FORBIDDEN');
            } finally {
                if (prior === undefined) delete process.env.WEBLAB_SIGN_IN_ALLOWLIST;
                else process.env.WEBLAB_SIGN_IN_ALLOWLIST = prior;
            }
        });
    }

    it('filters both frame projections by admitted branch and exact project canvas', async () => {
        const f = fixture();
        f.put('branches:two', {
            projectId,
            name: 'Second',
            runtimeType: 'cloud',
            runtimeMetadata: { cloud: { sourceVersion: 1 } },
        });
        f.put('cloudEditorStates:two', {
            projectId,
            branchId: 'branches:two',
            workspaceId: 'workspaces:one',
            version: 1,
        });
        f.put('branches:legacy', {
            projectId,
            name: 'Legacy',
            runtimeType: 'cloud',
            runtimeMetadata: {},
        });
        f.put('cloudEditorStates:legacy', {
            projectId,
            branchId: 'branches:legacy',
            workspaceId: 'workspaces:one',
            version: 1,
        });
        f.put('branches:unenrolled', {
            projectId,
            name: 'Unenrolled',
            runtimeType: 'cloud',
            runtimeMetadata: { cloud: { sourceVersion: 1 } },
        });
        f.put('branches:invalid', {
            projectId,
            name: 'Invalid',
            runtimeType: 'cloud',
            runtimeMetadata: { cloud: { sourceVersion: 1 } },
        });
        f.put('cloudEditorStates:invalid', {
            projectId,
            branchId: 'branches:invalid',
            workspaceId: 'workspaces:other',
            version: 1,
        });
        for (const id of ['two', 'legacy', 'unenrolled', 'invalid', 'foreign']) {
            f.put(`frames:${id}`, {
                canvasId,
                branchId: `branches:${id}`,
                url: `https://${id}.example.com`,
            });
        }
        f.put('frames:unbound', { canvasId, url: 'https://unbound.example.com' });
        f.put('frames:wrong-canvas', {
            canvasId: 'canvases:other',
            branchId,
            url: 'https://other.example.com',
        });
        const result = (await entry._handler(f.ctx, { projectId }))!;
        expect(result.bootstrap.branches.map((branch) => branch._id)).toEqual([
            branchId,
            'branches:two',
        ]);
        expect(
            result.bootstrap.branches.map((branch) => branch.frames.map((frame) => frame._id)),
        ).toEqual([['frames:visible'], ['frames:two']]);
        expect(result.bootstrap.canvas?.frames.map((frame) => frame._id)).toEqual([
            'frames:visible',
            'frames:two',
        ]);
    });

    for (const removed of [
        'users:client',
        'projectMembers:client',
        'cloudEditorGrants:client',
        'cloudEditorStates:one',
        branchId,
    ]) {
        it(`returns no scoped entry after ${removed} is removed`, async () => {
            const f = fixture();
            expect(await entry._handler(f.ctx, { projectId })).not.toBeNull();
            f.rows.delete(removed);
            expect(await entry._handler(f.ctx, { projectId })).toBeNull();
            expect(f.writes).toEqual([]);
        });
    }

    it('does not infer entry from enrollment creator or workspace ownership', async () => {
        const f = fixture();
        f.rows.delete('projectMembers:client');
        f.rows.delete('cloudEditorGrants:client');
        f.rows.get('cloudEditorStates:one')!.createdByUserId = actorId;
        f.rows.get('workspaces:one')!.createdByUserId = actorId;
        f.put('workspaceMembers:client', {
            workspaceId: 'workspaces:one',
            userId: actorId,
            role: 'owner',
        });
        expect(await entry._handler(f.ctx, { projectId })).toBeNull();
    });

    it('returns no entry for another project or signed-out caller and does not suppress data failures', async () => {
        const f = fixture();
        expect(
            await entry._handler(f.ctx, { projectId: 'projects:other' as Id<'projects'> }),
        ).toBeNull();
        f.signIn(null);
        expect(await entry._handler(f.ctx, { projectId })).toBeNull();
        f.signIn('client');
        f.put('projectMembers:duplicate', { projectId, userId: actorId, role: 'viewer' });
        await expect(entry._handler(f.ctx, { projectId })).rejects.toThrow('Nonunique');
    });

    it('does not silently truncate a project that exceeds the bounded branch inventory', async () => {
        const f = fixture();
        for (let i = 0; i < 100; i++)
            f.put(`branches:extra${i}`, { projectId, runtimeMetadata: {} });
        await expect(entry._handler(f.ctx, { projectId })).rejects.toThrow('CLOUD_ENTRY_LIMIT');
    });
});

describe('scoped personal canvas pan and zoom', () => {
    it('writes only the current actor view and preserves omitted toggles', async () => {
        const f = fixture();
        const before = structuredClone(f.rows.get('userCanvases:other'));
        const created = await upsertCanvasView._handler(f.ctx, {
            ...view,
            showRulers: true,
            showLayoutGuides: false,
        });
        expect(created).toMatchObject({
            userId: actorId,
            canvasId,
            scale: 0.5,
            x: -42,
            y: 64,
            showRulers: true,
            showLayoutGuides: false,
        });
        const updated = await upsertCanvasView._handler(f.ctx, { ...view, x: 99 });
        expect(updated).toMatchObject({
            _id: created._id,
            x: 99,
            showRulers: true,
            showLayoutGuides: false,
        });
        expect(f.rows.get('userCanvases:other')).toEqual(before);
        expect(f.writes).toEqual(['insert:userCanvases', `patch:${created._id}`]);
        expect(
            (await entry._handler(f.ctx, { projectId }))?.bootstrap.canvas?.userCanvas?._id,
        ).toBe(created._id);
    });

    it('rejects another actor, project canvas or enrollment before writing', async () => {
        const f = fixture();
        await expect(
            upsertCanvasView._handler(f.ctx, { ...view, actorId: 'users:other' as Id<'users'> }),
        ).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        f.put('canvases:other', { projectId: 'projects:other' });
        await expect(
            upsertCanvasView._handler(f.ctx, {
                ...view,
                canvasId: 'canvases:other' as Id<'canvases'>,
            }),
        ).rejects.toThrow('FORBIDDEN');
        f.rows.delete('cloudEditorStates:one');
        await expect(upsertCanvasView._handler(f.ctx, view)).rejects.toThrow('FORBIDDEN');
        expect(f.writes).toEqual([]);
    });

    it('rejects invalid numeric coordinates and nonpositive zoom', async () => {
        const f = fixture();
        for (const change of [
            { scale: 0 },
            { scale: -1 },
            { scale: Infinity },
            { x: NaN },
            { y: Infinity },
        ]) {
            await expect(upsertCanvasView._handler(f.ctx, { ...view, ...change })).rejects.toThrow(
                'CLOUD_INVALID_CANVAS_VIEW',
            );
        }
        expect(f.writes).toEqual([]);
    });
});
