import { describe, expect, it } from 'bun:test';
import { readContentImageTarget, replaceContentImageTarget } from '@weblab/parser/src/code-edit/content-image-target';
import { CloudContentContractError } from './cloudContentContract';
import {
    createCloudImageContract, validateCloudImageCandidate,
    type CloudImageContract, type ContentImageBinding, type ContentImageAsset,
} from './cloudContentImageContract';

const aboutPath = 'src/content/about.ts';
// The actual About owner shape: heading array, numeric dimensions and untouched sibling exports.
const about = `import type { CallToActionProps } from '@/components/sections/call-to-action';
export const aboutHero = {
  eyebrowLead: "Stilta",
  eyebrowTail: "Our Mission",
  heading: ["About Us"],
  imageSrc: "/media/about/about-hero.webp",
  imageAlt: "The founders seated together.",
  imageWidth: 2752,
  imageHeight: 1548,
} as const;
// Keep every byte outside the approved literals.
export const aboutMission = { heading: "Protect ideas.", paragraphs: ["Keep this text."] } as const;
`;
const security = `export const securityHero = {
  eyebrowLead: "Stilta", eyebrowTail: "Security",
  heading: ["Security built for", "confidential IP work"],
  imageSrc: "/media/security-hero.webp",
  imageAlt: "Privileged and confidential workspace.",
} as const;
`;
const originalAsset: ContentImageAsset = { path: 'public/media/about/about-hero.webp', hash: 'a'.repeat(64), bytes: 30_000 };
const initialChoice: ContentImageAsset = { path: 'public/media/approved.webp', hash: 'b'.repeat(64), bytes: 40_000 };
const upload: ContentImageAsset = { path: `public/weblab-upload-${'c'.repeat(64)}.webp`, hash: 'c'.repeat(64), bytes: 50_000 };
const aboutBinding: ContentImageBinding = {
    bindingId: 'about.hero', target: { kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' },
    fields: ['src', 'alt'], allowImageUploads: true, originalAsset, aspectRatio: { width: 16, height: 9 },
    allowedAssets: [originalAsset, initialChoice],
    renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about-hero',
        callsite: { path: 'src/app/about/page.tsx', exportName: 'AboutPage', oid: 'unkha:4' },
        renderer: { path: 'src/components/sections/page-hero.tsx', exportName: 'PageHero', oid: 'rpgk:yx' } },
};
const securityBinding: ContentImageBinding = {
    ...aboutBinding, bindingId: 'security.hero', target: { ...aboutBinding.target, exportName: 'securityHero' },
    originalAsset: { path: 'public/media/security-hero.webp', hash: 'd'.repeat(64), bytes: 60_000 },
    allowedAssets: [{ path: 'public/media/security-hero.webp', hash: 'd'.repeat(64), bytes: 60_000 }],
    aspectRatio: { width: 72, height: 29 },
    renderMapping: { ...aboutBinding.renderMapping, mappingId: 'security-hero',
        callsite: { path: 'src/app/security/page.tsx', exportName: 'SecurityPage', oid: ':-v3_t3' } },
};
function edit(source: string, binding: ContentImageBinding, patch: Partial<{ src: string; alt: string }>): string {
    const previous = readContentImageTarget(source, binding.target);
    return replaceContentImageTarget(source, binding.target, previous, { ...previous, ...patch });
}
function rejects(run: () => unknown, code: CloudContentContractError['code']): void {
    expect(run).toThrow(CloudContentContractError);
    expect(run).toThrow(`CLOUD_CONTENT_${code}`);
}
function validate(candidateSource: string, binding = aboutBinding, originalSource = about,
    contract = createCloudImageContract(aboutPath, originalSource, [binding])) {
    return validateCloudImageCandidate({ contract, originalSource, candidateSource });
}

describe('imported image v2 source authority', () => {
    it('edits the actual About and Security object shapes without touching their design', () => {
        for (const [path, originalSource, binding] of [[aboutPath, about, aboutBinding], ['src/content/security.ts', security, securityBinding]] as const) {
            const contract = createCloudImageContract(path, originalSource, [binding]);
            const candidateSource = edit(originalSource, binding, { alt: 'A customer photo, café and family 🙂' });
            expect(validateCloudImageCandidate({ contract, originalSource, candidateSource })).toEqual({ source: candidateSource,
                operations: [{ bindingId: binding.bindingId, field: 'alt', previousValue: readContentImageTarget(originalSource, binding.target).alt,
                    value: 'A customer photo, café and family 🙂' }] });
            expect(createCloudImageContract(path, candidateSource, [binding]).fingerprint).toBe(contract.fingerprint);
        }
    });
    it('returns separate exact operations for one approved source and alt change', () => {
        const candidate = edit(about, aboutBinding, { src: '/media/approved.webp', alt: 'New picture' });
        expect(validate(candidate)).toEqual({ source: candidate, operations: [
            { bindingId: 'about.hero', field: 'src', previousValue: '/media/about/about-hero.webp', value: '/media/approved.webp' },
            { bindingId: 'about.hero', field: 'alt', previousValue: 'The founders seated together.', value: 'New picture' },
        ] });
        expect(validate(about)).toEqual({ source: about, operations: [] });
    });
    it('requires exact reconstruction, refusing formatting, quote-only, comments and sibling edits', () => {
        const edited = edit(about, aboutBinding, { alt: 'Approved' });
        for (const candidate of [edited.replace('imageWidth: 2752', 'imageWidth: 2000'),
            edited.replace('heading: ["About Us"]', 'heading: ["Changed"]'),
            edited.replace('Keep this text.', 'Changed text.'), edited.replace('export const', 'export  const'),
            edited.replace('Keep every byte', 'Changed comment'), edited.replace('"Approved"', "'Approved'"),
            edited.replace('"Approved"', '/* injected */ "Approved"')])
            rejects(() => validate(candidate), 'UNAPPROVED_CHANGE');
    });
    it('never masks an unapproved source or alt field', () => {
        for (const fields of [['src'], ['alt']] as const) {
            const binding: ContentImageBinding = { ...aboutBinding, fields: [...fields], allowImageUploads: fields[0] === 'src' };
            const forbidden = fields[0] === 'src' ? { alt: 'Forbidden' } : { src: '/media/approved.webp' };
            rejects(() => validate(edit(about, binding, forbidden), binding), 'UNAPPROVED_CHANGE');
            const contract = createCloudImageContract(aboutPath, about, [binding]);
            expect(createCloudImageContract(aboutPath, edit(about, binding, forbidden), [binding]).fingerprint).not.toBe(contract.fingerprint);
        }
        const onlySrc: ContentImageBinding = { ...aboutBinding, fields: ['src'] };
        rejects(() => validate(edit(about, onlySrc, { src: '/media/approved.webp', alt: 'Also changed' }), onlySrc), 'UNAPPROVED_CHANGE');
    });
    it('keeps the approval policy immutable across upload, undo and redo', () => {
        const contract = createCloudImageContract(aboutPath, about, [aboutBinding]);
        const candidateSource = edit(about, aboutBinding, { src: upload.path.slice(6) });
        const verifiedUploadAdmissions = [{ bindingId: aboutBinding.bindingId, asset: upload }];
        rejects(() => validateCloudImageCandidate({ contract, originalSource: about, candidateSource }), 'UNAPPROVED_CHANGE');
        expect(validateCloudImageCandidate({ contract, originalSource: about, candidateSource, verifiedUploadAdmissions }).source).toBe(candidateSource);
        expect(createCloudImageContract(aboutPath, candidateSource, [aboutBinding]).fingerprint).toBe(contract.fingerprint);
        expect(contract.bindings[0]!.allowedAssets).toEqual([originalAsset, initialChoice]);
        expect(validateCloudImageCandidate({ contract, originalSource: candidateSource, candidateSource: about }).source).toBe(about);
        expect(validateCloudImageCandidate({ contract, originalSource: about, candidateSource, verifiedUploadAdmissions }).operations).toHaveLength(1);
    });
    it('does not let another binding admission authorize the same blob', () => {
        const originalSource = about + security;
        const contract = createCloudImageContract(aboutPath, originalSource, [aboutBinding, securityBinding]);
        const candidateSource = edit(originalSource, aboutBinding, { src: upload.path.slice(6) });
        rejects(() => validateCloudImageCandidate({ contract, originalSource, candidateSource,
            verifiedUploadAdmissions: [{ bindingId: securityBinding.bindingId, asset: upload }] }), 'UNAPPROVED_CHANGE');
    });
    it('refuses forged, duplicated, unknown-target or excessive admission inputs', () => {
        const contract = createCloudImageContract(aboutPath, about, [aboutBinding]);
        const entry = { bindingId: aboutBinding.bindingId, asset: upload };
        for (const admissions of [[{ ...entry, bindingId: 'unknown' }], [entry, entry],
            [{ ...entry, asset: { ...upload, hash: 'd'.repeat(64) } }],
            [{ ...entry, asset: { ...upload, bytes: 600_001 } }],
            [{ ...entry, asset: { ...upload, storageId: 'untrusted' } }],
            Array.from({ length: 65 }, (_, index) => {
                const hash = index.toString(16).padStart(64, '0');
                return { bindingId: aboutBinding.bindingId, asset: { path: `public/weblab-upload-${hash}.webp`, hash, bytes: 1 } };
            })]) rejects(() => validateCloudImageCandidate({ contract, originalSource: about, candidateSource: about,
                verifiedUploadAdmissions: admissions }), 'INVALID_TARGET');
    });
    it('fingerprints every permission and mapping field without mutating caller inputs', () => {
        const contract = createCloudImageContract(aboutPath, about, [aboutBinding]);
        const changes: Array<(binding: ContentImageBinding) => void> = [
            binding => { binding.bindingId = 'other'; }, binding => { binding.fields = ['src']; },
            binding => { binding.allowImageUploads = false; }, binding => { binding.aspectRatio = { width: 4, height: 3 }; },
            binding => { binding.originalAsset.path = 'public/media/other-original.webp'; }, binding => { binding.allowedAssets[1]!.bytes++; },
            binding => { binding.renderMapping.mappingId = 'other'; }, binding => { binding.renderMapping.renderer.oid = 'other'; },
        ];
        for (const change of changes) {
            const changed = structuredClone(contract); change(changed.bindings[0]!);
            rejects(() => validate(about, aboutBinding, about, changed), 'STALE_CONTRACT');
        }
        expect(aboutBinding.fields).toEqual(['src', 'alt']);
        contract.bindings[0]!.allowedAssets[0]!.bytes++;
        expect(aboutBinding.allowedAssets[0]!.bytes).toBe(30_000);
    });
    it('canonicalizes policy order and keeps fingerprints stable at mask values and empty alt', () => {
        const contract = createCloudImageContract(aboutPath, about, [aboutBinding]);
        expect(createCloudImageContract(aboutPath, about, [{ ...aboutBinding, fields: ['alt', 'src'],
            allowedAssets: [...aboutBinding.allowedAssets].reverse() }]).fingerprint).toBe(contract.fingerprint);
        for (const patch of [{ alt: '' }, { alt: 'Quote " and <text>' }, { src: '/weblab-content-mask.webp', alt: '' }])
            expect(createCloudImageContract(aboutPath, edit(about, aboutBinding, patch), [aboutBinding]).fingerprint).toBe(contract.fingerprint);
    });
    it('refuses unsafe values, malformed source and stale owner structure', () => {
        for (const src of ['https://example.test/a.webp', '//example.test/a.webp', '/media/../a.webp', '/a.webp?x=1', '/a.svg', '/a%20b.webp']) {
            const candidate = about.replace('"/media/about/about-hero.webp"', JSON.stringify(src));
            rejects(() => validate(candidate), 'INVALID_VALUE');
        }
        for (const alt of ['x'.repeat(1_001), 'line\nbreak', '\u0000', '\ud800'])
            rejects(() => validate(about.replace('"The founders seated together."', JSON.stringify(alt))), 'INVALID_VALUE');
        rejects(() => validate('not valid typescript {'), 'INVALID_SOURCE');
        const contract = createCloudImageContract(aboutPath, about, [aboutBinding]);
        rejects(() => validate(about, aboutBinding, about.replace('imageWidth: 2752', 'imageWidth: 1000'), contract), 'STALE_CONTRACT');
        rejects(() => validate(about, aboutBinding, about, { ...contract, version: 1 } as unknown as CloudImageContract), 'STALE_CONTRACT');
    });
    it('refuses duplicate identities, invalid permissions, ratios, assets and unknown policy keys', () => {
        for (const bindings of [[], [aboutBinding, aboutBinding], [aboutBinding, { ...aboutBinding, bindingId: 'different' }],
            [aboutBinding, { ...securityBinding, renderMapping: aboutBinding.renderMapping }], Array.from({ length: 101 }, () => aboutBinding)])
            rejects(() => createCloudImageContract(aboutPath, about + security, bindings), 'INVALID_TARGET');
        const bad: ContentImageBinding[] = [
            { ...aboutBinding, fields: [] }, { ...aboutBinding, fields: ['src', 'src'] },
            { ...aboutBinding, fields: ['alt'], allowImageUploads: true },
            { ...aboutBinding, aspectRatio: { width: 32, height: 18 } },
            { ...aboutBinding, aspectRatio: { width: 0, height: 9 } },
            { ...aboutBinding, allowedAssets: [] }, { ...aboutBinding, allowedAssets: [originalAsset, originalAsset] },
            { ...aboutBinding, allowedAssets: Array.from({ length: 65 }, (_, index) => ({ ...originalAsset, path: `public/${index}.webp` })) },
            { ...aboutBinding, originalAsset: { ...originalAsset, path: 'public/../secret.webp' } },
            { ...aboutBinding, originalAsset: { ...originalAsset, hash: 'bad' } },
            { ...aboutBinding, originalAsset: { ...originalAsset, hash: 'e'.repeat(64) } },
        ];
        for (const binding of bad) rejects(() => createCloudImageContract(aboutPath, about, [binding]), 'INVALID_TARGET');
        const unknown = { ...aboutBinding, futurePolicy: true };
        rejects(() => createCloudImageContract(aboutPath, about, [unknown]), 'INVALID_TARGET');
    });
    it('bounds paths and source bytes', () => {
        for (const path of ['/src/content/about.ts', 'src/../about.ts', 'src/config/about.ts', 'src/about.config.ts', 'src/about.d.ts', 'src\\about.ts'])
            rejects(() => createCloudImageContract(path, about, [aboutBinding]), 'INVALID_TARGET');
        rejects(() => createCloudImageContract(aboutPath, about + ' '.repeat(750_000), [aboutBinding]), 'INVALID_SOURCE');
        rejects(() => createCloudImageContract(aboutPath, about + `/*${'🙂'.repeat(190_000)}*/`, [aboutBinding]), 'INVALID_SOURCE');
    });
    it('rejects trailing line breaks in hashes and every identifier boundary', () => {
        const changes: Array<(binding: ContentImageBinding) => void> = [
            binding => { binding.originalAsset.hash += '\n'; },
            binding => { binding.allowedAssets[1]!.hash += '\n'; },
            binding => { binding.bindingId += '\n'; },
            binding => { binding.target.exportName += '\n'; },
            binding => { binding.renderMapping.mappingId += '\n'; },
            binding => { binding.renderMapping.callsite.exportName += '\n'; },
            binding => { binding.renderMapping.renderer.exportName += '\n'; },
            binding => { binding.renderMapping.callsite.oid += '\n'; },
            binding => { binding.renderMapping.renderer.oid += '\n'; },
        ];
        for (const change of changes) {
            const binding = structuredClone(aboutBinding); change(binding);
            rejects(() => createCloudImageContract(aboutPath, about, [binding]), 'INVALID_TARGET');
        }
        const contract = createCloudImageContract(aboutPath, about, [aboutBinding]);
        rejects(() => validateCloudImageCandidate({ contract, originalSource: about, candidateSource: about,
            verifiedUploadAdmissions: [{ bindingId: aboutBinding.bindingId, asset: { ...upload, hash: upload.hash + '\n' } }] }), 'INVALID_TARGET');
    });
});
