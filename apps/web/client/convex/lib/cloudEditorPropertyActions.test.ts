import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { getFunctionName } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { approve, commit, resolveSelection } from '../cloudEditorPropertyActions';
import { createCloudPropertyContract } from './cloudContentPropertyContract';
import { resolveContentPropertyTarget } from '@weblab/parser/src/code-edit/content-property-target';

const hash = (source: string) => createHash('sha256').update(source).digest('hex');
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'>, actorId: 'users:builder' as Id<'users'> };
const preparationId = 'cloudEditorImportPreparations:one' as Id<'cloudEditorImportPreparations'>;
const hero = 'src/components/sections/hero.tsx';
const source = `export function Hero(){return <header><a href="/login" data-oid="link">Log in</a></header>;}`;
const binding = { bindingId: 'login', label: 'Login', target: { kind: 'component-literal-href' as const, exportName: 'Hero', oid: 'link', field: 'href' as const },
    options: [{ id: 'current', label: 'Login', value: '/login' }, { id: 'next', label: 'Contact', value: '/contact' }] };
// These tests isolate the Node action boundary. Authority/CAS/atomic write tests
// live in cloudEditorProperties.test.ts and use the real backend handlers.
function harness(queryResult: unknown) {
    const mutations: Array<{ name: string; args: unknown }> = [];
    const ctx = { runQuery: async () => structuredClone(queryResult),
        runMutation: async (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
            mutations.push({ name: getFunctionName(ref), args }); return { revision: 3, currentRevision: 3 };
        } } as unknown as ActionCtx;
    return { ctx, mutations };
}
function native() {
    const contract = createCloudPropertyContract(hero, { [hero]: source }, [binding]);
    const files: Array<{ path: string; kind: string; text?: string; hash: string; bytes: number; storageId?: string }> =
        [{ path: hero, kind: 'file', text: source, hash: hash(source), bytes: Buffer.byteLength(source) }];
    const snapshot = { files, sourceFingerprint: hash('inventory'), ownerHash: hash(source), ownerBytes: Buffer.byteLength(source),
        contract: { ...contract, generation: 1, preparationId, designRevision: 2, active: true }, sibling: null };
    const request = { ...scope, transport: 'content-property' as const, transportVersion: 1 as const, expectedRevision: 2,
        operationId: 'property_operation_0001', pin: { version: 1 as const, path: hero, generation: 1, preparationId, designRevision: 2, definitionHash: contract.definitionHash, bindingId: 'login' },
        previousValue: '/login', choiceId: 'next', changes: [{ path: hero, content: source.replace('/login', '/contact') }] };
    return { snapshot, request };
}
describe('property Node reconstruction boundary', () => {
    it('passes independently reconstructed exact owner hash and unchanged request to V8', async () => {
        const f = native(), h = harness({ receipt: null, snapshot: f.snapshot });
        await commit._handler(h.ctx, f.request);
        expect(h.mutations).toEqual([{ name: 'cloudEditorProperties:_commit', args: { ...f.request,
            sourceFingerprint: f.snapshot.sourceFingerprint, ownerHash: hash(source), ownerBytes: Buffer.byteLength(source),
            nextHash: hash(f.request.changes[0]!.content), nextBytes: Buffer.byteLength(f.request.changes[0]!.content), sibling: null } }]);
    });
    it('does not parse or dispatch another mutation for an existing receipt', async () => {
        const h = harness({ receipt: { revision: 3, currentRevision: 7 }, snapshot: null });
        expect(await commit._handler(h.ctx, native().request)).toEqual({ revision: 3, currentRevision: 7 }); expect(h.mutations).toEqual([]);
    });
    it('rejects owner changes outside the selected literal and hidden executable consumers including public', async () => {
        const f = native(), h = harness({ receipt: null, snapshot: f.snapshot });
        await expect(commit._handler(h.ctx, { ...f.request, changes: [{ path: hero, content: f.request.changes[0]!.content.replace('Log in', 'Injected') }] }))
            .rejects.toThrow('CLOUD_PROPERTY_UNAPPROVED_CHANGE');
        expect(h.mutations).toEqual([]);
        for (const path of ['src/hidden.tsx', 'public/consumer.js']) {
            const f = native(); f.snapshot.files.push({ path, kind: 'file', storageId: '_storage:hidden', hash: hash('hidden'), bytes: 6 });
            const h = harness({ receipt: null, snapshot: f.snapshot });
            await expect(commit._handler(h.ctx, f.request)).rejects.toThrow('CLOUD_PROPERTY_INVALID_TARGET'); expect(h.mutations).toEqual([]);
            const a = harness(f.snapshot);
            await expect(approve._handler(a.ctx, { ...scope, path: hero, expectedRevision: 2, expectedGeneration: 0,
                expectedPreparationId: preparationId, expectedDesignRevision: 2, bindings: [binding] })).rejects.toThrow('CLOUD_PROPERTY_INVALID_TARGET');
            expect(a.mutations).toEqual([]);
        }
    });
    it('resolves and commits the prepared About enum without changing Security or its image mapping', async () => {
        const about = 'src/app/about/page.tsx', security = 'src/app/security/page.tsx';
        const files = {
            'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
            'src/content/about.ts': `export const aboutHero = { imageSrc: '/about.webp', imageAlt: 'About', imageWidth: 100, imageHeight: 80 } as const;`,
            'src/content/security.ts': `export const securityHero = { imageSrc: '/security.webp', imageAlt: 'Security', imageWidth: 100, imageHeight: 80 } as const;`,
            [about]: `import { PageHero } from '@/components/sections/page-hero'; import { aboutHero } from '@/content/about';
export default function AboutPage() { return <main><PageHero {...aboutHero} weblabContentMapping="prepared-about-hero" tone="light" data-oid="unkha:4" /></main>; }`,
            [security]: `import { PageHero } from '@/components/sections/page-hero'; import { securityHero } from '@/content/security';
export default function SecurityPage() { return <main><PageHero {...securityHero} weblabContentMapping="prepared-security-hero" data-oid="security-call" /></main>; }`,
            'src/components/sections/page-hero.tsx': `export function PageHero({ imageSrc, imageAlt, imageWidth, imageHeight, tone = 'dark', weblabContentMapping }) {
return <header className={tone === 'light' ? 'light' : 'dark'}><img src={imageSrc} alt={imageAlt} width={imageWidth} height={imageHeight} data-weblab-content-map={weblabContentMapping} data-weblab-content-item="single" data-oid="rpgk:yx" /></header>; }`,
        };
        const selection = { kind: 'mapped-callsite-enum' as const, oid: 'rpgk:yx', mappingId: 'prepared-about-hero', itemId: 'single' as const };
        const found = resolveContentPropertyTarget(files, selection);
        const rows = Object.entries(files).map(([path, text]) => ({ path, kind: 'file', text, hash: hash(text), bytes: Buffer.byteLength(text) }));
        const h = harness({ files: rows, ...scope, revision: 2, preparationId, designRevision: 2, contracts: [{ path: about, generation: 4 }] });
        expect(await resolveSelection._handler(h.ctx, { ...scope, expectedRevision: 2, selection })).toEqual({ ...found, actorId: scope.actorId, revision: 2, preparationId, designRevision: 2, generation: 4 });
        const contract = createCloudPropertyContract(about, files, [{ bindingId: 'tone', label: 'Tone', target: found.target,
            options: [{ id: 'light', label: 'Light', value: 'light' }, { id: 'dark', label: 'Dark', value: 'dark' }] }]);
        const snapshot = { files: rows, contract, sibling: null, sourceFingerprint: hash('inventory'), ownerHash: hash(files[about]!), ownerBytes: Buffer.byteLength(files[about]!) };
        const request = { ...native().request, pin: { ...native().request.pin, path: about, generation: 4, definitionHash: contract.definitionHash, bindingId: 'tone' },
            previousValue: 'light', choiceId: 'dark', changes: [{ path: about, content: files[about]!.replace('tone="light"', 'tone="dark"') }] };
        const c = harness({ receipt: null, snapshot }); await commit._handler(c.ctx, request);
        expect(c.mutations[0]!.args).toMatchObject({ changes: request.changes });
        expect(rows.find(row => row.path === security)!.text).toBe(files[security]!);
    });
});
