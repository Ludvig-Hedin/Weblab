import { describe, expect, it } from 'bun:test';
import type { CloudImageApproval } from '@weblab/models/actions';
import { cloudImageApprovalIdentity, copyCloudImageBinding, freezeCloudImageApproval, matchesCloudImageElement, validCloudImageApproval } from './cloud-image-approval';

function pin(): CloudImageApproval {
    const asset = { path: 'public/media/about.webp', hash: 'a'.repeat(64), bytes: 100 };
    return { version: 2, projectId: 'projects:one', branchId: 'branches:one', actorId: 'users:one', path: 'src/content/about.ts',
        generation: 2, designRevision: 3, fingerprint: 'b'.repeat(64), binding: { bindingId: 'aboutHero',
            target: { kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' },
            fields: ['src', 'alt'], allowImageUploads: true, originalAsset: asset, aspectRatio: { width: 16, height: 9 },
            allowedAssets: [asset, { path: 'public/media/second.webp', hash: 'c'.repeat(64), bytes: 200 }],
            renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about-hero',
                callsite: { path: 'src/app/about/page.tsx', exportName: 'AboutPage', oid: 'about-mount' },
                renderer: { path: 'src/components/page-hero.tsx', exportName: 'PageHero', oid: 'shared-image' } },
        } };
}
describe('immutable approved image history', () => {
    it('includes every policy and scope fact while ignoring object and choice order', () => {
        const original = pin(), identity = cloudImageApprovalIdentity(original);
        expect(cloudImageApprovalIdentity({ ...original, binding: { ...original.binding, fields: ['alt', 'src'], allowedAssets: [...original.binding.allowedAssets].reverse() } })).toBe(identity);
        for (const change of [{ actorId: 'users:other' }, { projectId: 'projects:other' }, { branchId: 'branches:other' },
            { path: 'src/content/security.ts' }, { generation: 3 }, { designRevision: 4 }, { fingerprint: 'd'.repeat(64) }])
            expect(cloudImageApprovalIdentity({ ...original, ...change })).not.toBe(identity);
        for (const change of [{ fields: ['src'] as const }, { allowImageUploads: false }, { bindingId: 'other' },
            { aspectRatio: { width: 4, height: 3 } }, { allowedAssets: [original.binding.originalAsset] },
            { target: { ...original.binding.target, exportName: 'otherHero' } },
            { originalAsset: { path: 'public/media/original.webp', hash: 'd'.repeat(64), bytes: 300 } },
            { renderMapping: { ...original.binding.renderMapping, mappingId: 'security-hero' } }])
            expect(cloudImageApprovalIdentity({ ...original, binding: { ...original.binding, ...change } })).not.toBe(identity);
    });
    it('captures a deep detached frozen pin and makes fresh writable wire copies', () => {
        const original = pin(), frozen = freezeCloudImageApproval(original), identity = cloudImageApprovalIdentity(frozen);
        const copy = copyCloudImageBinding(frozen.binding);
        copy.fields.pop(); copy.allowedAssets[0]!.bytes = 20; copy.renderMapping.renderer.oid = 'different';
        expect(cloudImageApprovalIdentity(frozen)).toBe(identity);
        expect(frozen.binding).not.toBe(original.binding);
        for (const value of [frozen, frozen.binding, frozen.binding.target, frozen.binding.fields, frozen.binding.allowedAssets,
            frozen.binding.allowedAssets[0], frozen.binding.originalAsset, frozen.binding.aspectRatio, frozen.binding.renderMapping,
            frozen.binding.renderMapping.callsite, frozen.binding.renderMapping.renderer]) expect(Object.isFrozen(value)).toBe(true);
    });
    it('does not retarget a shared renderer to another page, branch or repeated instance', () => {
        const approved = pin(), selected = { branchId: approved.branchId, oid: 'shared-image', contentIdentity: { mappingId: 'about-hero', itemId: 'single' } };
        expect(matchesCloudImageElement(approved, selected)).toBe(true);
        for (const change of [{ branchId: 'branches:other' }, { oid: 'other' }, { contentIdentity: undefined },
            { contentIdentity: { mappingId: 'security-hero', itemId: 'single' } }, { contentIdentity: { mappingId: 'about-hero', itemId: 'repeat' } }])
            expect(matchesCloudImageElement(approved, { ...selected, ...change })).toBe(false);
    });
    it('refuses forged or incomplete persisted policy instead of filling it from current authority', () => {
        const original = pin();
        for (const value of [null, [], { ...original, extra: true }, { ...original, generation: 0 },
            { ...original, fingerprint: original.fingerprint + '\n' }, { ...original, actorId: 'users:one\n' },
            { ...original, path: '../src/content/about.ts' }, { ...original, path: 'src/env.ts' },
            { ...original, binding: { ...original.binding, fields: ['alt'], allowImageUploads: true } },
            { ...original, binding: { ...original.binding, aspectRatio: { width: 32, height: 18 } } },
            { ...original, binding: { ...original.binding, allowedAssets: [] } },
            { ...original, binding: { ...original.binding, fields: new Array(1), allowImageUploads: false } },
            { ...original, binding: { ...original.binding, allowedAssets: new Array(1) } },
            { ...original, binding: { ...original.binding, allowedAssets: [...original.binding.allowedAssets, original.binding.originalAsset] } },
            { ...original, binding: { ...original.binding, originalAsset: { ...original.binding.originalAsset, bytes: 101 } } },
            { ...original, binding: { ...original.binding, target: { ...original.binding.target, allowedAssets: [] } } },
            { ...original, binding: { ...original.binding, renderMapping: { ...original.binding.renderMapping, kind: 'keyed-prop-map' } } }])
            expect(validCloudImageApproval(value)).toBe(false);
        expect(validCloudImageApproval(original)).toBe(true);
    });
});
