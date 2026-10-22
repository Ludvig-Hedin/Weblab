import type { CloudImageApproval, CloudImageAsset, CloudImageBinding } from '@weblab/models/actions';
import type { DomElement } from '@weblab/models';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, expected: string): value is Record<string, unknown> => object(value) && Object.keys(value).sort().join(',') === expected;
const positive = (value: unknown, max = Number.MAX_SAFE_INTEGER - 1): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
const hint = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[^A-Za-z0-9_.:-]/.test(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && /[A-Za-z_$]/.test(value[0]!) && !/[^A-Za-z0-9_$]/.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
function unicode(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(++index);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
}
const path = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 240 && unicode(value) &&
    !/[\\\s\u0000-\u0020\u007f?#%]/.test(value) && value.split('/').every(part => !!part && !part.startsWith('.'));
const sourcePath = (value: unknown): value is string => path(value) && /^(?:src|app)\/.+\.tsx?$/.test(value) &&
    !value.split('/').some(part => /^(?:node_modules|vendor|dist|build|coverage|env|config|configs)$/i.test(part)) &&
    !/(?:^|\/)(?:env|config|middleware|instrumentation)(?:\.[^/]*)?\.tsx?$/i.test(value) && !/(?:\.config|\.d)\.tsx?$/i.test(value);
const asset = (value: unknown): value is CloudImageAsset => keys(value, 'bytes,hash,path') && path(value.path) &&
    /^public\/.+\.(?:png|jpe?g|webp)$/i.test(value.path) && hash(value.hash) && positive(value.bytes, 32 * 1024 * 1024);
function gcd(a: number, b: number): number { while (b) { const next = a % b; a = b; b = next; } return a; }

export function validCloudImageValue(value: unknown): value is { src: string; alt: string } {
    return keys(value, 'alt,src') && typeof value.src === 'string' && value.src.startsWith('/') && path(`public${value.src}`) &&
        /^\/.+\.(?:png|jpe?g|webp)$/i.test(value.src) && typeof value.alt === 'string' && value.alt.length <= 1000 &&
        !/[\u0000-\u001f\u007f]/.test(value.alt) && unicode(value.alt);
}

export function validCloudImageBinding(value: unknown): value is CloudImageBinding {
    if (!keys(value, 'allowImageUploads,allowedAssets,aspectRatio,bindingId,fields,originalAsset,renderMapping,target') || !hint(value.bindingId)) return false;
    const target = value.target, mapping = value.renderMapping, ratio = value.aspectRatio;
    if (!keys(target, 'altProperty,exportName,kind,srcProperty') || target.kind !== 'object-image' || !identifier(target.exportName) ||
        target.srcProperty !== 'imageSrc' || target.altProperty !== 'imageAlt' || !Array.isArray(value.fields) || !value.fields.length || value.fields.length > 2 ||
        new Set(value.fields).size !== value.fields.length || Array.from(value.fields).some(field => field !== 'src' && field !== 'alt') ||
        typeof value.allowImageUploads !== 'boolean' || (value.allowImageUploads && !value.fields.includes('src')) || !asset(value.originalAsset) ||
        !keys(ratio, 'height,width') || !positive(ratio.width, 8192) || !positive(ratio.height, 8192) || ratio.width * ratio.height > 16_000_000 || gcd(ratio.width, ratio.height) !== 1 ||
        !Array.isArray(value.allowedAssets) || !value.allowedAssets.length || value.allowedAssets.length > 64 || !Array.from(value.allowedAssets).every(asset) ||
        new Set(value.allowedAssets.map(entry => entry.path)).size !== value.allowedAssets.length ||
        !keys(mapping, 'callsite,kind,mappingId,renderer,version') || mapping.version !== 1 || mapping.kind !== 'object-prop-image' || !hint(mapping.mappingId)) return false;
    const original = value.originalAsset;
    if (value.allowedAssets.some(entry => entry.path === original.path && (entry.hash !== original.hash || entry.bytes !== original.bytes))) return false;
    return [mapping.callsite, mapping.renderer].every(part => keys(part, 'exportName,oid,path') && sourcePath(part.path) && identifier(part.exportName) && hint(part.oid));
}

/** Persisted history and recovery are untrusted. A valid pin is not permission by itself. */
export function validCloudImageApproval(value: unknown): value is CloudImageApproval {
    return keys(value, 'actorId,binding,branchId,designRevision,fingerprint,generation,path,projectId,version') && value.version === 2 &&
        [value.projectId, value.branchId, value.actorId].every(hint) && sourcePath(value.path) && positive(value.generation) &&
        positive(value.designRevision) && hash(value.fingerprint) && validCloudImageBinding(value.binding);
}

/** Canonical, detached writable copy for typed backend arguments; never changes the saved pin. */
export function copyCloudImageBinding(binding: CloudImageBinding) {
    return {
        bindingId: binding.bindingId, target: { ...binding.target }, fields: [...binding.fields].sort(),
        allowImageUploads: binding.allowImageUploads, originalAsset: { ...binding.originalAsset }, aspectRatio: { ...binding.aspectRatio },
        allowedAssets: binding.allowedAssets.map(entry => ({ ...entry })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
        renderMapping: { ...binding.renderMapping, callsite: { ...binding.renderMapping.callsite }, renderer: { ...binding.renderMapping.renderer } },
    };
}
export function cloudImageApprovalIdentity(pin: CloudImageApproval): string {
    if (!validCloudImageApproval(pin)) throw new Error('Invalid image approval');
    const b = copyCloudImageBinding(pin.binding), m = b.renderMapping;
    const tuple = (a: CloudImageAsset) => [a.path, a.hash, a.bytes];
    return JSON.stringify([pin.version, pin.projectId, pin.branchId, pin.actorId, pin.path, pin.generation, pin.designRevision, pin.fingerprint,
        b.bindingId, [b.target.kind, b.target.exportName, b.target.srcProperty, b.target.altProperty], b.fields, b.allowImageUploads,
        tuple(b.originalAsset), [b.aspectRatio.width, b.aspectRatio.height], b.allowedAssets.map(tuple),
        [m.version, m.kind, m.mappingId, m.callsite.path, m.callsite.exportName, m.callsite.oid, m.renderer.path, m.renderer.exportName, m.renderer.oid]]);
}
export function freezeCloudImageApproval(pin: CloudImageApproval): CloudImageApproval {
    if (!validCloudImageApproval(pin)) throw new Error('Invalid image approval');
    const b = copyCloudImageBinding(pin.binding);
    return Object.freeze({ ...pin, binding: Object.freeze({ ...b, target: Object.freeze(b.target), fields: Object.freeze(b.fields),
        originalAsset: Object.freeze(b.originalAsset), aspectRatio: Object.freeze(b.aspectRatio), allowedAssets: Object.freeze(b.allowedAssets.map(entry => Object.freeze(entry))),
        renderMapping: Object.freeze({ ...b.renderMapping, callsite: Object.freeze(b.renderMapping.callsite), renderer: Object.freeze(b.renderMapping.renderer) }),
    }) });
}
export function matchesCloudImageElement(pin: CloudImageApproval, element: Pick<DomElement, 'branchId' | 'oid' | 'contentIdentity'>): boolean {
    return validCloudImageApproval(pin) && element.branchId === pin.branchId && element.oid === pin.binding.renderMapping.renderer.oid &&
        element.contentIdentity?.mappingId === pin.binding.renderMapping.mappingId && element.contentIdentity.itemId === 'single';
}
