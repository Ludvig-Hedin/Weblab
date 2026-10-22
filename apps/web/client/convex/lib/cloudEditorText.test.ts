import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { hashPreparationPolicy } from './cloudImportedState';
import { access } from '../cloudEditorAccess';
import { _commit as designerCommit } from '../cloudEditor';
import { _input as legacyInput, contracts as legacyContracts, revoke as legacyRevoke, _approvalInput as legacyApprovalInput } from '../cloudEditorContent';
import { studioAdmission } from '../cloudEditorStudio';
import { reserve as reserveImage } from '../cloudEditorContentImages';
import { getFunctionName } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { _approvalInput, _selectionInput, _approve, _commit, _input, contracts, revoke } from '../cloudEditorText';
import { approve, commit, resolveSelection } from '../cloudEditorTextActions';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
const page = (id: string) => `export function Hero() { return <main data-oid="root-${id}"><h1 data-oid="title-${id}">Hello</h1></main>; }`;
type Row = Record<string, unknown> & { _id: string };

// Uses real registered Node actions, handlers and permission checks. The fixture
// emulates only auth/database IO; it does not simulate Convex transaction rollback
// or argument validators. Assertions on rejected batches require zero writes.
async function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => {
        let result = tables.get(name);
        if (!result) { result = new Map(); tables.set(name, result); }
        return result;
    };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...value });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject: string | null = 'builder';
    let sequence = 0;
    let beforeCommit: (() => void | Promise<void>) | null = null;
    let beforeApproval: (() => void) | null = null;
    const writes: string[] = [];
    const scheduled: Array<{ name: string; args: unknown }> = [];
    put('workspaces', workspaceId, { createdByUserId: 'users:owner' });
    put('projects', scope.projectId, { workspaceId, accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const user of ['builder', 'customer', 'other', 'viewer']) {
        put('users', `users:${user}`, { clerkUserId: user, email: `${user}@example.com` });
        put('workspaceMembers', `workspaceMembers:${user}`, { workspaceId, userId: `users:${user}`, role: 'member' });
        put('projectMembers', `projectMembers:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'builder' ? 'manager' : 'viewer' });
        if (user === 'customer' || user === 'other') put('cloudEditorGrants', `cloudEditorGrants:${user}`, {
            projectId: scope.projectId, userId: `users:${user}`, role: 'content', publish: false, updatedAt: 1 });
    }
    for (const [path, id] of [['app/page.tsx', 'one'], ['app/about/page.tsx', 'two']] as const) {
        const text = page(id);
        put('cloudEditorFiles', `cloudEditorFiles:${id}`, { ...scope, path, kind: 'file', text, bytes: Buffer.byteLength(text), hash: hash(text) });
    }
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId, version: 1, createdByUserId: 'users:builder',
        profile: 'imported-next-v1', preparationId: 'cloudEditorImportPreparations:ready', designRevision: 2, revision: 2, bytes: Buffer.byteLength(page('one')) + Buffer.byteLength(page('two')), fileCount: 2, status: 'stopped' });
    const pins = [
        ['package.json', '{}'], ['bun.lock', '{}'], ['next.config.ts', 'export default {};'],
        ['tsconfig.json', '{}'], ['public/weblab-preload-script.js', 'globalThis.weblab = true;'],
        ['public/weblab-ix-runtime.js', 'globalThis.weblabIx = true;'],
        ['src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'],
    ].map(([path, text]) => ({ path: path!, text: text!, hash: hash(text!), bytes: Buffer.byteLength(text!) }));
    for (const [index, pin] of pins.entries()) put('cloudEditorFiles', `cloudEditorFiles:pin${index}`, { ...scope, kind: 'file', ...pin });
    put('cloudEditorFiles', 'cloudEditorFiles:media', { ...scope, path: 'public/movie.mp4', kind: 'file', bytes: 24_500_000,
        hash: hash('media'), storageId: '_storage:media' });
    put('cloudEditorFiles', 'cloudEditorFiles:media2', { ...scope, path: 'public/movie2.mp4', kind: 'file', bytes: 24_500_000,
        hash: hash('media2'), storageId: '_storage:media2' });
    const policyBody = { kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: pins.map(({path, hash, bytes}) => ({ path, hash, bytes })) };
    put('cloudEditorImports', 'cloudEditorImports:baseline', { ...scope, workspaceId, state: 'finalized', manifestHash: hash('baseline') });
    put('cloudEditorImportPreparations', 'cloudEditorImportPreparations:ready', { ...scope, workspaceId,
        baselineAttemptId: 'cloudEditorImports:baseline', baselineManifestHash: hash('baseline'), inputManifestHash: hash('baseline'),
        preparedManifestHash: hash('prepared'), inputRevision: 1, preparedRevision: 2, generation: 1, profileVersion: 1,
        preparationVersion: 1, policy: { ...policyBody, policyHash: await hashPreparationPolicy(policyBody) } });
    // Deliberately stale aggregate proves commit totals are recomputed from retained rows.
    get('cloudEditorStates:one')!.bytes = 1;
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => structuredClone(get(id)),
            insert: async (name: string, value: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, value); writes.push(`insert:${name}`); return id; },
            patch: async (id: string, value: Record<string, unknown>) => { Object.assign(get(id)!, value); writes.push(`patch:${id}`); },
            replace: async (id: string, value: Record<string, unknown>) => { put(id.split(':')[0]!, id, value); writes.push(`replace:${id}`); },
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); writes.push(`delete:${id}`); },
            query: (name: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => constraints.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    take: async (limit: number) => structuredClone(rows().slice(0, limit)),
                    collect: async () => rows(),
                    unique: async () => { const found = rows(); if (found.length > 1) throw new Error('Nonunique row'); return structuredClone(found[0] ?? null); },
                };
                return query;
            },
        },
        scheduler: { runAfter: async (_delay: number, ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
            scheduled.push({ name: getFunctionName(ref), args });
        } },
    } as unknown as MutationCtx;
    const handlers: Record<string, (ctx: MutationCtx, args: never) => Promise<unknown>> = {
        'cloudEditorText:_approvalInput': _approvalInput._handler,
        'cloudEditorText:_selectionInput': _selectionInput._handler,
        'cloudEditorText:_approve': _approve._handler,
        'cloudEditorText:_input': _input._handler,
        'cloudEditorText:_commit': _commit._handler,
    };
    const run = async (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const name = getFunctionName(reference);
        if (name === 'cloudEditorText:_commit') await beforeCommit?.();
        if (name === 'cloudEditorText:_approve') beforeApproval?.();
        const handler = handlers[name];
        if (!handler) throw new Error(`Unexpected reference ${name}`);
        return handler(ctx, args as never);
    };
    const action = { runQuery: run, runMutation: run } as unknown as ActionCtx;
    const approvePath = (path = 'app/page.tsx', oid = 'title-one', expectedGeneration = 0) => approve._handler(action,
        { ...scope, actorId: 'users:builder' as Id<'users'>, path, bindings: [{ bindingId: oid, target: { kind: 'component-literal', exportName: 'Hero', oid } }], expectedRevision: Number(get('cloudEditorStates:one')!.revision), expectedGeneration });
    const request = (content = page('one').replace('Hello', 'Welcome')) => ({ ...scope,
        actorId: 'users:customer' as Id<'users'>, transport: 'content' as const, transportVersion: 2 as const,
        expectedRevision: 2, operationId: 'content_operation_0001', changes: [{ path: 'app/page.tsx', content }],
        expectedContracts: [{ path: 'app/page.tsx', generation: 1, version: 2 as const, designRevision: 2 }] });
    return { ctx, action, put, get, table, writes, scheduled, approvePath, request,
        beforeApproval: (hook: () => void) => { beforeApproval = hook; },
        signIn: (name: string | null) => { subject = name; }, beforeCommit: (hook: () => void | Promise<void>) => { beforeCommit = hook; } };
}

const gates = ['WEBLAB_CLOUD_EDITOR_ENABLED', 'WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED'] as const;
const previous = gates.map(key => process.env[key]);
beforeEach(() => { for (const key of gates) process.env[key] = 'true'; });
afterEach(() => { gates.forEach((key, index) => { const value = previous[index]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }); });

describe('imported v2 text handlers', () => {
    it('rejects approval and revoke as a substituted account even when both accounts are designers', async () => {
        const f = await fixture();
        await f.approvePath();
        f.get('projectMembers:other')!.role = 'manager';
        f.get('cloudEditorGrants:other')!.role = 'designer';
        f.signIn('other');
        f.writes.length = 0;
        await expect(f.approvePath('app/page.tsx', 'title-one', 1)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        await expect(revoke._handler(f.ctx, {
            ...scope, actorId: 'users:builder' as Id<'users'>, path: 'app/page.tsx', expectedGeneration: 1,
        })).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        expect(f.writes).toEqual([]);
        const approved = [...f.table('cloudEditorContentContracts').values()][0]!;
        expect(approved.active).toBe(true);
        expect(approved.generation).toBe(1);
    });

    it('rechecks the initiating approval actor after validation when the replacement account is also a designer', async () => {
        const f = await fixture();
        f.get('projectMembers:other')!.role = 'manager';
        f.get('cloudEditorGrants:other')!.role = 'designer';
        f.beforeApproval(() => f.signIn('other'));
        await expect(f.approvePath()).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        expect(f.writes).toEqual([]);
        expect([...f.table('cloudEditorContentContracts').values()]).toEqual([]);
    });

    it('fails closed on every public text endpoint when either rollout gate is disabled', async () => {
        for (const gate of gates) {
            const f = await fixture();
            process.env[gate] = 'false';
            try {
                await expect(contracts._handler(f.ctx, scope)).rejects.toThrow('CLOUD_DISABLED');
                await expect(revoke._handler(f.ctx, { ...scope, actorId: 'users:builder' as Id<'users'>, path: 'app/page.tsx', expectedGeneration: 1 }))
                    .rejects.toThrow('CLOUD_DISABLED');
                await expect(f.approvePath()).rejects.toThrow('CLOUD_DISABLED');
                await expect(resolveSelection._handler(f.action, {
                    ...scope, expectedRevision: 2, oid: 'title-one', mappingId: 'hero', itemId: 'one',
                })).rejects.toThrow('CLOUD_DISABLED');
                await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_DISABLED');
                expect(f.writes).toEqual([]);
                expect(f.scheduled).toEqual([]);
            } finally {
                process.env[gate] = 'true';
            }
        }
    });

    it('keeps version-two contracts invisible and unwritable through starter version-one handlers', async () => {
        const f = await fixture();
        await f.approvePath();
        f.get('cloudEditorStates:one')!.profile = 'starter-v1';
        f.writes.length = 0;
        expect((await legacyContracts._handler(f.ctx, scope)).contracts).toEqual([]);
        await expect(legacyApprovalInput._handler(f.ctx, {
            ...scope, path: 'app/page.tsx', expectedRevision: 2, expectedGeneration: 1,
        })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        await expect(legacyRevoke._handler(f.ctx, {
            ...scope, path: 'app/page.tsx', expectedGeneration: 1,
        })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        f.signIn('customer');
        await expect(legacyInput._handler(f.ctx, {
            ...scope, actorId: 'users:customer' as Id<'users'>,
            expectedRevision: 2, operationId: 'legacy_operation_0001', fingerprint: hash('legacy'),
            transport: 'content', transportVersion: 1,
            expectedContracts: [{ path: 'app/page.tsx', generation: 1 }],
        })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        expect(f.writes).toEqual([]);
    });

    it('does not expose or revoke empty and legacy-family rows as text approvals', async () => {
        for (const change of [
            { textBindings: [] },
            { bindings: [{ oid: 'legacy', fields: ['text'] }] },
        ]) {
            const f = await fixture(); await f.approvePath();
            const row = [...f.table('cloudEditorContentContracts').values()][0]!;
            Object.assign(row, change);
            const before = structuredClone(row);
            f.writes.length = 0;
            expect((await contracts._handler(f.ctx, scope)).contracts).toEqual([]);
            await expect(revoke._handler(f.ctx, { ...scope, actorId: 'users:builder' as Id<'users'>, path: 'app/page.tsx', expectedGeneration: 1 })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
            expect(row).toEqual(before);
            expect(f.writes).toEqual([]);
        }
    });

    it('refuses source inventories that hide executable modules behind storage', async () => {
        const f = await fixture(); await f.approvePath();
        f.put('cloudEditorFiles', 'cloudEditorFiles:hidden', { ...scope, path: 'src/app/other/page.tsx', kind: 'file',
            storageId: '_storage:hidden', hash: hash('hidden'), bytes: 6 });
        f.writes.length = 0;
        await expect(f.approvePath('app/page.tsx', 'title-one', 1)).rejects.toThrow('CLOUD_CONTENT_INVALID_TARGET');
        await expect(resolveSelection._handler(f.action, { ...scope, expectedRevision: 2, oid: 'faq-answer', mappingId: 'faq', itemId: 'first' }))
            .rejects.toThrow('CLOUD_CONTENT_INVALID_TARGET');
        f.signIn('customer');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_CONTENT_INVALID_TARGET');
        expect(f.writes).toEqual([]);
    });
    it('resolves and approves one keyed answer, revalidates its mapping, and writes only the data owner', async () => {
        const f = await fixture();
        const data = 'export const faqItems = [{ id: "first", question: "Who?", answer: "Everyone" }, { id: "second", question: "Where?", answer: "Here" }];';
        const modules: Record<string, string> = {
            'src/content/faq.ts': data,
            'src/components/faq.tsx': 'import { faqItems } from "@/content/faq"; import { ChatFaq } from "./chat-faq"; export function HomeFaq() { return <ChatFaq items={faqItems} weblabContentMapping="faq" data-oid="faq-call" />; }',
            'src/app/page.tsx': 'import { HomeFaq } from "@/components/faq"; export default function HomePage() { return <main><HomeFaq data-oid="ge98qit" /></main>; }',
            'src/components/chat-faq.tsx': `import { useId, useState } from 'react'; import * as AccordionPrimitive from '@radix-ui/react-accordion';
export function ChatFaq({items, heading, eyebrowLead, eyebrowTail, avatarSrc, className, weblabContentMapping}) {
const headingId = useId(); const [activeItem, setActiveItem] = useState(items[0]?.id ?? ''); if (!items.length) return null;
return <section>{items.map((item) => { const isOpen = activeItem === item.id; return <AccordionPrimitive.Item key={item.id} value={item.id}>
<span data-oid="faq-question" data-weblab-content-map={weblabContentMapping} data-weblab-content-item={item.id}>{item.question}</span>
<p data-oid="faq-answer" data-weblab-content-map={weblabContentMapping} data-weblab-content-item={item.id}>{item.answer}</p>
</AccordionPrimitive.Item>; })}</section>; }`,
        };
        for (const [path, text] of Object.entries(modules)) f.put('cloudEditorFiles', `cloudEditorFiles:${path}`, {
            ...scope, path, kind: 'file', text, hash: hash(text), bytes: Buffer.byteLength(text) });
        const config = JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } });
        const configRow = f.get('cloudEditorFiles:pin3')!;
        Object.assign(configRow, { text: config, bytes: Buffer.byteLength(config), hash: hash(config) });
        const preparation = f.get('cloudEditorImportPreparations:ready')!;
        const policy = preparation.policy as Parameters<typeof hashPreparationPolicy>[0];
        Object.assign(policy.pinnedFiles.find(file => file.path === 'tsconfig.json')!, { hash: hash(config), bytes: Buffer.byteLength(config) });
        preparation.policy = { ...policy, policyHash: await hashPreparationPolicy(policy) };
        const selection = await resolveSelection._handler(f.action, { ...scope, expectedRevision: 2, oid: 'faq-answer', mappingId: 'faq', itemId: 'first' });
        expect(selection.path).toBe('src/content/faq.ts'); expect(selection.value).toBe('Everyone');
        await approve._handler(f.action, { ...scope, actorId: 'users:builder' as Id<'users'>, path: selection.path, expectedRevision: 2, expectedGeneration: 0,
            bindings: [{ bindingId: 'faq.first.answer', target: selection.target, renderMapping: selection.renderMapping }] });
        f.signIn('customer');
        const request = { ...f.request(), changes: [{ path: selection.path, content: data.replace('Everyone', 'Only this answer') }],
            expectedContracts: [{ path: selection.path, version: 2 as const, generation: 1, designRevision: 2 }] };
        await commit._handler(f.action, request);
        expect(f.get(`cloudEditorFiles:${selection.path}`)!.text).toBe(data.replace('Everyone', 'Only this answer'));
        expect(f.get('cloudEditorFiles:src/components/chat-faq.tsx')!.text).toBe(modules['src/components/chat-faq.tsx']);
        expect(f.get('cloudEditorStates:one')!.designRevision).toBe(2);
        // A second consumer cannot be introduced under a saved approval even if a broken
        // external writer forgot to advance the epoch. Complete-source resolution still refuses it.
        const consumer = 'import { faqItems } from "@/content/faq"; export const copied = faqItems;';
        f.put('cloudEditorFiles', 'cloudEditorFiles:extra', { ...scope, path: 'src/extra.ts', kind: 'file', text: consumer, hash: hash(consumer), bytes: Buffer.byteLength(consumer) });
        f.writes.length = 0;
        await expect(commit._handler(f.action, { ...request, expectedRevision: 3, operationId: 'faq_second_operation_0001',
            changes: [{ path: selection.path, content: data.replace('Everyone', 'Another answer') }] })).rejects.toThrow('CLOUD_CONTENT_INVALID_TARGET');
        expect(f.writes).toEqual([]);
    });
    it('does not approve a data leaf without a verified rendered mapping', async () => {
        const f = await fixture();
        const text = 'export const items = [{ id: "first", question: "Who?", answer: "Everyone" }];';
        f.put('cloudEditorFiles', 'cloudEditorFiles:faq', { ...scope, path: 'src/content/faq.ts', kind: 'file', text,
            hash: hash(text), bytes: Buffer.byteLength(text) });
        f.writes.length = 0;
        await expect(approve._handler(f.action, { ...scope, actorId: 'users:builder' as Id<'users'>, path: 'src/content/faq.ts', expectedRevision: 2, expectedGeneration: 0,
            bindings: [{ bindingId: 'faq.first', target: { kind: 'data-leaf', exportName: 'items', itemId: 'first', property: 'answer' } }] }))
            .rejects.toThrow('CLOUD_CONTENT_INVALID_TARGET');
        expect(f.writes).toEqual([]);
    });

    it('resolving rendered identity is designer-only and bound to the saved revision', async () => {
        const f = await fixture(); f.signIn('customer');
        const input = { ...scope, expectedRevision: 2, oid: 'answer', mappingId: 'faq', itemId: 'first' };
        await expect(resolveSelection._handler(f.action, input)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        f.signIn('builder');
        await expect(resolveSelection._handler(f.action, { ...input, expectedRevision: 1 })).rejects.toThrow('CLOUD_CONFLICT');
        await expect(resolveSelection._handler(f.action, input)).rejects.toThrow('CLOUD_CONTENT_INVALID_TARGET');
    });
    it('retains 49MB media, stores reconstructed text, preserves epoch and schedules only existing sync', async () => {
        const f = await fixture(); await f.approvePath(); f.signIn('customer');
        const args = f.request(page('one').replace('Hello', 'Welcome').replace('return <main', 'return  <main'));
        const media = structuredClone(f.get('cloudEditorFiles:media'));
        expect(await commit._handler(f.action, args)).toEqual({ revision: 3, currentRevision: 3 });
        expect(f.get('cloudEditorFiles:one')!.text).toBe(page('one').replace('Hello', '{"Welcome"}'));
        expect(f.get('cloudEditorFiles:media')).toEqual(media);
        expect(f.get('cloudEditorStates:one')!.designRevision).toBe(2);
        const actual = [...f.table('cloudEditorFiles').values()].reduce((sum, row) => sum + Number(row.bytes), 0);
        expect(f.get('cloudEditorStates:one')!.bytes).toBe(actual);
        expect(actual).toBeGreaterThan(49_000_000);
        expect(f.scheduled).toEqual([{ name: 'cloudEditorRuntime:sync', args: scope }]);
        const writes = f.writes.length;
        expect(await commit._handler(f.action, args)).toEqual({ revision: 3, currentRevision: 3 });
        expect(f.writes).toHaveLength(writes);
    });
    it('advertises prepared customer access separately from designer approval and requires the explicit flag', async () => {
        const f = await fixture();
        expect(await access._handler(f.ctx, scope)).toMatchObject({ canApproveImportedText: true, canEditContent: true });
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
        expect((await access._handler(f.ctx, scope)).canApproveImportedText).toBeUndefined();
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
        f.get('cloudEditorStates:one')!.designRevision = undefined;
        expect((await access._handler(f.ctx, scope)).canApproveImportedText).toBeUndefined();
        f.get('cloudEditorStates:one')!.designRevision = 2;
        f.signIn('customer');
        expect(await access._handler(f.ctx, scope)).toMatchObject({ canEditContent: true, canPreview: true });
        expect((await access._handler(f.ctx, scope)).canApproveImportedText).toBeUndefined();
        expect((await contracts._handler(f.ctx, scope)).contracts).toEqual([]);
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
        expect(await access._handler(f.ctx, scope)).toMatchObject({ canEditContent: false, canPreview: false });
    });
    it('refuses a component identity duplicated in another saved source file', async () => {
        const f = await fixture();
        const text = page('two').replace('title-two', 'title-one');
        Object.assign(f.get('cloudEditorFiles:two')!, { text, hash: hash(text), bytes: Buffer.byteLength(text) });
        await expect(f.approvePath()).rejects.toThrow('CLOUD_CONTENT_DUPLICATE_OID');
        expect(f.table('cloudEditorContentContracts').size).toBe(0);
        expect(f.writes).toHaveLength(0);
    });
    it('restricts approval and revoke to designers with current project update permission', async () => {
        const f = await fixture(); await f.approvePath(); f.signIn('customer');
        await expect(f.approvePath()).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(revoke._handler(f.ctx, { ...scope, actorId: 'users:builder' as Id<'users'>, path: 'app/page.tsx', expectedGeneration: 1 })).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        f.signIn('builder'); f.get('projectMembers:builder')!.role = 'viewer';
        await expect(f.approvePath()).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });
    it('lets designers recover stale and revoked generations without offering them to customers', async () => {
        const f = await fixture(); await f.approvePath();
        f.get('cloudEditorStates:one')!.designRevision = 3;
        f.get('cloudEditorStates:one')!.revision = 3;
        let result = await contracts._handler(f.ctx, scope);
        expect(result.contracts[0]).toMatchObject({ generation: 1, designRevision: 2, active: true, current: false });
        f.signIn('customer');
        expect((await contracts._handler(f.ctx, scope)).contracts).toEqual([]);
        f.signIn('builder');
        await f.approvePath('app/page.tsx', 'title-one', result.contracts[0]!.generation);
        await revoke._handler(f.ctx, { ...scope, actorId: 'users:builder' as Id<'users'>, path: 'app/page.tsx', expectedGeneration: 2 });
        result = await contracts._handler(f.ctx, scope);
        expect(result.contracts[0]).toMatchObject({ generation: 3, active: false, current: false });
        f.signIn('customer');
        expect((await contracts._handler(f.ctx, scope)).contracts).toEqual([]);
        f.signIn('builder');
        await f.approvePath('app/page.tsx', 'title-one', result.contracts[0]!.generation);
        f.signIn('customer');
        expect((await contracts._handler(f.ctx, scope)).contracts[0]).toMatchObject({ generation: 4, designRevision: 3, current: true });
    });
    it('requires current access and actor even when retrying a stored receipt', async () => {
        const f = await fixture(); await f.approvePath(); f.signIn('customer');
        await commit._handler(f.action, f.request());
        await expect(commit._handler(f.action, f.request(page('one').replace('Hello', 'Different')))).rejects.toThrow('CLOUD_INVALID_OPERATION');
        f.signIn('other');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        f.signIn('customer'); f.table('cloudEditorGrants').delete('cloudEditorGrants:customer');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        f.put('cloudEditorGrants', 'cloudEditorGrants:customer', { projectId: scope.projectId, userId: 'users:customer', role: 'content' });
        f.table('projectMembers').delete('projectMembers:customer');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('FORBIDDEN');
    });
    it('rejects an old generation but returns an exact receipt after target revoke without replaying writes', async () => {
        const f = await fixture(); await f.approvePath(); f.signIn('customer'); await commit._handler(f.action, f.request());
        f.signIn('builder'); await revoke._handler(f.ctx, { ...scope, actorId: 'users:builder' as Id<'users'>, path: 'app/page.tsx', expectedGeneration: 1 });
        await f.approvePath('app/page.tsx', 'title-one', 2);
        f.signIn('customer'); const writes = f.writes.length;
        expect(await commit._handler(f.action, f.request())).toEqual({ revision: 3, currentRevision: 3 });
        await expect(commit._handler(f.action, { ...f.request(), expectedRevision: 3, operationId: 'stale_generation_123' })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        expect(f.writes).toHaveLength(writes);
    });
    it('fails closed on missing/invalid epochs and keeps version one out of version two', async () => {
        for (const designRevision of [undefined, 0, 1.5, 3]) {
            const f = await fixture(); f.get('cloudEditorStates:one')!.designRevision = designRevision;
            // Invalid prepared authority removes canDesign before text-contract admission.
            await expect(f.approvePath()).rejects.toThrow('CLOUD_ROLE_REQUIRED');
            expect(f.writes).toEqual([]);
            expect(f.scheduled).toEqual([]);
        }
        const f = await fixture(); await f.approvePath(); f.signIn('customer');
        const args = f.request(); Reflect.set(args, 'transportVersion', 1);
        await expect(commit._handler(f.action, args)).rejects.toThrow('CLOUD_INVALID_OPERATION');
        Reflect.set(args, 'transportVersion', 2); Reflect.set(args.expectedContracts[0]!, 'version', 1);
        await expect(commit._handler(f.action, args)).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        const row = [...f.table('cloudEditorContentContracts').values()][0]!; row.version = 1;
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
    });
    it('rechecks actor, role, epoch, revision and generation after validation with zero writes', async () => {
        for (const [change, code] of [
            [(f: Awaited<ReturnType<typeof fixture>>) => f.signIn('other'), 'CLOUD_ACTOR_CHANGED'],
            [(f: Awaited<ReturnType<typeof fixture>>) => f.table('cloudEditorGrants').delete('cloudEditorGrants:customer'), 'CLOUD_ROLE_REQUIRED'],
            [(f: Awaited<ReturnType<typeof fixture>>) => { f.get('cloudEditorStates:one')!.designRevision = undefined; }, 'CLOUD_CONTENT_STALE_CONTRACT'],
            [(f: Awaited<ReturnType<typeof fixture>>) => { f.get('cloudEditorStates:one')!.revision = 3; }, 'CLOUD_CONFLICT'],
            [(f: Awaited<ReturnType<typeof fixture>>) => { [...f.table('cloudEditorContentContracts').values()][0]!.generation = 2; }, 'CLOUD_CONTENT_STALE_CONTRACT'],
            [(f: Awaited<ReturnType<typeof fixture>>) => { [...f.table('cloudEditorContentContracts').values()][0]!.active = false; }, 'CLOUD_CONTENT_STALE_CONTRACT'],
        ] as const) {
            const f = await fixture(); await f.approvePath(); f.signIn('customer'); f.writes.length = 0;
            f.beforeCommit(() => { change(f); });
            await expect(commit._handler(f.action, f.request())).rejects.toThrow(code);
            expect(f.writes).toEqual([]);
        }
    });
    it('designer writes to unapproved source invalidate all approvals and retries never advance the epoch', async () => {
        const f = await fixture(); await f.approvePath();
        const text = page('two').replace('Hello', 'Designer change');
        const args = { ...scope, actorId: 'users:builder' as Id<'users'>, expectedRevision: 2,
            operationId: 'designer_unlisted_123', fingerprint: hash('designer'),
            changes: [{ path: 'app/about/page.tsx', kind: 'file' as const, text, hash: hash(text), bytes: Buffer.byteLength(text) }] };
        expect((await designerCommit._handler(f.ctx, args)).revision).toBe(3);
        expect(f.get('cloudEditorStates:one')!.designRevision).toBe(3);
        expect((await contracts._handler(f.ctx, scope)).contracts[0]).toMatchObject({ current: false, designRevision: 2 });
        const writes = f.writes.length;
        await designerCommit._handler(f.ctx, args);
        expect(f.writes).toHaveLength(writes);
        f.signIn('customer');
        await expect(commit._handler(f.action, { ...f.request(), expectedRevision: 3 })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
    });
    it('rejects an epoch change during text validation even at an unchanged source revision', async () => {
        const f = await fixture(); await f.approvePath(); f.get('cloudEditorStates:one')!.revision = 3;
        f.signIn('customer'); f.writes.length = 0;
        f.beforeCommit(() => { f.get('cloudEditorStates:one')!.designRevision = 3; });
        await expect(commit._handler(f.action, { ...f.request(), expectedRevision: 3 })).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        expect(f.writes).toEqual([]);
    });
    it('rechecks the actor, epoch and revision at approval publication', async () => {
        for (const [change, code] of [
            [(f: Awaited<ReturnType<typeof fixture>>) => f.signIn('other'), 'CLOUD_ROLE_REQUIRED'],
            [(f: Awaited<ReturnType<typeof fixture>>) => { f.get('cloudEditorStates:one')!.designRevision = 3; }, 'CLOUD_CONTENT_STALE_CONTRACT'],
            [(f: Awaited<ReturnType<typeof fixture>>) => { f.get('cloudEditorStates:one')!.revision = 4; }, 'CLOUD_CONFLICT'],
        ] as const) {
            const f = await fixture(); f.get('cloudEditorStates:one')!.revision = 3; f.writes.length = 0;
            f.beforeApproval(() => { change(f); });
            await expect(f.approvePath()).rejects.toThrow(code);
            expect(f.writes).toEqual([]);
        }
    });
    it('invalid later files reject the whole batch before any publication', async () => {
        const f = await fixture(); await f.approvePath(); await f.approvePath('app/about/page.tsx', 'title-two');
        f.signIn('customer'); f.writes.length = 0;
        const args = f.request(); args.changes.push({ path: 'app/about/page.tsx', content: page('two').replace('<h1 ', '<h1 hidden ') });
        args.expectedContracts.push({ path: 'app/about/page.tsx', generation: 1, version: 2, designRevision: 2 });
        await expect(commit._handler(f.action, args)).rejects.toThrow('UNAPPROVED_CHANGE');
        expect(f.writes).toEqual([]);
        expect(f.get('cloudEditorFiles:one')!.text).toBe(page('one'));
    });
    it('never opens legacy content, Studio or image transports on imported profiles', async () => {
        const f = await fixture(); await f.approvePath(); f.signIn('customer');
        await expect(legacyInput._handler(f.ctx, { ...scope, transport: 'content', transportVersion: 1,
            actorId: 'users:customer' as Id<'users'>, expectedRevision: 2, operationId: 'legacy_operation_123', fingerprint: hash('legacy'),
            expectedContracts: [{ path: 'app/page.tsx', generation: 1 }] })).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        await expect(reserveImage._handler(f.ctx, { ...scope, actorId: 'users:customer' as Id<'users'>, path: 'app/page.tsx',
            oid: 'title-one', expectedRevision: 2, generation: 1, operationId: 'image_operation_123' })).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        f.signIn('builder');
        await expect(studioAdmission(f.ctx, { ...scope, actorId: 'users:builder' as Id<'users'>,
            expectedRevision: 2, expectedGeneration: 0, operationId: 'studio_operation_123', fingerprint: hash('studio') }, true)).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
    });
    it('requires the separate content flag without changing the legacy capability', async () => {
        const f = await fixture();
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
        await expect(f.approvePath()).rejects.toThrow('CLOUD_DISABLED');
        expect(f.scheduled).toEqual([]);
    });
});
