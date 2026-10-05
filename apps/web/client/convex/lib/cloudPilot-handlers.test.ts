import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { PilotContent, PilotSnapshot, PilotWorkspace } from './cloudPilot';
import { create, get, save, workspace } from '../cloudPilot';
import { CLOUD_PILOT_COLLECTION, CLOUD_PILOT_TEMPLATE, initialPilotContent } from './cloudPilot';

// Real registered handlers and authorization, with only the database/auth boundary replaced.
// This does not simulate Convex validation, transactions, rollback, or concurrent retries.
type Handler<Context, Args, Result> = {
    _handler: (ctx: Context, args: Args) => Promise<Result>;
};
const createPilot = (
    create as unknown as Handler<
        MutationCtx,
        { workspaceId: Id<'workspaces'>; name: string },
        Id<'projects'>
    >
)._handler;
const getPilot = (get as unknown as Handler<QueryCtx, { projectId: Id<'projects'> }, PilotSnapshot>)
    ._handler;
const savePilot = (
    save as unknown as Handler<
        MutationCtx,
        {
            projectId: Id<'projects'>;
            expectedRevision: number;
            content: PilotContent;
        },
        PilotSnapshot
    >
)._handler;
const getWorkspace = (
    workspace as unknown as Handler<QueryCtx, { workspaceId: Id<'workspaces'> }, PilotWorkspace>
)._handler;

type Row = Record<string, unknown> & { _id: string };
const workspaceId = 'workspaces:main' as Id<'workspaces'>;

function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    let sequence = 0;
    let subject: string | null = 'builder';
    const writes: string[] = [];
    const table = (name: string) => {
        let rows = tables.get(name);
        if (!rows) {
            rows = new Map();
            tables.set(name, rows);
        }
        return rows;
    };
    const put = (name: string, id: string, value: Record<string, unknown>) => {
        table(name).set(id, { _id: id, _creationTime: 1, ...value });
    };
    const row = (id: string): Row => {
        const found = table(id.split(':')[0]!).get(id);
        if (!found) throw new Error(`Fixture row missing: ${id}`);
        return found;
    };
    for (const user of ['builder', 'reader', 'outsider']) {
        put('users', `users:${user}`, { clerkUserId: user });
    }
    put('workspaces', workspaceId, { createdByUserId: 'users:outsider' });
    put('workspaceMembers', 'workspaceMembers:builder', {
        workspaceId,
        userId: 'users:builder',
        role: 'member',
    });
    put('workspaceMembers', 'workspaceMembers:reader', {
        workspaceId,
        userId: 'users:reader',
        role: 'viewer',
    });
    const db = {
        get: async (id: string) => structuredClone(table(id.split(':')[0]!).get(id) ?? null),
        normalizeId: (name: string, id: string) => (id.startsWith(`${name}:`) ? id : null),
        insert: async (name: string, value: Record<string, unknown>) => {
            const id = `${name}:${++sequence}`;
            writes.push(`insert:${name}`);
            put(name, id, value);
            return id;
        },
        patch: async (id: string, patch: Record<string, unknown>) => {
            writes.push(`patch:${id}`);
            table(id.split(':')[0]!).set(id, {
                ...row(id),
                ...structuredClone(patch),
            });
        },
        query: (name: string) => {
            const constraints: Array<[string, unknown]> = [];
            const index = {
                eq: (key: string, value: unknown) => {
                    constraints.push([key, value]);
                    return index;
                },
            };
            const filter = {
                field: (key: string) => key,
                eq: (key: string, value: unknown) => {
                    constraints.push([key, value]);
                },
            };
            const select = () =>
                [...table(name).values()]
                    .filter((value) =>
                        constraints.every(([key, expected]) => value[key] === expected),
                    )
                    .map((value) => structuredClone(value));
            const query = {
                withIndex: (_name: string, build: (value: typeof index) => unknown) => {
                    build(index);
                    return query;
                },
                filter: (build: (value: typeof filter) => unknown) => {
                    build(filter);
                    return query;
                },
                collect: async () => select(),
                take: async (limit: number) => select().slice(0, limit),
                first: async () => select()[0] ?? null,
                unique: async () => {
                    const result = select();
                    if (result.length > 1) throw new Error('Non-unique fixture query');
                    return result[0] ?? null;
                },
            };
            return query;
        },
    };
    const ctx = {
        db,
        auth: {
            getUserIdentity: async () =>
                subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null,
        },
    } as unknown as MutationCtx;
    return {
        ctx,
        table,
        put,
        row,
        writes,
        signIn: (user: string | null) => {
            subject = user;
        },
    };
}

async function seeded() {
    const f = fixture();
    const projectId = await createPilot(f.ctx, {
        workspaceId,
        name: '  Studio  ',
    });
    const item = [...f.table('cmsItems').values()][0]!;
    const collection = [...f.table('cmsCollections').values()][0]!;
    const source = [...f.table('cmsSources').values()][0]!;
    f.writes.length = 0;
    return { ...f, projectId, item, collection, source };
}

let originalGate: string | undefined;
beforeEach(() => {
    originalGate = process.env.WEBLAB_CLOUD_PILOT_ENABLED;
    process.env.WEBLAB_CLOUD_PILOT_ENABLED = 'true';
});
afterEach(() => {
    if (originalGate === undefined) delete process.env.WEBLAB_CLOUD_PILOT_ENABLED;
    else process.env.WEBLAB_CLOUD_PILOT_ENABLED = originalGate;
});

describe('cloud pilot handlers', () => {
    it('creates one restricted native CMS pilot and reopens it on a repeated create', async () => {
        const f = await seeded();
        const repeated = await createPilot(f.ctx, {
            workspaceId,
            name: 'Another name',
        });
        expect(repeated).toBe(f.projectId);
        expect(f.writes).toEqual([]);
        expect(f.table('projects').size).toBe(1);
        expect(f.row(f.projectId)).toMatchObject({
            name: 'Studio',
            accessMode: 'restricted',
            storageMode: 'cloud',
        });
        expect([...f.table('projectMembers').values()]).toHaveLength(1);
        expect([...f.table('projectMembers').values()][0]).toMatchObject({
            userId: 'users:builder',
            role: 'manager',
        });
        expect(f.table('cmsSources').size).toBe(1);
        expect(f.source).toMatchObject({ projectId: f.projectId, type: 'weblab' });
        expect(f.collection).toMatchObject({
            projectId: f.projectId,
            slug: CLOUD_PILOT_COLLECTION,
        });
        expect(f.table('cmsFields').size).toBe(7);
        expect(f.table('cmsItems').size).toBe(1);
        expect(f.item).toMatchObject({
            status: 'draft',
            revision: 1,
            values: initialPilotContent('Studio'),
        });
        expect(f.table('branches').size).toBe(0);
        expect(f.table('deployments').size).toBe(0);
    });

    it('defaults writes to disabled while authorized saved drafts remain readable', async () => {
        const f = await seeded();
        for (const gate of [undefined, 'false', 'TRUE']) {
            if (gate === undefined) delete process.env.WEBLAB_CLOUD_PILOT_ENABLED;
            else process.env.WEBLAB_CLOUD_PILOT_ENABLED = gate;
            expect(await getWorkspace(f.ctx, { workspaceId })).toEqual({
                enabled: false,
                canCreate: true,
                existingProject: { id: f.projectId, name: 'Studio' },
            });
            await expect(createPilot(f.ctx, { workspaceId, name: 'Other' })).rejects.toThrow(
                'PILOT_DISABLED',
            );
            await expect(
                savePilot(f.ctx, {
                    projectId: f.projectId,
                    expectedRevision: 1,
                    content: initialPilotContent('Other'),
                }),
            ).rejects.toThrow('PILOT_DISABLED');
            expect(await getPilot(f.ctx, { projectId: f.projectId })).toMatchObject({
                enabled: false,
                revision: 1,
                content: initialPilotContent('Studio'),
            });
        }
        expect(f.writes).toEqual([]);
    });

    it('distinguishes a new pilot from an existing one without leaking revoked access', async () => {
        const empty = fixture();
        expect(await getWorkspace(empty.ctx, { workspaceId })).toEqual({
            enabled: true,
            canCreate: true,
            existingProject: null,
        });
        const f = await seeded();
        expect((await getWorkspace(f.ctx, { workspaceId })).existingProject).toEqual({
            id: f.projectId,
            name: 'Studio',
        });
        f.table('projectMembers').clear();
        expect((await getWorkspace(f.ctx, { workspaceId })).existingProject).toBeNull();
    });

    it('requires authentication for reads, creation and saves', async () => {
        const f = await seeded();
        f.signIn(null);
        await expect(getWorkspace(f.ctx, { workspaceId })).rejects.toThrow('UNAUTHORIZED');
        await expect(getPilot(f.ctx, { projectId: f.projectId })).rejects.toThrow('UNAUTHORIZED');
        await expect(createPilot(f.ctx, { workspaceId, name: 'Other' })).rejects.toThrow(
            'UNAUTHORIZED',
        );
        await expect(
            savePilot(f.ctx, {
                projectId: f.projectId,
                expectedRevision: 1,
                content: initialPilotContent('Other'),
            }),
        ).rejects.toThrow('UNAUTHORIZED');
        expect(f.writes).toEqual([]);
    });

    it('lets an explicit project viewer read but not create or save', async () => {
        const f = await seeded();
        f.put('projectMembers', 'projectMembers:reader', {
            projectId: f.projectId,
            userId: 'users:reader',
            role: 'viewer',
        });
        f.signIn('reader');
        expect(await getWorkspace(f.ctx, { workspaceId })).toEqual({
            enabled: true,
            canCreate: false,
            existingProject: null,
        });
        expect(await getPilot(f.ctx, { projectId: f.projectId })).toMatchObject({
            canEdit: false,
        });
        await expect(createPilot(f.ctx, { workspaceId, name: 'Other' })).rejects.toThrow(
            'FORBIDDEN',
        );
        await expect(
            savePilot(f.ctx, {
                projectId: f.projectId,
                expectedRevision: 1,
                content: initialPilotContent('Other'),
            }),
        ).rejects.toThrow('FORBIDDEN');
        expect(f.writes).toEqual([]);
    });

    it('does not grant restricted-project access through another project or workspace viewing', async () => {
        const f = await seeded();
        f.put('projectMembers', 'projectMembers:other', {
            projectId: 'projects:other',
            userId: 'users:reader',
            role: 'manager',
        });
        f.signIn('reader');
        await expect(getPilot(f.ctx, { projectId: f.projectId })).rejects.toThrow('FORBIDDEN');
        await expect(
            savePilot(f.ctx, {
                projectId: f.projectId,
                expectedRevision: 1,
                content: initialPilotContent('Other'),
            }),
        ).rejects.toThrow('FORBIDDEN');
        f.signIn('outsider');
        await expect(getWorkspace(f.ctx, { workspaceId })).rejects.toThrow('FORBIDDEN');
        await expect(createPilot(f.ctx, { workspaceId, name: 'Other' })).rejects.toThrow(
            'FORBIDDEN',
        );
        expect(f.writes).toEqual([]);
    });

    it('reopens a saved revision and refuses a competing stale save without losing it', async () => {
        const f = await seeded();
        const original = await getPilot(f.ctx, { projectId: f.projectId });
        const content = {
            ...original.content,
            title: 'Saved title',
            alignment: 'center' as const,
        };
        expect(
            await savePilot(f.ctx, {
                projectId: f.projectId,
                expectedRevision: original.revision,
                content,
            }),
        ).toMatchObject({ content, revision: 2, canEdit: true });
        const writes = [...f.writes];
        await expect(
            savePilot(f.ctx, {
                projectId: f.projectId,
                expectedRevision: original.revision,
                content: initialPilotContent('Stale'),
            }),
        ).rejects.toThrow('PILOT_CONFLICT');
        expect(f.writes).toEqual(writes);
        expect(await getPilot(f.ctx, { projectId: f.projectId })).toMatchObject({
            content,
            revision: 2,
        });
        expect(f.row(f.item._id).status).toBe('draft');
    });

    it('rejects invalid content and names before writes', async () => {
        const f = await seeded();
        for (const name of ['', '  ', 'x'.repeat(81)]) {
            await expect(createPilot(f.ctx, { workspaceId, name })).rejects.toThrow(
                'PILOT_INVALID_NAME',
            );
        }
        await expect(
            savePilot(f.ctx, {
                projectId: f.projectId,
                expectedRevision: 1,
                content: {
                    ...initialPilotContent('Other'),
                    ctaLabel: 'Go',
                    ctaHref: 'javascript:alert(1)',
                },
            }),
        ).rejects.toThrow('PILOT_INVALID_LINK');
        expect(f.writes).toEqual([]);
        expect((await getPilot(f.ctx, { projectId: f.projectId })).content.title).toBe('Studio');
    });

    it('refuses unsupported metadata rather than opening or replacing a damaged pilot', async () => {
        for (const metadata of [
            {},
            { cloudPilot: { template: 'future-template', itemId: 'cmsItems:1' } },
        ]) {
            const f = await seeded();
            f.row(f.projectId).runtimeMetadata = metadata;
            await expect(getPilot(f.ctx, { projectId: f.projectId })).rejects.toThrow(
                'PILOT_UNSUPPORTED',
            );
            await expect(createPilot(f.ctx, { workspaceId, name: 'Retry' })).rejects.toThrow(
                'PILOT_UNSUPPORTED',
            );
            await expect(
                savePilot(f.ctx, {
                    projectId: f.projectId,
                    expectedRevision: 1,
                    content: initialPilotContent('Other'),
                }),
            ).rejects.toThrow('PILOT_UNSUPPORTED');
            expect(f.writes).toEqual([]);
        }
    });

    it('refuses missing, archived, external and cross-project content before reads or writes', async () => {
        const corruptions: Array<(f: Awaited<ReturnType<typeof seeded>>) => void> = [
            (f) => {
                f.row(f.projectId).runtimeMetadata = {
                    cloudPilot: {
                        template: CLOUD_PILOT_TEMPLATE,
                        itemId: 'projects:foreign',
                    },
                };
            },
            (f) => {
                f.table('cmsItems').delete(f.item._id);
            },
            (f) => {
                f.row(f.item._id).remoteId = 'external';
            },
            (f) => {
                f.row(f.item._id).archivedAt = 0;
            },
            (f) => {
                f.row(f.item._id).archivedAt = Date.now();
            },
            (f) => {
                f.table('cmsCollections').delete(f.collection._id);
            },
            (f) => {
                f.row(f.collection._id).projectId = 'projects:foreign';
            },
            (f) => {
                f.row(f.collection._id).slug = 'not-pilot';
            },
            (f) => {
                f.table('cmsSources').delete(f.source._id);
            },
            (f) => {
                f.row(f.source._id).projectId = 'projects:foreign';
            },
            (f) => {
                f.row(f.source._id).type = 'rest';
            },
        ];
        for (const corrupt of corruptions) {
            const f = await seeded();
            corrupt(f);
            await expect(getPilot(f.ctx, { projectId: f.projectId })).rejects.toThrow(
                'PILOT_DAMAGED',
            );
            await expect(
                savePilot(f.ctx, {
                    projectId: f.projectId,
                    expectedRevision: 1,
                    content: initialPilotContent('Other'),
                }),
            ).rejects.toThrow('PILOT_DAMAGED');
            expect(f.writes).toEqual([]);
        }
    });
});
