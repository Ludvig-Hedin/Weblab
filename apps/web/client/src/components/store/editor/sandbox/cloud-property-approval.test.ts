import { describe, expect, it } from 'bun:test';
import { getFunctionName, type FunctionReference } from 'convex/server';
import type { CodeFileSystem, DurableCommitHandler, DurableSourceFile } from '@weblab/file-system';
import type { CloudPropertyApproval, WriteCodeAction } from '@weblab/models/actions';
import type { CloudEditorClient, CloudPropertyContracts, CloudPropertyOperation } from '@/lib/cloud-editor/api';
import { CloudSource } from './cloud-source';
import { cloudRecoveryOperation, storedCloudRecoveryRecord, type CloudRecoveryRecord, type CloudRecoveryStore } from './cloud-recovery';
import { cloudPropertyApprovalIdentity, cloudPropertyTargetIdentity, cloudPropertyWirePin, copyCloudPropertyBinding, freezeCloudPropertyApproval, matchesCloudPropertyElement, reconstructCloudPropertyAction, validCloudPropertyApproval } from './cloud-property-approval';
import { reverseWriteCodeAction, transformRedoAction, updateTransactionActions } from '../history/helpers';

export const propertyPin: CloudPropertyApproval = { version: 1, actorId: 'actor', projectId: 'project', branchId: 'branch', path: 'src/components/sections/hero.tsx',
    preparationId: 'preparation', generation: 2, designRevision: 1, definitionHash: 'a'.repeat(64), binding: { bindingId: 'destination', label: 'Destination',
        target: { kind: 'component-literal-href', exportName: 'Hero', oid: 'cta', field: 'href' }, options: [
            { id: 'about', label: 'About', value: '/about' }, { id: 'contact', label: 'Contact', value: '/contact' }] } };
export const propertyOriginal = 'export function Hero() { return <header className={styles.hero}><a data-oid="cta" href="/about"><span>Later text stays</span></a></header>; }';
export const propertyAction: WriteCodeAction = { type: 'write-code', branchId: 'branch', diffs: [{ path: propertyPin.path, original: propertyOriginal,
    generated: propertyOriginal.replace('href="/about"', 'href="/contact"') }], cloudProperty: { pin: propertyPin, previousValue: '/about', value: '/contact' } };

export async function propertyFixture() {
    let content = propertyOriginal, actorId = 'actor', revision = 1, handler!: DurableCommitHandler, record: CloudRecoveryRecord | null = null;
    let loseAck = false, failRefresh = false, localWork = () => false;
    let beforeRead = async () => {}, beforeDurable = async () => {}, afterRecovery = async () => {};
    const sent: CloudPropertyOperation[] = [], checked: Array<{ path: string; candidate: string; original: string | undefined }> = [];
    const receipts = new Map<string, { revision: number; currentRevision: number }>();
    const contracts: CloudPropertyContracts['contracts'] = [{ path: propertyPin.path, version: 1, generation: 2,
        preparationId: 'preparation' as CloudPropertyContracts['preparationId'], designRevision: 1, active: true, current: true,
        bindings: [copyCloudPropertyBinding(propertyPin.binding)], definitionHash: propertyPin.definitionHash }];
    const recovery: CloudRecoveryStore = { load: async () => record, save: async (_key, next) => { record = structuredClone(next); await afterRecovery(); },
        remove: async (_key, operationId) => { if (record?.operation.operationId !== operationId) throw Error('Wrong recovery owner'); record = null; } };
    const fs = { setDurableCommitHandler: (next: DurableCommitHandler) => { handler = next; }, setDurableRecoveryHandler: () => {}, setDurableCacheErrorHandler: () => {},
        hydrateDurableSnapshot: async (files: DurableSourceFile[]) => { const file = files.find(file => file.path === propertyPin.path); if (typeof file?.content === 'string') content = file.content; },
        readFile: async () => { await beforeRead(); return content; },
        writeCloudTextFile: async (path: string, candidate: string, original?: string) => {
            checked.push({ path, candidate, original }); await beforeDurable();
            if (original !== content) throw Error('Changed under lock');
            await handler([{ path, content: candidate }]); content = candidate;
        } } as unknown as CodeFileSystem;
    const status = () => ({ actorId, revision, profile: 'imported-next-v1', importedAuthority: { preparationId: 'preparation', designRevision: 1 },
        status: 'stopped', enabled: true, appliedRevision: null, previewUrl: null, previewToken: null, expiresAt: null, error: null });
    const client = { query: async (ref: FunctionReference<'query'>) => {
        switch (getFunctionName(ref)) {
            case 'cloudEditorAccess:access': return { actorId, role: 'content', canDesign: false, canEditContent: true, canManage: false,
                canPublish: false, canEditImportedText: true, canEditImportedProperties: true };
            case 'cloudEditorText:contracts': return { actorId, revision, designRevision: 1, contracts: [] };
            case 'cloudEditorProperties:contracts': if (failRefresh) throw Error('Read lost'); return { actorId, revision, preparationId: 'preparation', designRevision: 1, canApprove: false, contracts: structuredClone(contracts) };
            case 'cloudEditor:snapshot': {
                const bytes = new TextEncoder().encode(content);
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
                return { ...status(), files: [{ path: propertyPin.path, kind: 'file', text: content, storageId: null, bytes: bytes.length, hash }] };
            }
            default: return status();
        }
    }, action: async (ref: FunctionReference<'action'>, operation: CloudPropertyOperation) => {
        expect(getFunctionName(ref)).toBe('cloudEditorPropertyActions:commit'); sent.push(structuredClone(operation));
        let receipt = receipts.get(operation.operationId);
        if (!receipt) { expect(operation.expectedRevision).toBe(revision); revision++; receipt = { revision, currentRevision: revision }; receipts.set(operation.operationId, receipt); }
        if (loseAck) throw Error('Lost acknowledgment');
        return receipt;
    }, mutation: async () => { throw Error('Unexpected mutation'); } } as unknown as CloudEditorClient;
    const source = new CloudSource(client, { projectId: 'project', branchId: 'branch' } as CloudSource['scope'], fs, { recoveryStore: recovery, hasLocalWork: () => localWork() });
    await source.start();
    return { source, fs, sent, checked, contracts, record: () => record, content: () => content,
        setContent: (next: string) => { content = next; }, loseAck: (next: boolean) => { loseAck = next; }, failRefresh: () => { failRefresh = true; },
        switchActor: () => { actorId = 'other'; }, watchLocalWork: (read: () => boolean) => { localWork = read; },
        onRead: (read: typeof beforeRead) => { beforeRead = read; }, onDurable: (run: typeof beforeDurable) => { beforeDurable = run; },
        onRecovery: (run: typeof afterRecovery) => { afterRecovery = run; } };
}
function write(f: Awaited<ReturnType<typeof propertyFixture>>, current = () => true) {
    return f.source.withApprovedPropertyWrite({ pin: propertyPin, revision: 1, previousValue: '/about', choiceId: 'contact',
        original: propertyOriginal, candidate: propertyAction.diffs[0]!.generated, current }, lease => lease.commit());
}

describe('approved property identity and semantic history', () => {
    it('matches transported property targets independently of object key order', () => {
        const link = propertyPin.binding.target;
        const tone: CloudPropertyApproval['binding']['target'] = { kind: 'mapped-callsite-enum', exportName: 'AboutPage', oid: 'about-call', field: 'tone',
            renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about-hero',
                callsite: { path: 'src/app/about/page.tsx', exportName: 'AboutPage', oid: 'about-call' },
                renderer: { path: 'src/components/page-hero.tsx', exportName: 'PageHero', oid: 'shared-image' } } };
        for (const target of [link, tone]) {
            const transported = JSON.parse(JSON.stringify(target, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
                ? Object.fromEntries(Object.entries(value).reverse()) : value));
            expect(JSON.stringify(transported)).not.toBe(JSON.stringify(target));
            expect(cloudPropertyTargetIdentity(transported)).toBe(cloudPropertyTargetIdentity(target));
            expect(cloudPropertyTargetIdentity({ ...target, oid: 'different' })).not.toBe(cloudPropertyTargetIdentity(target));
        }
        expect(cloudPropertyTargetIdentity({ ...tone, renderMapping: { ...tone.renderMapping,
            renderer: { ...tone.renderMapping.renderer, path: 'src/components/other.tsx' } } })).not.toBe(cloudPropertyTargetIdentity(tone));
    });
    it('detaches and freezes the entire policy, target and all options', () => {
        const frozen = freezeCloudPropertyApproval(propertyPin), before = cloudPropertyApprovalIdentity(frozen), copy = copyCloudPropertyBinding(frozen.binding);
        copy.options[0]!.value = '/other'; copy.target.oid = 'other';
        expect(cloudPropertyApprovalIdentity(frozen)).toBe(before);
        for (const value of [frozen, frozen.binding, frozen.binding.target, frozen.binding.options, ...frozen.binding.options]) expect(Object.isFrozen(value)).toBe(true);
        for (const changed of [{ actorId: 'other' }, { preparationId: 'other' }, { generation: 3 }, { definitionHash: 'b'.repeat(64) }, { designRevision: 2 }])
            expect(cloudPropertyApprovalIdentity({ ...frozen, ...changed })).not.toBe(before);
    });
    it('refuses malformed, broadened, unsafe and duplicate definitions', () => {
        expect(validCloudPropertyApproval(propertyPin)).toBe(true);
        for (const value of [null, { ...propertyPin, extra: true }, { ...propertyPin, definitionHash: propertyPin.definitionHash + '\n' },
            { ...propertyPin, generation: 0 }, { ...propertyPin, preparationId: 'preparation\n' }, { ...propertyPin, path: '../src/hero.tsx' },
            { ...propertyPin, binding: { ...propertyPin.binding, options: [...propertyPin.binding.options, propertyPin.binding.options[0]] } },
            ...['javascript:alert(1)', '//outside.test', '/bad%00', '\ud800'].map(value => ({ ...propertyPin, binding: { ...propertyPin.binding, options: [{ id: 'a', label: 'Choice', value }] } }))])
            expect(validCloudPropertyApproval(value)).toBe(false);
    });
    it('reconstructs undo and redo from current bytes without losing later text', () => {
        const later = propertyAction.diffs[0]!.generated.replace('Later text stays', 'New text');
        const inverse = reconstructCloudPropertyAction(reverseWriteCodeAction(propertyAction), later);
        expect(inverse.diffs[0]!.generated).toBe(propertyOriginal.replace('Later text stays', 'New text'));
        const forward = reconstructCloudPropertyAction(transformRedoAction(propertyAction) as WriteCodeAction, inverse.diffs[0]!.generated);
        expect(forward.diffs[0]!.generated).toBe(later);
        expect(() => reconstructCloudPropertyAction(propertyAction, later)).toThrow();
        expect(updateTransactionActions([propertyAction], propertyAction)).toHaveLength(2);
    });
    it('preserves exact shared renderer and callsite identity for tone', () => {
        const pin: CloudPropertyApproval = { ...propertyPin, path: 'src/app/about/page.tsx', binding: { bindingId: 'tone', label: 'Tone', options: [
            { id: 'light', label: 'Light', value: 'light' }, { id: 'dark', label: 'Dark', value: 'dark' }], target: { kind: 'mapped-callsite-enum', exportName: 'AboutPage', oid: 'call', field: 'tone',
                renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about', callsite: { path: 'src/app/about/page.tsx', exportName: 'AboutPage', oid: 'call' },
                    renderer: { path: 'src/components/page-hero.tsx', exportName: 'PageHero', oid: 'image' } } } } };
        expect(validCloudPropertyApproval(pin)).toBe(true);
        const element = { branchId: pin.branchId, oid: 'image', contentIdentity: { mappingId: 'about', itemId: 'single' } };
        expect(matchesCloudPropertyElement(pin, element)).toBe(true);
        expect(matchesCloudPropertyElement(pin, { ...element, contentIdentity: { mappingId: 'security', itemId: 'single' } })).toBe(false);
        expect(matchesCloudPropertyElement(propertyPin, { branchId: 'branch', oid: 'cta' })).toBe(true);
    });
});
describe('property durable transport and recovery', () => {
    it('saves one exact checked owner and refreshes grants without resetting source', async () => {
        const f = await propertyFixture();
        try {
            expect(await write(f)).toBe(true); expect(f.sent).toHaveLength(1);
            expect(f.sent[0]).toMatchObject({ transport: 'content-property', transportVersion: 1, pin: cloudPropertyWirePin(propertyPin), previousValue: '/about', choiceId: 'contact' });
            expect(f.sent[0]!.changes).toEqual(propertyAction.diffs.map(diff => ({ path: diff.path, content: diff.generated })));
            expect(f.checked[0]!.original).toBe(propertyOriginal); expect(f.content()).toBe(propertyAction.diffs[0]!.generated);
            expect(f.source.state.savedRevision).toBe(2); expect(f.source.state.needsReload).toBe(false); expect(f.source.isPropertyApprovalCurrent(propertyPin)).toBe(true);
            expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
    it('refuses selection loss during recovery persistence before sending', async () => {
        const f = await propertyFixture(); let current = true;
        try {
            f.onRecovery(async () => { current = false; });
            expect(await write(f, () => current)).toBe(false); expect(f.sent).toHaveLength(0); expect(f.content()).toBe(propertyOriginal);
            expect(f.record()?.disposition).toBe('rejected');
        } finally { await f.source.stop(); }
    });
    it('rechecks the exact original under the durable write lock', async () => {
        const f = await propertyFixture();
        try {
            f.onDurable(async () => { f.setContent(propertyOriginal.replace('Later text stays', 'Concurrent')); });
            expect(await write(f)).toBe(false); expect(f.sent).toHaveLength(0); expect(f.content()).toContain('Concurrent');
        } finally { await f.source.stop(); }
    });
    it('retains exact ambiguous identity, validates candidate metadata and safely reconciles after selection changes', async () => {
        const f = await propertyFixture(); let current = true;
        try {
            f.loseAck(true); expect(await write(f, () => current)).toBe(false); expect(f.sent).toHaveLength(2);
            const record = structuredClone(f.record()!);
            expect(cloudRecoveryOperation(record)).toEqual(f.sent[0]!);
            for (const mutate of [(r: CloudRecoveryRecord) => { r.propertyOriginal += '\n'; },
                (r: CloudRecoveryRecord) => { r.operation.choiceId = 'about'; }, (r: CloudRecoveryRecord) => { r.propertyApproval = { ...propertyPin, preparationId: 'other' }; },
                (r: CloudRecoveryRecord) => { r.operation.changes[0]!.content += '\n'; }]) {
                const invalid = structuredClone(record); mutate(invalid); expect(cloudRecoveryOperation(invalid)).toBeNull();
                expect(storedCloudRecoveryRecord(invalid, { ...f.source.scope, actorId: 'actor' })).not.toBeNull();
            }
            f.loseAck(false); current = false; await f.source.retryPending();
            expect(f.sent).toHaveLength(3); expect(f.sent.every(operation => JSON.stringify(operation) === JSON.stringify(f.sent[0]))).toBe(true);
            expect(f.source.state.savedRevision).toBe(2); expect(f.source.state.needsReload).toBe(true); expect(f.content()).toBe(propertyOriginal);
        } finally { await f.source.stop(); }
    });
    it('treats acknowledged refresh failure as saved and requires reload', async () => {
        const f = await propertyFixture();
        try {
            f.failRefresh(); expect(await write(f)).toBe(true); expect(f.sent).toHaveLength(1); expect(f.source.state.saveAcknowledged).toBe(true);
            expect(f.source.state.needsReload).toBe(true); expect(f.content()).toBe(propertyAction.diffs[0]!.generated); expect(f.record()).toBeNull();
        } finally { await f.source.stop(); }
    });
});
