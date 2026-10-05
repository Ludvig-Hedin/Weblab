import { describe, expect, it } from 'bun:test';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { create, remove, update } from '../cmsFields';
import { mergeFieldConfig } from './cmsFieldConfig';

const projectId = 'project' as Id<'projects'>;
const collectionId = 'collection' as Id<'cmsCollections'>;
const fieldId = 'field' as Id<'cmsFields'>;
type FieldRow = Pick<Doc<'cmsFields'>, 'type' | 'config' | 'required'>;

function fixture(field: FieldRow, values: unknown[] = [], external = false) {
    const rows = new Map<string, Record<string, unknown>>([
        ['user', { _id: 'user', clerkUserId: 'clerk', _creationTime: 1 }],
        ['workspace', { _id: 'workspace', createdByUserId: 'user' }],
        ['project', { _id: projectId, workspaceId: 'workspace', accessMode: 'restricted' }],
        ['collection', { _id: collectionId, projectId, sourceId: 'source' }],
        ['source', { _id: 'source', projectId, type: external ? 'rest' : 'weblab' }],
        ['target', { _id: 'target', projectId }],
        ['other', { _id: 'other', projectId: 'anotherProject' }],
        ['field', { _id: fieldId, collectionId, key: 'selection', name: 'Selection', order: 0, revision: 0, ...field }],
        ...values.map((value, index): [string, Record<string, unknown>] => [`item${index}`, { _id: `item${index}`, collectionId, values: { selection: value }, revision: 0 }]),
    ]);
    const writes: string[] = [];
    const db = {
        get: async (id: string) => rows.get(id) ?? null,
        normalizeId: (_table: string, id: string) => rows.has(id) ? id : null,
        patch: async (id: string, patch: Record<string, unknown>) => { writes.push(id); rows.set(id, { ...rows.get(id), ...patch }); },
        delete: async (id: string) => { writes.push(id); rows.delete(id); },
        insert: async (_table: string, value: Record<string, unknown>) => { writes.push('new'); rows.set('new', { _id: 'new', ...value }); return 'new'; },
        query: (table: string) => {
            const constraints: [string, unknown][] = [];
            const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
            const select = () => {
                if (table === 'users') return [rows.get('user')!];
                if (table === 'workspaceMembers') return [{ role: 'owner' }];
                if (table === 'projectMembers') return [{ role: 'manager' }];
                if (!['cmsFields', 'cmsItems'].includes(table)) return [];
                return [...rows.values()].filter((row) => (table === 'cmsFields' ? row._id === fieldId : typeof row._id === 'string' && row._id.startsWith('item')) && constraints.every(([key, value]) => row[key] === value));
            };
            const query = {
                withIndex: (_name: string, build: (queryIndex: typeof index) => unknown) => { build(index); return query; },
                collect: async () => select(), unique: async () => select()[0] ?? null,
                take: async (limit: number) => select().slice(0, limit),
            };
            return query;
        },
    };
    const ctx = { db, auth: { getUserIdentity: async () => ({ subject: 'clerk' }) } } as unknown as MutationCtx;
    return { ctx, rows, writes };
}
const updateField = (update as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; fieldId: Id<'cmsFields'>; expectedRevision: number; config?: unknown; required?: boolean }) => Promise<unknown> })._handler;
const removeField = (remove as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; fieldId: Id<'cmsFields'>; expectedRevision: number }) => Promise<unknown> })._handler;
const createField = (create as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; collectionId: Id<'cmsCollections'>; name: string; key: string; type: Doc<'cmsFields'>['type']; config?: unknown; required?: boolean }) => Promise<unknown> })._handler;

describe('CMS field configuration', () => {
    it('trims choices, drops blanks, preserves unrelated metadata and refuses duplicates', () => {
        expect(mergeFieldConfig('option', { provider: 'kept', options: ['before'] }, { options: [' One ', '', 'Two'] })).toEqual({ provider: 'kept', options: ['One', 'Two'], multiple: false });
        expect(() => mergeFieldConfig('option', {}, { options: [' One ', 'One'] })).toThrow();
        expect(() => mergeFieldConfig('reference', {}, { multiple: 'yes', collectionId: 'target' })).toThrow();
    });
    it('refuses removing an option still used by saved content', async () => {
        const { ctx, rows, writes } = fixture({ type: 'option', required: false, config: { options: ['One', 'Two'] } }, ['Two']);
        await expect(updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { options: ['One'] } })).rejects.toThrow('unknown option');
        expect(rows.get('field')?.config).toEqual({ options: ['One', 'Two'] });
        expect(writes).toEqual([]);
    });
    it('refuses shrinking multiple values instead of truncating them', async () => {
        const { ctx, writes } = fixture({ type: 'option', required: false, config: { options: ['One', 'Two'], multiple: true } }, [['One', 'Two']]);
        await expect(updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { multiple: false } })).rejects.toThrow('one selection');
        expect(writes).toEqual([]);
    });
    it('accepts compatible settings and invalidates open item revisions', async () => {
        const { ctx, rows } = fixture({ type: 'option', required: false, config: { provider: 'kept', options: ['One'] } }, ['One']);
        await updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { options: ['One', 'Two'] } });
        expect(rows.get('field')?.config).toEqual({ provider: 'kept', options: ['One', 'Two'], multiple: false });
        expect(rows.get('item0')?.revision).toBe(1);
        expect(rows.get('item0')?.values).toEqual({ selection: 'One' });
    });
    it('refuses link format or required settings that existing values cannot satisfy', async () => {
        const plain = fixture({ type: 'text', required: false, config: {} }, ['Plain text']);
        await expect(updateField(plain.ctx, { projectId, fieldId, expectedRevision: 0, config: { format: 'url' } })).rejects.toThrow('HTTP or HTTPS');
        expect(plain.writes).toEqual([]);
        const empty = fixture({ type: 'text', required: false, config: {} }, [null]);
        await expect(updateField(empty.ctx, { projectId, fieldId, expectedRevision: 0, required: true })).rejects.toThrow('required');
        expect(empty.writes).toEqual([]);
    });
    it('requires same-project reference targets on create and update', async () => {
        const { ctx, writes } = fixture({ type: 'reference', required: false, config: { collectionId: 'target' } });
        await expect(updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { collectionId: 'other' } })).rejects.toThrow('belong to this project');
        await expect(createField(ctx, { projectId, collectionId, name: 'Related', key: 'related', type: 'reference', config: { collectionId: 'other' } })).rejects.toThrow('belong to this project');
        expect(writes).toEqual([]);
    });
    it('refuses switching reference target when stored references use the old collection', async () => {
        const { ctx, rows, writes } = fixture({ type: 'reference', required: false, config: { collectionId: 'target' } }, ['related']);
        rows.set('related', { _id: 'related', collectionId: 'target' });
        rows.set('newTarget', { _id: 'newTarget', projectId });
        await expect(updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { collectionId: 'newTarget' } })).rejects.toThrow('Existing references');
        expect(writes).toEqual([]);
    });
    it('refuses new required fields and oversized validation without changing content', async () => {
        const { ctx, writes } = fixture({ type: 'text', required: false, config: {} }, ['Existing']);
        await expect(createField(ctx, { projectId, collectionId, name: 'Required', key: 'newRequired', type: 'text', required: true })).rejects.toThrow('required');
        expect(writes).toEqual([]);
        const oversized = fixture({ type: 'text', required: false, config: {} }, Array.from({ length: 501 }, () => 'Existing'));
        await expect(updateField(oversized.ctx, { projectId, fieldId, expectedRevision: 0, config: { format: 'text' } })).rejects.toThrow('up to 500 saved items');
        expect(oversized.writes).toEqual([]);
    });
    it('refuses stale field saves and deletion while retaining the winning settings', async () => {
        const { ctx, rows, writes } = fixture({ type: 'text', required: false, config: {} });
        await updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { format: 'url' } });
        await expect(updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { format: 'text' } })).rejects.toThrow('CONFLICT:');
        await expect(removeField(ctx, { projectId, fieldId, expectedRevision: 0 })).rejects.toThrow('CONFLICT:');
        expect(rows.get('field')?.config).toEqual({ format: 'url' });
        expect(rows.get('field')?.revision).toBe(1);
        expect(writes).toEqual(['field']);
    });
    it('refuses external field mutations', async () => {
        const { ctx, writes } = fixture({ type: 'text', required: false, config: {} }, [], true);
        await expect(updateField(ctx, { projectId, fieldId, expectedRevision: 0, config: { format: 'url' } })).rejects.toThrow('READ_ONLY:');
        expect(writes).toEqual([]);
    });
});
