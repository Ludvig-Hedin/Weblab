'use node';

// Node-only source authority. Callers verify saved mappings, actor, epoch and asset provenance.
import { createHash } from 'node:crypto';
import { parse, type T } from '@weblab/parser/src/packages';
import {
    ContentImageTargetError, readContentImageTarget, replaceContentImageTarget,
    type ContentImageTarget,
} from '@weblab/parser/src/code-edit/content-image-target';
import type { ObjectImageRenderMapping } from '@weblab/parser/src/code-edit/content-image-render-mapping';
import { CloudContentContractError } from './cloudContentContract';

export interface ContentImageAsset { path: string; hash: string; bytes: number }
export interface ContentImageBinding {
    bindingId: string;
    target: ContentImageTarget;
    fields: Array<'src' | 'alt'>;
    allowImageUploads: boolean;
    originalAsset: ContentImageAsset;
    aspectRatio: { width: number; height: number };
    allowedAssets: ContentImageAsset[];
    renderMapping: ObjectImageRenderMapping;
}
export interface CloudImageContract {
    version: 2;
    path: string;
    bindings: ContentImageBinding[];
    fingerprint: string;
}
export interface CloudImageOperation {
    bindingId: string;
    field: 'src' | 'alt';
    previousValue: string;
    value: string;
}
/** Internal caller input, never a browser claim or a storage-authority substitute. */
export interface VerifiedImageUploadAdmission { bindingId: string; asset: ContentImageAsset }

const MAX_BINDINGS = 100;
const MAX_CHOICES = 64;
const MAX_REFERENCES = 400;
function identifier(value: string): boolean {
    return typeof value === 'string' && value.length > 0 && value.length <= 160
        && /[A-Za-z_$]/.test(value[0]!) && !/[^A-Za-z0-9_$]/.test(value);
}
function hint(value: string): boolean {
    return typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[^A-Za-z0-9_.:-]/.test(value);
}
function fail(code: CloudContentContractError['code']): never { throw new CloudContentContractError(code); }
function keys(value: unknown, names: string): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).sort().join(',') === names;
}
function pathParts(path: string): boolean {
    return typeof path === 'string' && path.length <= 240 && unicode(path) && !/[\\\s\u0000-\u0020\u007f?#%]/.test(path)
        && path.split('/').every(part => !!part && !part.startsWith('.'));
}
function checkPath(path: string): void {
    if (!pathParts(path) || !/^(?:src|app)\/.+\.tsx?$/.test(path)
        || path.split('/').some(part => /^(?:node_modules|vendor|dist|build|coverage|env|config|configs)$/i.test(part))
        || /(?:^|\/)(?:env|config|middleware|instrumentation)(?:\.[^/]*)?\.tsx?$/i.test(path)
        || /(?:\.config|\.d)\.tsx?$/i.test(path)) fail('INVALID_TARGET');
}
function checkAsset(asset: ContentImageAsset, maxBytes = 32 * 1024 * 1024): void {
    if (!keys(asset, 'bytes,hash,path') || !pathParts(asset.path) || !/^public\/.+\.(?:png|jpe?g|webp)$/i.test(asset.path)
        || typeof asset.hash !== 'string' || asset.hash.length !== 64 || /[^a-f0-9]/.test(asset.hash)
        || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > maxBytes) fail('INVALID_TARGET');
}
function parseSource(source: string): T.File {
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 750_000 || !unicode(source)) fail('INVALID_SOURCE');
    try { return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }); }
    catch { return fail('INVALID_SOURCE'); }
}
function targetCall<Result>(operation: () => Result): Result {
    try { return operation(); } catch (error) {
        if (!(error instanceof ContentImageTargetError)) throw error;
        if (error.code === 'INVALID_SOURCE' || error.code === 'INVALID_VALUE') fail(error.code);
        if (error.code === 'PREVIOUS_VALUE_MISMATCH') fail('STALE_CONTRACT');
        return fail('INVALID_TARGET');
    }
}
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
function checkValue(value: { src: string; alt: string }): void {
    if (typeof value.src !== 'string' || !value.src.startsWith('/') || !pathParts(`public${value.src}`)
        || !/^\/.+\.(?:png|jpe?g|webp)$/i.test(value.src) || !unicode(value.src)
        || typeof value.alt !== 'string' || value.alt.length > 1_000 || /[\u0000-\u001f\u007f]/.test(value.alt)
        || !unicode(value.alt)) fail('INVALID_VALUE');
}
function gcd(a: number, b: number): number { while (b) { const next = a % b; a = b; b = next; } return a; }
function checkBindings(bindings: ContentImageBinding[]): void {
    if (!Array.isArray(bindings) || !bindings.length || bindings.length > MAX_BINDINGS) fail('INVALID_TARGET');
    const ids = new Set<string>(), targets = new Set<string>(), mappings = new Set<string>(), callsites = new Set<string>();
    let references = 0;
    const assetTuples = new Map<string, string>();
    const rememberAsset = (asset: ContentImageAsset) => {
        checkAsset(asset);
        const tuple = JSON.stringify([asset.hash, asset.bytes]);
        if (assetTuples.has(asset.path) && assetTuples.get(asset.path) !== tuple) fail('INVALID_TARGET');
        assetTuples.set(asset.path, tuple);
    };
    for (const binding of bindings) {
        if (!keys(binding, 'allowImageUploads,allowedAssets,aspectRatio,bindingId,fields,originalAsset,renderMapping,target')
            || !hint(binding.bindingId) || ids.has(binding.bindingId)) fail('INVALID_TARGET');
        const target = binding.target;
        if (!keys(target, 'altProperty,exportName,kind,srcProperty') || target.kind !== 'object-image'
            || !identifier(target.exportName)
            || target.srcProperty !== 'imageSrc' || target.altProperty !== 'imageAlt' || targets.has(target.exportName)) fail('INVALID_TARGET');
        if (!Array.isArray(binding.fields) || !binding.fields.length || binding.fields.length > 2
            || new Set(binding.fields).size !== binding.fields.length || binding.fields.some(field => field !== 'src' && field !== 'alt')
            || typeof binding.allowImageUploads !== 'boolean' || (binding.allowImageUploads && !binding.fields.includes('src'))) fail('INVALID_TARGET');
        rememberAsset(binding.originalAsset);
        const ratio = binding.aspectRatio;
        if (!keys(ratio, 'height,width') || !Number.isSafeInteger(ratio.width) || !Number.isSafeInteger(ratio.height)
            || ratio.width < 1 || ratio.height < 1 || ratio.width > 8192 || ratio.height > 8192
            || ratio.width * ratio.height > 16_000_000 || gcd(ratio.width, ratio.height) !== 1) fail('INVALID_TARGET');
        if (!Array.isArray(binding.allowedAssets) || !binding.allowedAssets.length || binding.allowedAssets.length > MAX_CHOICES) fail('INVALID_TARGET');
        const paths = new Set<string>();
        for (const asset of binding.allowedAssets) {
            rememberAsset(asset);
            if (paths.has(asset.path)) fail('INVALID_TARGET');
            paths.add(asset.path);
        }
        references += binding.allowedAssets.length;
        if (references > MAX_REFERENCES) fail('INVALID_TARGET');
        const mapping = binding.renderMapping;
        if (!keys(mapping, 'callsite,kind,mappingId,renderer,version') || mapping.version !== 1
            || mapping.kind !== 'object-prop-image' || !hint(mapping.mappingId) || mappings.has(mapping.mappingId)) fail('INVALID_TARGET');
        for (const entry of [mapping.callsite, mapping.renderer]) {
            if (!keys(entry, 'exportName,oid,path') || !identifier(entry.exportName) || !hint(entry.oid)) fail('INVALID_TARGET');
            checkPath(entry.path);
        }
        const callsite = canonical(mapping.callsite);
        if (callsites.has(callsite)) fail('INVALID_TARGET');
        ids.add(binding.bindingId); targets.add(target.exportName); mappings.add(mapping.mappingId); callsites.add(callsite);
    }
}
/** Ignore source positions/raw spelling while preserving syntax, directives and comments. */
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        const record = entry as Record<string, unknown>;
        return Object.fromEntries(Object.keys(record).sort().filter(key => !['start', 'end', 'loc'].includes(key)
            && !(key === 'extra' && record.type !== 'DirectiveLiteral')).map(key => [key, record[key]]));
    });
}
function normalizedBindings(bindings: ContentImageBinding[]): ContentImageBinding[] {
    return structuredClone(bindings).map(binding => ({ ...binding, fields: binding.fields.sort(),
        allowedAssets: binding.allowedAssets.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    })).sort((a, b) => a.bindingId < b.bindingId ? -1 : a.bindingId > b.bindingId ? 1 : 0);
}
function fingerprint(path: string, source: string, bindings: ContentImageBinding[]): string {
    const original = parseSource(source);
    let masked = source;
    for (const binding of bindings) {
        const previous = targetCall(() => readContentImageTarget(masked, binding.target));
        checkValue(previous);
        const value = { src: binding.fields.includes('src') ? '/weblab-content-mask.webp' : previous.src,
            alt: binding.fields.includes('alt') ? '' : previous.alt };
        masked = targetCall(() => replaceContentImageTarget(masked, binding.target, previous, value));
    }
    return createHash('sha256').update(canonical({ version: 2, path, bindings }))
        .update('\n').update(canonical({ ast: parseSource(masked), comments: original.comments ?? [] })).digest('hex');
}
export function createCloudImageContract(path: string, source: string, bindings: ContentImageBinding[]): CloudImageContract {
    checkPath(path); checkBindings(bindings);
    const approved = normalizedBindings(bindings);
    return { version: 2, path, bindings: approved, fingerprint: fingerprint(path, source, approved) };
}
function admittedPaths(bindings: ContentImageBinding[], admissions: VerifiedImageUploadAdmission[]): Map<string, Set<string>> {
    if (!Array.isArray(admissions) || admissions.length > MAX_REFERENCES) fail('INVALID_TARGET');
    const result = new Map<string, Set<string>>();
    const assets = new Map(bindings.flatMap(binding => [binding.originalAsset, ...binding.allowedAssets]).map(asset => [asset.path, asset]));
    for (const admission of admissions) {
        if (!keys(admission, 'asset,bindingId') || !bindings.some(binding => binding.bindingId === admission.bindingId && binding.allowImageUploads)) fail('INVALID_TARGET');
        checkAsset(admission.asset, 600_000);
        if (admission.asset.path !== `public/weblab-upload-${admission.asset.hash}.webp`) fail('INVALID_TARGET');
        const known = assets.get(admission.asset.path);
        if (known && (known.hash !== admission.asset.hash || known.bytes !== admission.asset.bytes)) fail('INVALID_TARGET');
        assets.set(admission.asset.path, admission.asset);
        const paths = result.get(admission.bindingId) ?? new Set<string>();
        if (paths.has(admission.asset.path) || paths.size >= MAX_CHOICES) fail('INVALID_TARGET');
        paths.add(admission.asset.path); result.set(admission.bindingId, paths);
    }
    return result;
}
/** The trusted caller verifies each admission's exact actor-independent target/approval identity,
 * generation, epoch, fingerprint and effective storage tuple before supplying it here.
 * This helper neither creates admissions nor establishes asset ownership or upload authority. */
export function validateCloudImageCandidate(input: {
    contract: CloudImageContract;
    originalSource: string;
    candidateSource: string;
    verifiedUploadAdmissions?: VerifiedImageUploadAdmission[];
}): { source: string; operations: CloudImageOperation[] } {
    const { contract, originalSource, candidateSource } = input;
    if (!contract || contract.version !== 2) fail('STALE_CONTRACT');
    checkPath(contract.path); checkBindings(contract.bindings);
    const bindings = normalizedBindings(contract.bindings);
    if (fingerprint(contract.path, originalSource, bindings) !== contract.fingerprint) fail('STALE_CONTRACT');
    parseSource(candidateSource);
    const admissions = admittedPaths(bindings, input.verifiedUploadAdmissions ?? []);
    let source = originalSource;
    const operations: CloudImageOperation[] = [];
    for (const binding of bindings) {
        const previous = targetCall(() => readContentImageTarget(originalSource, binding.target));
        const value = targetCall(() => readContentImageTarget(candidateSource, binding.target));
        checkValue(value);
        for (const field of ['src', 'alt'] as const) {
            if (previous[field] === value[field]) continue;
            if (!binding.fields.includes(field)) fail('UNAPPROVED_CHANGE');
            if (field === 'src' && !binding.allowedAssets.some(asset => asset.path === `public${value.src}`)
                && !admissions.get(binding.bindingId)?.has(`public${value.src}`)) fail('UNAPPROVED_CHANGE');
            operations.push({ bindingId: binding.bindingId, field, previousValue: previous[field], value: value[field] });
        }
        source = targetCall(() => replaceContentImageTarget(source, binding.target, previous, value));
    }
    if (source !== candidateSource) fail('UNAPPROVED_CHANGE');
    if (fingerprint(contract.path, source, bindings) !== contract.fingerprint) fail('UNAPPROVED_CHANGE');
    return { source, operations };
}
